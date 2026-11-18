<?php

namespace App\Services\Finance;

use App\Models\Contract;
use App\Models\ContractCondition;
use App\Models\OpenItem;
use App\Models\Property;
use Carbon\CarbonImmutable;
use Carbon\CarbonPeriod;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ReceivableGenerationService
{
    private const KEY_LOOKUP_BATCH_SIZE = 500;
    private const MAX_PREVIEW_ROWS = 20000;
    public function preview(CarbonImmutable $periodFrom, CarbonImmutable $periodUntil, ?array $contractIds, ?array $propertyIds = null, ?array $unitIds = null): array
    {
        return $this->buildPreview($periodFrom, $periodUntil, $contractIds, $propertyIds, $unitIds)->values()->all();
    }

    /**
     * Lightweight, period-aware picker scope. Do not build every monthly
     * receivable just to determine the selectable active contract units.
     *
     * @return array{properties: array<int, array<string, mixed>>, activeUnitIds: array<int, string>}
     */
    public function scopeForPeriod(CarbonImmutable $periodFrom, CarbonImmutable $periodUntil): array
    {
        $from = $periodFrom->startOfMonth();
        $until = $periodUntil->startOfMonth();

        if ($until->lt($from) || $from->diffInMonths($until) > 36) {
            throw ValidationException::withMessages([
                'periodUntil' => 'Der Zeitraum muss aufsteigend sein und darf maximal 36 Monate umfassen.',
            ]);
        }

        // Two bounded Eloquent queries: properties and their matching units.
        // Contract IDs remain in a SQL subquery; do not hydrate monthly previews
        // or send thousands of UUIDs from PHP back into an IN (...) clause.
        $eligibleUnits = static function (Builder $query) use ($from, $until): void {
            $contractUnits = Contract::query()
                ->select('main_unit_id')
                ->where('status', 'active')
                ->where('starts_on', '<=', $until->endOfMonth()->toDateString())
                ->where(fn (Builder $contracts) => $contracts
                    ->where('term_type', '!=', 'fixed')
                    ->orWhereNull('fixed_until')
                    ->orWhere('fixed_until', '>=', $from->toDateString()));

            $query->where('units.status', 'active')
                ->whereIn('units.id', $contractUnits);
        };

        $eligibleProperties = Property::query()
            ->select(['id', 'property_number', 'name', 'address', 'postal_code', 'city'])
            ->where('status', '!=', 'archived')
            ->whereHas('units', $eligibleUnits)
            ->with(['units' => static function (Builder $units) use ($eligibleUnits): void {
                $eligibleUnits($units);
                $units->select(['id', 'property_id', 'unit_number', 'name'])->orderBy('unit_number');
            }])
            ->orderBy('property_number')
            ->get();

        $properties = [];
        $activeUnitIds = [];
        foreach ($eligibleProperties as $property) {
            $units = [];
            foreach ($property->units as $unit) {
                $units[] = [
                    'id' => (string) $unit->id,
                    'label' => $unit->unit_number.' · '.$unit->name,
                ];
                $activeUnitIds[] = (string) $unit->id;
            }

            $properties[] = [
                'id' => (string) $property->id,
                'label' => $property->property_number.' · '.$property->name,
                'description' => $property->full_address ?: null,
                'units' => $units,
            ];
        }

        return ['properties' => array_values($properties), 'activeUnitIds' => $activeUnitIds];
    }

    public function generate(
        CarbonImmutable $periodFrom,
        CarbonImmutable $periodUntil,
        ?array $contractIds,
        ?string $createdBy = null,
        ?array $selectedKeys = null,
        ?array $propertyIds = null,
        ?array $unitIds = null,
    ): array {
        $preview = $this->buildPreview($periodFrom, $periodUntil, $contractIds, $propertyIds, $unitIds, $selectedKeys);
        if ($selectedKeys !== null) {
            $selected = collect($selectedKeys)->filter()->unique()->values();
            $unknown = $selected->diff($preview->pluck('key'));
            if ($unknown->isNotEmpty()) {
                throw ValidationException::withMessages(['selectedKeys' => 'Mindestens eine ausgewählte Sollstellung ist nicht mehr verfügbar. Bitte Vorschau aktualisieren.']);
            }
            $preview = $preview->whereIn('key', $selected)->values();
        }

        $result = DB::transaction(function () use ($preview): array {
            $created = [];
            $duplicates = [];
            $skipped = [];
            $numberSequences = [];

            // One bounded locking lookup instead of one SELECT per row.
            // firstOrCreate still protects a new key racing with another writer.
            $prior = [];
            $candidateKeys = $preview
                ->filter(fn (array $row): bool => ! $row['skipReason'] && ! $row['exists'])
                ->pluck('key')->unique()->sort()->values();
            foreach ($candidateKeys->chunk(self::KEY_LOOKUP_BATCH_SIZE) as $batch) {
                foreach (OpenItem::withTrashed()
                    ->whereIn('idempotency_key', $batch->all())
                    ->orderBy('idempotency_key')
                    ->lockForUpdate()
                    ->get() as $record) {
                    $prior[$record->idempotency_key] = $record;
                }
            }

            foreach ($preview as $row) {
                if ($row['skipReason']) {
                    $skipped[] = ['contractId' => $row['contractId'], 'key' => $row['key'], 'reason' => $row['skipReason']];
                    continue;
                }
                if ($row['exists']) {
                    $duplicates[] = ['contractId' => $row['contractId'], 'key' => $row['key'], 'reason' => 'Forderung bereits vorhanden.'];
                    continue;
                }

                $serviceMonth = CarbonImmutable::parse($row['serviceMonth'])->startOfMonth();
                $attributes = [
                    'contract_id' => $row['contractId'],
                    'type' => $row['type'],
                    'cost_area' => $row['costArea'],
                    'description' => $row['description'],
                    'service_month' => $serviceMonth,
                    'due_date' => CarbonImmutable::parse($row['dueDate']),
                    'amount' => $row['amount'],
                    'open_amount' => $row['amount'],
                    'status' => 'open',
                    'settled_at' => null,
                ];

                // The idempotency key is unique even for soft-deleted rows. Restore
                // an explicitly regenerated position instead of treating it as a
                // duplicate or attempting an INSERT that violates the unique index.
                $previouslyDeleted = $prior[$row['key']] ?? null;

                if ($previouslyDeleted) {
                    if ($previouslyDeleted->trashed()) {
                        $previouslyDeleted->fill($attributes);
                        $previouslyDeleted->restore();
                        $created[] = $previouslyDeleted->fresh();
                    } else {
                        $duplicates[] = ['contractId' => $row['contractId'], 'key' => $row['key'], 'reason' => 'Forderung wurde parallel bereits erzeugt.'];
                    }
                    continue;
                }

                $receivable = OpenItem::query()->firstOrCreate(
                    ['idempotency_key' => $row['key']],
                    ['id' => (string) Str::uuid(), 'number' => $this->nextNumber($serviceMonth, $numberSequences)] + $attributes,
                );

                if ($receivable->wasRecentlyCreated) {
                    $created[] = $receivable;
                } else {
                    $duplicates[] = ['contractId' => $row['contractId'], 'key' => $row['key'], 'reason' => 'Forderung wurde parallel bereits erzeugt.'];
                }
            }

            return compact('created', 'duplicates', 'skipped');
        }, 3);

        return [
            ...$result,
            'contractsProcessed' => $preview->pluck('contractId')->filter()->unique()->count(),
        ];
    }

    private function buildPreview(
        CarbonImmutable $periodFrom,
        CarbonImmutable $periodUntil,
        ?array $contractIds,
        ?array $propertyIds,
        ?array $unitIds,
        ?array $selectedKeys = null,
    ): Collection
    {
        $periodFrom = $periodFrom->startOfMonth();
        $periodUntil = $periodUntil->startOfMonth();

        if ($periodUntil->lt($periodFrom)) {
            throw ValidationException::withMessages(['periodUntil' => 'Das Ende des Zeitraums darf nicht vor dem Beginn liegen.']);
        }
        if ($periodFrom->diffInMonths($periodUntil) > 36) {
            throw ValidationException::withMessages(['periodUntil' => 'Der Zeitraum darf maximal 36 Monate umfassen.']);
        }

        // A booked subset must not recalculate unrelated months or contracts.
        // Selected IDs are INTERSECTED with the original property/unit scope.
        $requested = $selectedKeys === null ? null : array_fill_keys(array_unique($selectedKeys), true);
        $requestedMonths = [];
        $requestedContracts = [];
        if ($requested !== null) {
            foreach (array_keys($requested) as $key) {
                $parts = explode(':', $key);
                if (((count($parts) === 3 && $parts[0] === 'skip')
                        || (count($parts) === 5 && $parts[0] === 'monthly'))
                    && Str::isUuid($parts[1])
                    && preg_match('/^\\d{4}-\\d{2}$/D', $parts[2])) {
                    $requestedContracts[$parts[1]] = true;
                    $requestedMonths[$parts[2]] = true;
                }
            }
        }

        $contracts = $this->contractsForPeriod(
            $periodFrom, $periodUntil, $contractIds, $propertyIds, $unitIds,
            $requested === null ? null : array_keys($requestedContracts),
        );
        $rows = collect();
        foreach (CarbonPeriod::create($periodFrom, '1 month', $periodUntil) as $month) {
            $month = CarbonImmutable::instance($month)->startOfMonth();
            if ($requested !== null && ! isset($requestedMonths[$month->format('Y-m')])) continue;
            foreach ($this->buildMonthPreview($month, $contracts) as $row) {
                if ($requested !== null && ! isset($requested[$row['key']])) continue;
                $rows->push($row);
                if ($rows->count() > self::MAX_PREVIEW_ROWS) {
                    throw ValidationException::withMessages([
                        'periodUntil' => 'Zu viele Sollstellungen für einen Durchlauf. Bitte Zeitraum oder Einheiten einschränken.',
                    ]);
                }
            }
        }

        // Keep indexed key lookups within a bounded SQL parameter budget.
        // Soft-deleted receivables are deliberately excluded so they can be restored.
        $existing = [];
        $keys = $rows->whereNull('skipReason')->pluck('key')->filter()->unique()->values();
        foreach ($keys->chunk(self::KEY_LOOKUP_BATCH_SIZE) as $batch) {
            foreach (OpenItem::query()->whereIn('idempotency_key', $batch->all())->pluck('idempotency_key') as $key) {
                $existing[$key] = true;
            }
        }

        return $rows->map(function (array $row) use ($existing): array {
            $row['exists'] = $row['skipReason'] ? false : isset($existing[$row['key']]);
            return $row;
        });
    }

    private function contractsForPeriod(CarbonImmutable $periodFrom, CarbonImmutable $periodUntil, ?array $contractIds, ?array $propertyIds, ?array $unitIds, ?array $requestedContractIds = null): Collection
    {
        return Contract::query()
            ->where('status', 'active')
            ->where('starts_on', '<=', $periodUntil->endOfMonth()->toDateString())
            ->where(fn ($query) => $query
                ->where('term_type', '!=', 'fixed')
                ->orWhereNull('fixed_until')
                ->orWhere('fixed_until', '>=', $periodFrom->startOfMonth()->toDateString()))
            ->when($contractIds !== null, fn ($query) => $query->whereIn('id', $contractIds))
            ->when($requestedContractIds !== null, fn ($query) => $query->whereIn('id', $requestedContractIds))
            ->when($propertyIds !== null || $unitIds !== null, function ($query) use ($propertyIds, $unitIds): void {
                $query->where(function ($scope) use ($propertyIds, $unitIds): void {
                    if ($propertyIds !== null) {
                        $scope->whereHas('mainUnit', fn ($unit) => $unit->whereIn('property_id', $propertyIds));
                    }
                    if ($unitIds !== null) {
                        if ($propertyIds !== null) {
                            $scope->orWhereHas('mainUnit', fn ($unit) => $unit->whereIn('id', $unitIds));
                        } else {
                            $scope->whereHas('mainUnit', fn ($unit) => $unit->whereIn('id', $unitIds));
                        }
                    }
                });
            })
            ->with([
                'conditions' => fn ($query) => $query
                    ->where('valid_from', '<=', $periodUntil->endOfMonth()->toDateString())
                    ->where(fn ($nested) => $nested->whereNull('valid_until')->orWhere('valid_until', '>=', $periodFrom->startOfMonth()->toDateString()))
                    ->orderByDesc('valid_from'),
                'parties' => fn ($query) => $query
                    ->correspondenceDuring($periodFrom->startOfMonth(), $periodUntil->endOfMonth())
                    ->with('businessPartner:id,display_name'),
                'mainUnit.property:id,property_number,name',
            ])
            ->orderBy('contract_number')
            ->get();
    }

    private function buildMonthPreview(CarbonImmutable $serviceMonth, Collection $contracts): Collection
    {
        $monthStart = $serviceMonth->startOfMonth();
        $monthEnd = $serviceMonth->endOfMonth();
        $dueDate = $this->thirdBusinessDay($serviceMonth)->toDateString();

        return $contracts
            ->filter(function (Contract $contract) use ($monthStart, $monthEnd): bool {
                if (! $contract->starts_on || $contract->starts_on->gt($monthEnd)) return false;
                if ($contract->term_type === 'fixed' && $contract->fixed_until && $contract->fixed_until->lt($monthStart)) return false;
                return true;
            })
            ->flatMap(function (Contract $contract) use ($serviceMonth, $monthStart, $monthEnd, $dueDate): array {
                $condition = $contract->conditionOverlapping($monthStart, $monthEnd);
                $tenant = $contract->parties
                    ->filter(fn ($party) => $party->isCorrespondenceRecipientDuring($monthStart, $monthEnd))
                    ->sortByDesc('valid_from')
                    ->first();

                if (! $condition || ! $tenant) {
                    return [[
                        'key' => 'skip:'.$contract->id.':'.$serviceMonth->format('Y-m'),
                        'serviceMonth' => $serviceMonth->toDateString(),
                        'dueDate' => $dueDate,
                        'contractId' => $contract->id,
                        'contractNumber' => $contract->contract_number,
                        'businessPartnerId' => $tenant?->business_partner_id,
                        'tenantLabel' => $tenant?->businessPartner?->display_name,
                        'propertyId' => $contract->mainUnit?->property_id,
                        'propertyLabel' => $contract->mainUnit?->property?->name,
                        'unitId' => $contract->mainUnit?->id,
                        'unitLabel' => trim(($contract->mainUnit?->unit_number ?? '').' · '.($contract->mainUnit?->name ?? ''), ' ·'),
                        'type' => 'other',
                        'costArea' => 'other',
                        'costAreaLabel' => OpenItem::costAreaLabel('other'),
                        'description' => 'Nicht generierbar',
                        'amount' => 0,
                        'exists' => false,
                        'skipReason' => ! $condition ? 'Keine gültige Kondition.' : 'Keine aktive Mieterpartei.',
                    ]];
                }

                return collect($this->positions($condition))
                    ->filter(fn (array $position): bool => $position['amount'] > 0)
                    ->map(function (array $position) use ($contract, $tenant, $serviceMonth, $dueDate): array {
                        return [
                            'key' => $this->key($contract->id, $serviceMonth, $position),
                            'serviceMonth' => $serviceMonth->toDateString(),
                            'dueDate' => $dueDate,
                            'contractId' => $contract->id,
                            'contractNumber' => $contract->contract_number,
                            'businessPartnerId' => $tenant->business_partner_id,
                            'tenantLabel' => $tenant->businessPartner?->display_name,
                            'propertyId' => $contract->mainUnit?->property_id,
                            'propertyLabel' => $contract->mainUnit?->property?->name,
                            'unitId' => $contract->mainUnit?->id,
                            'unitLabel' => trim(($contract->mainUnit?->unit_number ?? '').' · '.($contract->mainUnit?->name ?? ''), ' ·'),
                            'type' => $position['type'],
                            'costArea' => $position['costArea'],
                            'costAreaLabel' => OpenItem::costAreaLabel($position['costArea']),
                            'description' => $position['description'].' '.$serviceMonth->translatedFormat('m/Y'),
                            'amount' => round($position['amount'], 2),
                            'exists' => false,
                            'skipReason' => null,
                        ];
                    })->values()->all();
            })->values();
    }

    private function positions(?ContractCondition $condition): array
    {
        if (! $condition) return [];
        return [
            ['type' => 'rent', 'costArea' => 'base_rent', 'description' => 'Kaltmiete', 'amount' => (float) $condition->base_rent_amount],
            ['type' => 'advance', 'costArea' => 'operating_costs', 'description' => 'Betriebskostenvorauszahlung', 'amount' => (float) $condition->operating_cost_advance_amount],
            ['type' => 'advance', 'costArea' => 'heating_costs', 'description' => 'Heizkostenvorauszahlung', 'amount' => (float) $condition->heating_cost_advance_amount],
            ['type' => 'rent', 'costArea' => 'garage', 'description' => 'Garagenmiete', 'amount' => (float) $condition->garage_amount],
            ['type' => 'rent', 'costArea' => 'parking', 'description' => 'Stellplatzmiete', 'amount' => (float) $condition->parking_space_amount],
            ['type' => 'other', 'costArea' => 'other', 'description' => 'Weitere Vertragsforderung', 'amount' => (float) $condition->other_amount],
        ];
    }

    private function thirdBusinessDay(CarbonImmutable $month): CarbonImmutable
    {
        $date = $month->startOfMonth();
        $businessDays = 0;

        while (true) {
            if (! $date->isWeekend()) {
                $businessDays++;
                if ($businessDays === 3) return $date;
            }

            $date = $date->addDay();
        }
    }

    private function key(string $contractId, CarbonImmutable $month, array $position): string
    {
        return implode(':', ['monthly', $contractId, $month->format('Y-m'), $position['type'], $position['costArea']]);
    }

    private function nextNumber(CarbonImmutable $month, array &$sequences): string
    {
        $prefix = 'FOR-'.$month->format('Ym').'-';
        if (! array_key_exists($prefix, $sequences)) {
            $last = OpenItem::withTrashed()->where('number', 'like', $prefix.'%')->lockForUpdate()->max('number');
            $sequences[$prefix] = $last ? (int) substr($last, -6) : 0;
        }

        $sequences[$prefix]++;
        return $prefix.str_pad((string) $sequences[$prefix], 6, '0', STR_PAD_LEFT);
    }
}
