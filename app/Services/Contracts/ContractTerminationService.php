<?php

namespace App\Services\Contracts;

use App\Models\Contract;
use App\Models\ContractCondition;
use App\Models\ContractLink;
use App\Models\ContractParty;
use App\Models\ContractTermination;
use App\Models\ContractUnit;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ContractTerminationService
{
    private const LIFECYCLE_MODELS = [
        'parties' => ContractParty::class,
        'units' => ContractUnit::class,
        'conditions' => ContractCondition::class,
    ];

    public function __construct(
        private readonly ContractTerminationCalculator $calculator,
    ) {}

    /** @param array<string, mixed> $values */
    public function createWithLinked(Contract $contract, array $values, array $linkedContractIds = []): ContractTermination
    {
        return DB::transaction(function () use ($contract, $values, $linkedContractIds): ContractTermination {
            $contract = Contract::query()->lockForUpdate()->findOrFail($contract->id);
            $termination = $this->createLocked($contract, $values);
            $this->synchronizeLinkedContracts($contract, $termination, $linkedContractIds);

            return $termination->fresh();
        }, 3);
    }

    /** @param array<string, mixed> $values */
    public function updateWithLinked(Contract $contract, ContractTermination $termination, array $values, array $linkedContractIds = []): ContractTermination
    {
        return DB::transaction(function () use ($contract, $termination, $values, $linkedContractIds): ContractTermination {
            $contract = Contract::query()->lockForUpdate()->findOrFail($contract->id);
            $termination = ContractTermination::query()->lockForUpdate()->findOrFail($termination->id);
            $this->ensureOwned($contract, $termination);

            $termination = $this->updateLocked($contract, $termination, $values, true);
            $this->synchronizeLinkedContracts($contract, $termination, $linkedContractIds);

            return $termination->fresh();
        }, 3);
    }

    /** @param array<string, mixed> $values */
    public function create(Contract $contract, array $values): ContractTermination
    {
        return DB::transaction(function () use ($contract, $values): ContractTermination {
            $contract = Contract::query()->lockForUpdate()->findOrFail($contract->id);

            return $this->createLocked($contract, $values);
        }, 3);
    }

    /** @param array<string, mixed> $values */
    public function update(Contract $contract, ContractTermination $termination, array $values): ContractTermination
    {
        return DB::transaction(function () use ($contract, $termination, $values): ContractTermination {
            $contract = Contract::query()->lockForUpdate()->findOrFail($contract->id);
            $termination = ContractTermination::query()->lockForUpdate()->findOrFail($termination->id);
            $this->ensureOwned($contract, $termination);

            return $this->updateLocked($contract, $termination, $values, true);
        }, 3);
    }

    public function delete(Contract $contract, ContractTermination $termination): void
    {
        DB::transaction(function () use ($contract, $termination): void {
            $contract = Contract::query()->lockForUpdate()->findOrFail($contract->id);
            $termination = ContractTermination::query()->lockForUpdate()->findOrFail($termination->id);
            $this->ensureOwned($contract, $termination);
            $this->deleteLocked($contract, $termination);
        }, 3);
    }

    /**
     * Synchronize persisted contract statuses once a previously confirmed future
     * end date becomes effective. Party, unit and condition rows are already
     * stamped with their valid_until date when the termination is saved.
     */
    public function synchronizeDueTerminations(): int
    {
        $updated = 0;
        $terminationIds = ContractTermination::query()
            ->whereNotNull('confirmed_end_on')
            ->whereDate('confirmed_end_on', '<=', today())
            ->whereHas('contract', fn ($query) => $query->whereNotIn('status', ['ended', 'cancelled', 'archived']))
            ->pluck('id');

        foreach ($terminationIds as $terminationId) {
            $changed = DB::transaction(function () use ($terminationId): bool {
                $termination = ContractTermination::query()->lockForUpdate()->find($terminationId);
                if (! $termination) {
                    return false;
                }

                $contract = Contract::query()->lockForUpdate()->find($termination->contract_id);
                if (! $contract || in_array($contract->status, ['ended', 'cancelled', 'archived'], true)) {
                    return false;
                }

                $before = $contract->status;
                $this->syncContractLifecycle($contract, $termination);

                return $contract->fresh()->status !== $before;
            }, 3);

            if ($changed) {
                $updated++;
            }
        }

        return $updated;
    }

    /** @param array<string, mixed> $values */
    private function createLocked(Contract $contract, array $values, ?string $syncSourceTerminationId = null): ContractTermination
    {
        if (in_array($contract->status, ['ended', 'cancelled', 'archived'], true)) {
            throw ValidationException::withMessages([
                'termination' => 'Für diesen Vertrag kann keine neue Kündigung erfasst werden.',
            ]);
        }

        if ($contract->terminations()->lockForUpdate()->exists()) {
            throw ValidationException::withMessages([
                'termination' => 'Für diesen Vertrag existiert bereits ein Kündigungs- oder Beendigungsvorgang. Bearbeiten Sie den vorhandenen Vorgang.',
            ]);
        }

        $termination = $contract->terminations()->create([
            ...$this->databaseValues($contract, $values),
            'sync_source_termination_id' => $syncSourceTerminationId,
        ]);

        $this->applyLifecycleEnd($contract, $termination);
        $this->syncContractLifecycle($contract, $termination);

        return $termination->fresh();
    }

    /** @param array<string, mixed> $values */
    private function updateLocked(Contract $contract, ContractTermination $termination, array $values, bool $detachFromSource): ContractTermination
    {
        $this->rollbackLifecycleEnd($contract, $termination);

        $payload = $this->databaseValues($contract, $values);
        if ($detachFromSource && $termination->sync_source_termination_id) {
            $payload['sync_source_termination_id'] = null;
        }

        $termination->updateOrFail($payload);
        $this->applyLifecycleEnd($contract, $termination);
        $this->syncContractLifecycle($contract, $termination);

        return $termination->fresh();
    }

    private function deleteLocked(Contract $contract, ContractTermination $termination): void
    {
        $children = ContractTermination::query()
            ->where('sync_source_termination_id', $termination->id)
            ->lockForUpdate()
            ->get();

        foreach ($children as $child) {
            $childContract = Contract::query()->lockForUpdate()->find($child->contract_id);
            if ($childContract) {
                $this->deleteLocked($childContract, $child);
            }
        }

        $terminationWasEffective = $termination->confirmed_end_on
            && CarbonImmutable::parse($termination->confirmed_end_on)->startOfDay()->lte(today());

        $this->rollbackLifecycleEnd($contract, $termination);
        $termination->deleteOrFail();
        $this->restoreContractLifecycleAfterRemoval($contract, (bool) $terminationWasEffective);
    }

    /** @param array<string, mixed> $values */
    private function databaseValues(Contract $contract, array $values): array
    {
        $systemEnd = $this->calculator->suggestedEndDate(
            $contract,
            $values['terminationType'],
            $values['initiatedBy'],
            $values['receivedOn'],
            $values['requestedEndOn'] ?? null,
        );

        return [
            'termination_type' => $values['terminationType'],
            'initiated_by' => $values['initiatedBy'],
            'received_on' => $values['receivedOn'],
            'requested_end_on' => $values['requestedEndOn'] ?? null,
            'system_determined_end_on' => $systemEnd,
            'confirmed_end_on' => $values['confirmedEndOn'] ?? $systemEnd,
            'reason_type' => $values['reasonType'] ?? null,
            'reason_text' => $values['reasonText'] ?? null,
            'note' => $values['note'] ?? null,
        ];
    }

    /** @param array<int, string> $linkedContractIds */
    private function synchronizeLinkedContracts(Contract $sourceContract, ContractTermination $sourceTermination, array $linkedContractIds): void
    {
        $ids = collect($linkedContractIds)
            ->map(fn ($id): string => (string) $id)
            ->filter()
            ->unique()
            ->values();

        $linkedContracts = $ids->isEmpty()
            ? collect()
            : $this->selectedLinkedContracts($sourceContract, $ids);
        $selectedIds = $linkedContracts
            ->map(fn (Contract $contract): string => (string) $contract->id)
            ->values();

        $autoChildren = ContractTermination::query()
            ->where('sync_source_termination_id', $sourceTermination->id)
            ->lockForUpdate()
            ->get();

        foreach ($autoChildren as $child) {
            if ($selectedIds->contains((string) $child->contract_id)) {
                continue;
            }

            $childContract = Contract::query()->lockForUpdate()->find($child->contract_id);
            if ($childContract) {
                $this->deleteLocked($childContract, $child);
            }
        }

        $values = $this->valuesFromTermination($sourceTermination);

        foreach ($linkedContracts as $linkedContract) {
            $linkedContract = Contract::query()->lockForUpdate()->findOrFail($linkedContract->id);
            $autoChild = ContractTermination::query()
                ->where('contract_id', $linkedContract->id)
                ->where('sync_source_termination_id', $sourceTermination->id)
                ->lockForUpdate()
                ->first();

            if ($autoChild) {
                $this->updateLocked($linkedContract, $autoChild, $values, false);
                continue;
            }

            if (in_array($linkedContract->status, ['ended', 'cancelled', 'archived'], true)) {
                throw ValidationException::withMessages([
                    'linkedContractIds' => "Der verknüpfte Vertrag {$linkedContract->contract_number} ist bereits abgeschlossen und kann nicht durch diesen Vorgang mitbeendet werden.",
                ]);
            }

            if ($linkedContract->terminations()->lockForUpdate()->exists()) {
                throw ValidationException::withMessages([
                    'linkedContractIds' => "Der verknüpfte Vertrag {$linkedContract->contract_number} besitzt bereits einen eigenen Beendigungsvorgang. Bitte prüfen Sie diesen Vertrag separat.",
                ]);
            }

            $this->createLocked($linkedContract, $values, (string) $sourceTermination->id);
        }
    }

    /** @return array<string, mixed> */
    private function valuesFromTermination(ContractTermination $termination): array
    {
        return [
            'terminationType' => $termination->termination_type,
            'initiatedBy' => $termination->initiated_by,
            'receivedOn' => $termination->received_on?->toDateString(),
            'requestedEndOn' => $termination->requested_end_on?->toDateString(),
            'confirmedEndOn' => $termination->confirmed_end_on?->toDateString(),
            'reasonType' => $termination->reason_type,
            'reasonText' => $termination->reason_text,
            'note' => $termination->note,
        ];
    }

    /** @param Collection<int, string> $ids @return Collection<int, Contract> */
    private function selectedLinkedContracts(Contract $sourceContract, Collection $ids): Collection
    {
        $allowedIds = ContractLink::query()
            ->where('contract_id', $sourceContract->id)
            ->whereIn('linked_contract_id', $ids->all())
            ->orderBy('sort_order')
            ->pluck('linked_contract_id')
            ->map(fn ($id): string => (string) $id);

        if ($allowedIds->count() !== $ids->count()) {
            throw ValidationException::withMessages([
                'linkedContractIds' => 'Mindestens ein ausgewählter Vertrag ist nicht direkt mit dem Hauptvertrag verknüpft.',
            ]);
        }

        $contracts = Contract::query()
            ->whereIn('id', $allowedIds->all())
            ->lockForUpdate()
            ->get()
            ->keyBy(fn (Contract $contract): string => (string) $contract->id);

        return $allowedIds->map(function (string $id) use ($contracts): Contract {
            $contract = $contracts->get($id);
            if (! $contract) {
                throw ValidationException::withMessages([
                    'linkedContractIds' => 'Ein ausgewählter verknüpfter Vertrag ist nicht mehr verfügbar.',
                ]);
            }

            return $contract;
        });
    }

    private function applyLifecycleEnd(Contract $contract, ContractTermination $termination): void
    {
        $endDate = $termination->confirmed_end_on?->toDateString();
        if (! $endDate) {
            $termination->forceFill(['lifecycle_sync_snapshot' => null])->saveQuietly();
            return;
        }

        $snapshot = ['endDate' => $endDate];
        foreach (self::LIFECYCLE_MODELS as $key => $modelClass) {
            $snapshot[$key] = $this->closeOpenLifecycleRows($modelClass, (string) $contract->id, $endDate);
        }

        $termination->forceFill(['lifecycle_sync_snapshot' => $snapshot])->saveQuietly();
    }

    /** @return array<int, string> */
    private function closeOpenLifecycleRows(string $modelClass, string $contractId, string $endDate): array
    {
        $query = $modelClass::query()
            ->where('contract_id', $contractId)
            ->whereNull('valid_until')
            ->where(function ($query) use ($endDate): void {
                $query->whereNull('valid_from')->orWhereDate('valid_from', '<=', $endDate);
            });

        $ids = $query->lockForUpdate()->pluck('id')->map(fn ($id): string => (string) $id)->all();
        if ($ids === []) {
            return [];
        }

        $modelClass::query()
            ->whereKey($ids)
            ->whereNull('valid_until')
            ->update(['valid_until' => $endDate, 'updated_at' => now()]);

        return $ids;
    }

    private function rollbackLifecycleEnd(Contract $contract, ContractTermination $termination): void
    {
        $snapshot = is_array($termination->lifecycle_sync_snapshot) ? $termination->lifecycle_sync_snapshot : null;
        $endDate = is_array($snapshot) ? ($snapshot['endDate'] ?? null) : null;
        if (! is_string($endDate) || $endDate === '') {
            return;
        }

        foreach (self::LIFECYCLE_MODELS as $key => $modelClass) {
            $ids = collect($snapshot[$key] ?? [])->map(fn ($id): string => (string) $id)->filter()->values()->all();
            if ($ids === []) {
                continue;
            }

            $modelClass::query()
                ->where('contract_id', $contract->id)
                ->whereKey($ids)
                ->whereDate('valid_until', '=', $endDate)
                ->update(['valid_until' => null, 'updated_at' => now()]);
        }

        $termination->forceFill(['lifecycle_sync_snapshot' => null])->saveQuietly();
    }

    private function syncContractLifecycle(Contract $contract, ContractTermination $termination): void
    {
        $effective = $termination->confirmed_end_on
            && CarbonImmutable::parse($termination->confirmed_end_on)->startOfDay()->lte(today());

        if ($effective && $contract->status !== 'ended') {
            $contract->forceFill(['status' => 'ended'])->saveOrFail();
            return;
        }

        if (! $effective && $contract->status === 'ended' && ! $this->hasNaturallyExpired($contract)) {
            $contract->forceFill(['status' => 'active'])->saveOrFail();
        }
    }

    private function restoreContractLifecycleAfterRemoval(Contract $contract, bool $terminationWasEffective): void
    {
        if ($contract->status === 'ended' && $terminationWasEffective && ! $this->hasNaturallyExpired($contract)) {
            $contract->forceFill(['status' => 'active'])->saveOrFail();
        }
    }

    private function hasNaturallyExpired(Contract $contract): bool
    {
        return $contract->term_type === 'fixed'
            && $contract->fixed_until
            && CarbonImmutable::parse($contract->fixed_until)->endOfDay()->lt(now());
    }

    private function ensureOwned(Contract $contract, ContractTermination $termination): void
    {
        abort_unless((string) $termination->contract_id === (string) $contract->id, 404);
    }
}
