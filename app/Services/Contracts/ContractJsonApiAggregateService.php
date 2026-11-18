<?php

namespace App\Services\Contracts;

use App\Models\BusinessPartnerBankAccount;
use App\Models\Contract;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final readonly class ContractJsonApiAggregateService
{
    public function __construct(private ContractDepositService $deposits)
    {
    }

    /** @param array<string, mixed>|null $setup */
    public function prepareCreate(Contract $contract, ?array $setup): void
    {
        if ($setup && filled($setup['unitId'] ?? null)) {
            $contract->main_unit_id = (string) $setup['unitId'];
        }

        if (! $contract->refund_bank_account_id) {
            return;
        }

        $accountOwnerId = BusinessPartnerBankAccount::query()
            ->whereKey($contract->refund_bank_account_id)
            ->value('business_partner_id');
        $tenantIds = collect($setup['tenantIds'] ?? [])
            ->map(fn ($id): string => (string) $id);

        if (! $accountOwnerId || ! $tenantIds->contains((string) $accountOwnerId)) {
            throw ValidationException::withMessages([
                'refundBankAccountId' => 'Das Gutschriftkonto muss zu einer Mieterpartei dieses Vertrags gehören.',
            ]);
        }
    }

    public function validate(Contract $contract): void
    {
        if ($contract->term_type === 'fixed') {
            if (! $contract->fixed_reason_type
                || ! in_array($contract->fixed_reason_type, Contract::FIXED_REASON_TYPES, true)) {
                throw ValidationException::withMessages([
                    'fixedReasonType' => 'Bei einem befristeten Vertrag muss ein gültiger Befristungsgrund angegeben werden.',
                ]);
            }
            if (trim((string) $contract->fixed_reason_text) === '') {
                throw ValidationException::withMessages([
                    'fixedReasonText' => 'Bei einem befristeten Vertrag muss der vollständige Befristungsgrund dokumentiert werden.',
                ]);
            }
        }

        if ($contract->returned_at && $contract->handed_over_at
            && $contract->returned_at->lt($contract->handed_over_at)) {
            throw ValidationException::withMessages([
                'returnedAt' => 'Die Rückgabe darf nicht vor der dokumentierten Übergabe liegen.',
            ]);
        }
    }

    public function syncContractStartConditionDate(Contract $contract): void
    {
        $validFrom = $contract->starts_on?->toDateString() ?? (string) $contract->starts_on;
        if ($validFrom === '') {
            return;
        }

        $updated = $contract->conditions()
            ->where('change_reason', 'contract_start')
            ->where('valid_from', '<>', $validFrom)
            ->update(['valid_from' => $validFrom]);

        if ($updated > 0) {
            $contract->unsetRelation('conditions');
        }
    }

    public function persistPendingSetup(Contract $contract): void
    {
        $setup = $contract->pendingJsonApiInitialSetup();
        if ($setup === null || ! $contract->exists) {
            return;
        }

        DB::transaction(function () use ($contract, $setup): void {
            $tenantIds = collect($setup['tenantIds'] ?? [])
                ->filter()
                ->map(fn ($id): string => (string) $id)
                ->unique()
                ->values();
            $unitId = trim((string) ($setup['unitId'] ?? ''));
            $validFrom = $contract->starts_on?->toDateString() ?? (string) $contract->starts_on;

            if ($unitId !== '') {
                $contract->units()->updateOrCreate(
                    ['object_role' => 'main_rental_object'],
                    [
                        'unit_id' => $unitId,
                        'valid_from' => $validFrom,
                        'handed_over_at' => $contract->handed_over_at,
                        'returned_at' => $contract->returned_at,
                        'sort_order' => 1,
                    ],
                );

                if ((string) $contract->main_unit_id !== $unitId) {
                    $contract->forceFill(['main_unit_id' => $unitId])->saveQuietly();
                }
            }

            $contract->conditions()->updateOrCreate(
                ['valid_from' => $validFrom, 'change_reason' => 'contract_start'],
                [
                    'base_rent_amount' => $setup['baseRent'] ?? 0,
                    'operating_cost_advance_amount' => $setup['operatingCostAdvance'] ?? 0,
                    'heating_cost_advance_amount' => $setup['heatingCostAdvance'] ?? 0,
                    'garage_amount' => $setup['garageAmount'] ?? 0,
                    'parking_space_amount' => $setup['parkingSpaceAmount'] ?? 0,
                    'other_amount' => $setup['otherAmount'] ?? 0,
                    'payment_interval' => $setup['paymentInterval'] ?? 'monthly',
                    'note' => 'Initiale Vertragskondition.',
                ],
            );

            foreach ($tenantIds as $tenantId) {
                $contract->parties()->firstOrCreate(
                    [
                        'business_partner_id' => $tenantId,
                        'party_role' => 'tenant',
                    ],
                    ['valid_from' => $validFrom],
                );
            }

            $deposit = $setup['deposit'] ?? null;
            if (is_array($deposit) && (float) ($deposit['agreedAmount'] ?? 0) > 0) {
                $this->deposits->save($contract, [
                    'agreedAmount' => (float) $deposit['agreedAmount'],
                    'currency' => strtoupper((string) ($deposit['currency'] ?? 'EUR')),
                    'dueFrom' => $deposit['dueFrom'] ?? $validFrom,
                    'installmentCount' => max(1, min(12, (int) ($deposit['installmentCount'] ?? 1))),
                    'custodyType' => $deposit['custodyType'] ?? null,
                    'reference' => filled($deposit['reference'] ?? null) ? trim((string) $deposit['reference']) : null,
                    'notes' => $deposit['notes'] ?? null,
                    'interestRelevant' => (bool) ($deposit['interestRelevant'] ?? false),
                    'interestAmount' => (float) ($deposit['interestAmount'] ?? 0),
                    'plannedRefundOn' => $deposit['plannedRefundOn'] ?? null,
                ]);
            }
        }, 3);

        $contract->clearPendingJsonApiInitialSetup();
        $contract->unsetRelation('mainUnit');
        $contract->unsetRelation('units');
        $contract->unsetRelation('parties');
        $contract->unsetRelation('conditions');
    }
}
