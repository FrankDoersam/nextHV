<?php

namespace App\Services\OperatingCosts;

use App\Models\Contract;
use App\Models\Property;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Validation\ValidationException;

final class OperatingCostStatementCandidateService
{
    // Keep the picker bounded, and never silently omit selectable contracts.
    private const MAX_PROPERTIES = 2000;
    private const MAX_CONTRACTS = 1000;

    /** @return array<int, array<string, mixed>> */
    public function properties(): array
    {
        $properties = Property::query()
            ->where('status', '!=', 'archived')
            ->orderBy('property_number')
            ->orderBy('id')
            ->limit(self::MAX_PROPERTIES + 1)
            ->get([
                'id', 'property_number', 'name', 'address', 'postal_code', 'city',
                'billing_period_start_month', 'billing_period_start_day',
            ]);

        if ($properties->count() > self::MAX_PROPERTIES) {
            throw ValidationException::withMessages([
                'propertyId' => 'Die Objektauswahl ist zu groß, um sie vollständig anzuzeigen.',
            ]);
        }

        return $properties->map(static fn (Property $property): array => [
            'id' => (string) $property->id,
            'propertyNumber' => (string) $property->property_number,
            'name' => (string) $property->name,
            'fullAddress' => $property->full_address,
            'billingPeriodStartMonth' => $property->billing_period_start_month,
            'billingPeriodStartDay' => $property->billing_period_start_day,
        ])->all();
    }

    /** @return array<int, array<string, mixed>> */
    public function contracts(Property $property, CarbonImmutable $from, CarbonImmutable $until): array
    {
        // Scope the candidate set in SQL. In particular, a contract assigned
        // to a different property must not reach the PHP projection at all.
        $billableUnit = static fn (Builder $unit): Builder => $unit
            ->where('property_id', $property->id)
            ->where('unit_type', 'apartment')
            ->where('operating_cost_billable', true);

        $query = Contract::query()
            ->select([
                'id', 'contract_number', 'main_unit_id', 'contract_type', 'status',
                'term_type', 'starts_on', 'fixed_until',
            ])
            ->whereIn('status', ['signature_pending', 'active', 'ended'])
            ->whereNotIn('contract_type', Contract::ANCILLARY_NOTICE_TYPES)
            ->where(static fn (Builder $query): Builder => $query
                ->whereNull('starts_on')
                ->orWhere('starts_on', '<=', $until->toDateString()))
            ->where(static fn (Builder $query): Builder => $query
                ->whereHas('mainUnit', $billableUnit)
                ->orWhereHas('units.unit', $billableUnit))
            ->with([
                'mainUnit:id,property_id,unit_number,name,unit_type,operating_cost_billable',
                'units:id,contract_id,unit_id,object_role,sort_order',
                'units.unit:id,property_id,unit_number,name,unit_type,operating_cost_billable',
                'terminations:id,contract_id,confirmed_end_on,created_at',
                'tenantParties:id,contract_id,business_partner_id,party_role,valid_from,valid_until',
                'tenantParties.businessPartnerSummary:id,display_name',
            ]);

        $result = [];
        // End-date semantics require the confirmed termination history. Scan in
        // bounded eager-loaded chunks, so old contracts cannot hide valid rows
        // behind a premature LIMIT before this historic-period check.
        $query->chunkById(200, static function ($candidates) use ($property, $from, &$result): void {
            foreach ($candidates as $contract) {
                // Prefer the canonical main unit; old contracts may still use the
                // single ContractUnit assignment. Both are already eager-loaded.
                $unitId = $contract->effectiveMainUnitId();
                $unit = $contract->mainUnit
                    ?? $contract->units->first(
                        static fn ($assignment): bool => (string) $assignment->unit_id === $unitId,
                    )?->unit;

                if (! $unit
                    || (string) $unit->property_id !== (string) $property->id
                    || $unit->unit_type !== 'apartment'
                    || ! $unit->operating_cost_billable) {
                    continue;
                }

                $end = $contract->confirmed_end_on;
                if ($end && $end->toDateString() < $from->toDateString()) {
                    continue;
                }

                if (count($result) >= self::MAX_CONTRACTS) {
                    throw ValidationException::withMessages([
                        'contractIds' => 'Für diesen Zeitraum gibt es mehr als 1000 abrechenbare Verträge. Bitte grenzen Sie die Auswahl ein.',
                    ]);
                }

                $result[] = [
                    'id' => (string) $contract->id,
                    'contractNumber' => (string) $contract->contract_number,
                    'tenantLabels' => $contract->tenant_labels,
                    'unitLabels' => collect([$unit->unit_number, $unit->name])->filter()->join(' · '),
                    'status' => (string) $contract->status,
                    'startsOn' => $contract->starts_on?->toDateString(),
                    'endsOn' => $end?->toDateString(),
                ];
            }
        });

        usort($result, static fn (array $first, array $second): int => [
            $first['startsOn'] ?? '', $first['contractNumber'], $first['id'],
        ] <=> [
            $second['startsOn'] ?? '', $second['contractNumber'], $second['id'],
        ]);

        return $result;
    }
}
