<?php

namespace App\Services\OperatingCosts;

use App\Models\Contract;
use App\Models\ContractUnit;
use App\Models\Meter;
use App\Models\MeterReading;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

final class MeterAllocationService
{
    public function __construct(private readonly PersonDayAllocationService $personDays) {}

    public function consumptionForContract(Contract $contract, Carbon|string $billingFrom, Carbon|string $billingUntil, Carbon|string $usageFrom, Carbon|string $usageUntil): array
    {
        $billingFrom = Carbon::parse($billingFrom)->startOfDay();
        $billingUntil = Carbon::parse($billingUntil)->startOfDay();
        $usageFrom = Carbon::parse($usageFrom)->startOfDay();
        $usageUntil = Carbon::parse($usageUntil)->startOfDay();
        $contract->loadMissing(['mainUnit.property', 'units.unit.property', 'parties.businessPartner', 'terminations']);
        $unit = $contract->effectiveMainUnit();
        $propertyId = $unit?->property_id;
        if (! $unit || ! $propertyId) return [];

        $meters = $this->billingMetersForProperty((string) $propertyId, $billingFrom, $billingUntil);

        $result = [];
        $individualMeters = $meters->filter(fn (Meter $meter): bool => $this->isIndividualUnitMeter($meter));
        foreach ($individualMeters->groupBy(fn (Meter $meter): string => $this->groupKey($meter)) as $groupKey => $groupMeters) {
            $groupMeters = $groupMeters->reject(fn (Meter $meter): bool => $this->hasOverlappingPredecessor($meter, $billingFrom, $billingUntil))->values();
            if ($groupMeters->isEmpty()) continue;
            $ownMeters = $groupMeters->where('unit_id', $unit->id)->values();
            $ownRows = $ownMeters->map(function (Meter $meter) use ($usageFrom, $usageUntil): array {
                $difference = $this->meterDifference($meter, $usageFrom, $usageUntil);
                $this->requireConsumption($meter, $difference, $usageFrom, $usageUntil);
                $mode = $meter->billing_allocation_mode ?: 'individual';
                $label = $mode === 'not_allocated'
                    ? 'Einheitenzähler · nicht separat umgelegt'
                    : 'Einzelzähler der Einheit';

                return $this->meterRow($meter, $difference, 1.0, $label, 1.0);
            });
            $total = 0.0;
            $wastewaterTotal = 0.0;
            $matrixRows = [];
            foreach ($groupMeters as $meter) {
                $difference = $this->meterDifference($meter, $billingFrom, $billingUntil);
                $this->requireConsumption($meter, $difference, $billingFrom, $billingUntil);
                $total += (float) $difference['consumption'];
                if ($meter->wastewater_relevant !== false) $wastewaterTotal += (float) $difference['consumption'];
                $matrixRows = [...$matrixRows, ...$this->meterMatrixRows($meter, $difference, $billingFrom, $billingUntil)];
            }
            $own = $ownRows->sum(fn (array $row): float => (float) ($row['allocatedConsumption'] ?? 0));
            $wastewaterOwn = $ownRows
                ->filter(fn (array $row): bool => ($row['wastewaterRelevant'] ?? true) !== false)
                ->sum(fn (array $row): float => (float) ($row['allocatedConsumption'] ?? 0));
            $this->appendGroup(
                $result, $groupKey, $groupMeters->first(), $own, $total, $ownRows->all(), $matrixRows,
                (float) $wastewaterOwn, $wastewaterTotal,
            );
        }

        $commonMeters = $meters->filter(function (Meter $meter): bool {
            if (! $meter->billing_relevant) return false;

            $mode = $meter->billing_allocation_mode ?: 'individual';
            return $meter->unit_id === null || ! in_array($mode, ['individual', 'not_allocated'], true);
        });
        foreach ($commonMeters as $meter) {
            if ($this->hasOverlappingPredecessor($meter, $billingFrom, $billingUntil)) continue;
            $mode = $meter->billing_allocation_mode ?: 'individual';
            $difference = $this->meterDifference($meter, $billingFrom, $billingUntil);

            if ($mode === 'not_allocated') {
                $this->appendGroup(
                    $result,
                    $this->groupKey($meter),
                    $meter,
                    0.0,
                    0.0,
                    [],
                    $this->meterMatrixRows(
                        $meter,
                        $difference,
                        $billingFrom,
                        $billingUntil,
                        'Nicht umgelegt',
                    ),
                );
                continue;
            }

            if ($mode === 'individual' && $meter->unit_id === null) {
                throw ValidationException::withMessages(['meters' => "Der Objektzähler „{$meter->meter_number}“ ist als Einzelzähler konfiguriert, besitzt aber keine Einheit."]);
            }
            $this->requireConsumption($meter, $difference, $billingFrom, $billingUntil);
            $consumption = (float) $difference['consumption'];
            $allocation = $this->allocationForMeter($meter, $contract, $billingFrom, $billingUntil);
            $this->appendGroup(
                $result,
                $this->groupKey($meter),
                $meter,
                $consumption * $allocation['share'],
                $consumption,
                [$this->meterRow($meter, $difference, $allocation['share'], $allocation['label'], $allocation['totalWeight'])],
                $this->meterMatrixRows(
                    $meter,
                    $difference,
                    $billingFrom,
                    $billingUntil,
                    $allocation['distributionText'] ?? $allocation['label'],
                    isset($allocation['distributionDivisor']) ? (int) $allocation['distributionDivisor'] : null,
                ),
                $meter->wastewater_relevant === false ? 0.0 : $consumption * $allocation['share'],
                $meter->wastewater_relevant === false ? 0.0 : $consumption,
            );
        }

        return collect($result)->map(function (array $group): array {
            $group['own'] = round((float) $group['own'], 3);
            $group['total'] = round((float) $group['total'], 3);
            $group['wastewaterOwn'] = round((float) ($group['wastewaterOwn'] ?? $group['own']), 3);
            $group['wastewaterTotal'] = round((float) ($group['wastewaterTotal'] ?? $group['total']), 3);
            $group['wastewaterExcludedOwn'] = round(max(0.0, $group['own'] - $group['wastewaterOwn']), 3);
            $group['matrixRows'] = collect($group['matrixRows'] ?? [])
                ->sortBy(fn (array $row): string => ($row['unit'] ?? '').'|'.($row['contractNumber'] ?? '').'|'.($row['meterNumber'] ?? '').'|'.($row['from'] ?? ''))
                ->values()->all();
            return $group;
        })->all();
    }

    private function billingMetersForProperty(string $propertyId, Carbon $billingFrom, Carbon $billingUntil): Collection
    {
        $readingFrom = $billingFrom->copy()->subDay()->toDateString();
        $readingUntil = $billingUntil->toDateString();

        return Meter::query()
            ->where('property_id', $propertyId)
            ->where(function ($query): void {
                $query->whereIn('meter_type', ['cold_water', 'hot_water', 'heat', 'heat_cost_allocator'])
                    ->orWhereIn('billing_group', ['water', 'hot_water', 'heating', 'garden']);
            })
            ->where(function ($query): void {
                $query->where('billing_relevant', true)
                    ->orWhereNotNull('unit_id');
            })
            ->where(function ($query) use ($billingFrom, $readingFrom, $readingUntil): void {
                $query->where('status', '!=', 'inactive')
                    ->orWhere(function ($inactive) use ($billingFrom, $readingFrom, $readingUntil): void {
                        $inactive->where('status', 'inactive')
                            ->where(function ($historical) use ($billingFrom, $readingFrom, $readingUntil): void {
                                $historical->whereDate('removed_on', '>=', $billingFrom)
                                    ->orWhereHas('readings', function ($readings) use ($readingFrom, $readingUntil): void {
                                        $readings->where(function ($dates) use ($readingFrom, $readingUntil): void {
                                            $dates->whereBetween('reference_date', [$readingFrom, $readingUntil])
                                                ->orWhereBetween('reading_date', [$readingFrom, $readingUntil]);
                                        });
                                    });
                            });
                    });
            })
            ->where(fn ($query) => $query->whereNull('installation_date')->orWhereDate('installation_date', '<=', $billingUntil))
            ->where(fn ($query) => $query->whereNull('removed_on')->orWhereDate('removed_on', '>=', $billingFrom))
            ->with([
                'unit.contractAssignments.contract',
                'predecessorMeter',
                'successorMeter',
                'readings' => fn ($query) => $query->orderBy('reference_date')->orderBy('reading_date')->orderBy('created_at'),
            ])
            ->get();
    }

    private function isIndividualUnitMeter(Meter $meter): bool
    {
        if (! $meter->billing_relevant || $meter->unit_id === null) return false;

        $mode = $meter->billing_allocation_mode ?: 'individual';

        return in_array($mode, ['individual', 'not_allocated'], true);
    }

    private function allocationForMeter(Meter $meter, Contract $contract, Carbon $from, Carbon $until): array
    {
        $mode = $meter->billing_allocation_mode ?: 'individual';
        $propertyId = (string) $meter->property_id;
        if ($mode === 'shared_equal') {
            $contracts = $this->personDays->activeContracts($propertyId, $from, $until);
            $activeUnitIds = $contracts
                ->map(fn (Contract $activeContract): ?string => $activeContract->effectiveMainUnitId() ? (string) $activeContract->effectiveMainUnitId() : null)
                ->filter()
                ->unique()
                ->values();
            $unitCount = $activeUnitIds->count();
            $contractUnitId = $contract->effectiveMainUnitId();
            $matches = $contractUnitId !== null && $activeUnitIds->contains((string) $contractUnitId);
            $distributionText = $unitCount > 0
                ? 'Gemeinschaftsverbrauch · verteilt auf '.$unitCount.' aktive Wohneinheit'.($unitCount === 1 ? '' : 'en')
                : 'Gemeinschaftsverbrauch · gleich auf aktive Wohneinheiten verteilt';

            return [
                'share' => $matches && $unitCount > 0 ? 1 / $unitCount : 0.0,
                'ownWeight' => $matches ? 1.0 : 0.0,
                'totalWeight' => (float) $unitCount,
                'label' => 'Gemeinschaftszähler gleich auf aktive Wohneinheiten',
                'distributionText' => $distributionText,
                'distributionDivisor' => $unitCount > 0 ? $unitCount : null,
            ];
        }
        if ($mode === 'person_days') {
            $total = (float) ($this->personDays->forProperty($propertyId, $from, $until)['total'] ?? 0);
            $own = (float) $this->personDays->forContract($contract, $from, $until);
            return [
                'share' => $total > 0 ? $own / $total : 0.0,
                'ownWeight' => $own,
                'totalWeight' => $total,
                'label' => 'Gemeinschaftszähler nach Personentagen',
                'distributionText' => 'Gemeinschaftsverbrauch · nach Personentagen verteilt',
            ];
        }
        if ($mode === 'shared_explicit') {
            throw ValidationException::withMessages(['meters' => "Für den Gemeinschaftszähler „{$meter->meter_number}“ sind explizite Anteile gewählt, im neuen Modell existieren dafür aber noch keine Zielanteile. Bitte auf „gleich“ oder „Personentage“ umstellen."]);
        }
        if ($mode === 'individual') {
            $matches = (string) $meter->unit_id === (string) $contract->effectiveMainUnitId();
            return ['share' => $matches ? 1.0 : 0.0, 'ownWeight' => $matches ? 1.0 : 0.0, 'totalWeight' => 1.0, 'label' => 'Einzelzähler der Einheit'];
        }
        return ['share' => 0.0, 'ownWeight' => 0.0, 'totalWeight' => 0.0, 'label' => $mode];
    }

    private function appendGroup(array &$result, string $groupKey, Meter $meter, float $own, float $total, array $rows, array $matrixRows = [], ?float $wastewaterOwn = null, ?float $wastewaterTotal = null): void
    {
        $result[$groupKey] ??= [
            'label' => Meter::billingGroupLabel($meter->billing_group) ?: Meter::typeLabel($meter->meter_type),
            'own' => 0.0,
            'total' => 0.0,
            'wastewaterOwn' => 0.0,
            'wastewaterTotal' => 0.0,
            'unit' => $meter->unit_of_measure ?: 'units',
            'rows' => [],
            'matrixRows' => [],
        ];
        $result[$groupKey]['own'] += $own;
        $result[$groupKey]['total'] += $total;
        $result[$groupKey]['wastewaterOwn'] += $wastewaterOwn ?? $own;
        $result[$groupKey]['wastewaterTotal'] += $wastewaterTotal ?? $total;
        $result[$groupKey]['rows'] = [...$result[$groupKey]['rows'], ...$rows];
        $result[$groupKey]['matrixRows'] = [...$result[$groupKey]['matrixRows'], ...$matrixRows];
    }

    private function meterMatrixRows(Meter $meter, array $difference, Carbon $billingFrom, Carbon $billingUntil, ?string $distributionText = null, ?int $distributionDivisor = null): array
    {
        $unit = $meter->unit;
        $base = [
            'meterId' => (string) $meter->id,
            'meterNumber' => $meter->meter_number,
            'meterType' => Meter::typeLabel($meter->meter_type),
            'location' => $meter->location,
            'unitId' => $unit?->id ? (string) $unit->id : null,
            'unit' => $unit ? collect([$unit->unit_number, $unit->name])->filter()->join(' · ') : 'Objekt / Allgemein',
            'startValue' => $difference['startValue'],
            'startDate' => $difference['startDate'],
            'startNote' => $difference['startNote'] ?? null,
            'endValue' => $difference['endValue'],
            'endDate' => $difference['endDate'],
            'endNote' => $difference['endNote'] ?? null,
            'consumption' => $difference['consumption'],
            'unitOfMeasure' => $meter->unit_of_measure,
            'wastewaterRelevant' => $meter->wastewater_relevant !== false,
            'distributionText' => $distributionText,
            'distributionDivisor' => $distributionDivisor,
        ];

        if (! $unit) {
            return [[
                ...$base,
                'contractId' => null,
                'contractNumber' => 'Gemeinschaft',
                'from' => $billingFrom->toDateString(),
                'until' => $billingUntil->toDateString(),
            ]];
        }

        $assignments = $unit->relationLoaded('contractAssignments')
            ? $unit->contractAssignments
            : $unit->contractAssignments()->with('contract')->get();
        $matching = $assignments->filter(function (ContractUnit $assignment) use ($billingFrom, $billingUntil): bool {
            $contract = $assignment->contract;
            if (! $contract || in_array($contract->status, ['cancelled', 'archived'], true)) return false;
            $from = $assignment->valid_from ? Carbon::parse($assignment->valid_from)->startOfDay() : Carbon::parse($contract->starts_on)->startOfDay();
            $until = $assignment->valid_until
                ? Carbon::parse($assignment->valid_until)->startOfDay()
                : ($contract->confirmed_end_on ? Carbon::parse($contract->confirmed_end_on)->startOfDay() : $billingUntil->copy());

            return $from->lte($billingUntil) && $until->gte($billingFrom);
        })->values();

        if ($matching->isEmpty()) {
            return [[
                ...$base,
                'contractId' => null,
                'contractNumber' => 'Ohne Vertrag',
                'from' => $billingFrom->toDateString(),
                'until' => $billingUntil->toDateString(),
            ]];
        }

        return $matching->map(function (ContractUnit $assignment) use ($base, $billingFrom, $billingUntil): array {
            $contract = $assignment->contract;
            $from = $assignment->valid_from ? Carbon::parse($assignment->valid_from)->startOfDay() : Carbon::parse($contract->starts_on)->startOfDay();
            $contractEnd = $contract->confirmed_end_on ?? ($contract->term_type === 'fixed' ? $contract->fixed_until : null);
            $until = $assignment->valid_until
                ? Carbon::parse($assignment->valid_until)->startOfDay()
                : ($contractEnd ? Carbon::parse($contractEnd)->startOfDay() : $billingUntil->copy());
            if ($from->lt($billingFrom)) $from = $billingFrom->copy();
            if ($until->gt($billingUntil)) $until = $billingUntil->copy();

            return [
                ...$base,
                'contractId' => (string) $contract->id,
                'contractNumber' => (string) $contract->contract_number,
                'from' => $from->toDateString(),
                'until' => $until->toDateString(),
            ];
        })->all();
    }

    private function meterDifference(Meter $meter, Carbon $start, Carbon $until): array
    {
        $effectiveStart = $meter->installation_date && $meter->installation_date->greaterThan($start)
            ? Carbon::parse($meter->installation_date)->startOfDay()
            : $start->copy();
        $effectiveUntil = $meter->removed_on && $meter->removed_on->lessThan($until)
            ? Carbon::parse($meter->removed_on)->startOfDay()
            : $until->copy();

        if ($effectiveStart->gt($effectiveUntil)) {
            return [
                'startValue' => null, 'startDate' => null, 'startNote' => null,
                'endValue' => null, 'endDate' => null, 'endNote' => null, 'consumption' => null,
            ];
        }

        $readings = $meter->readings ?? collect();
        $startReading = $this->readingOnOrBefore($readings, $effectiveStart, $meter->installation_date?->toDateString());
        $endReading = $this->readingOnOrBefore($readings, $effectiveUntil, $meter->installation_date?->toDateString());
        $startValue = $startReading?->value;
        $endValue = $endReading?->value;
        $consumption = is_numeric($startValue) && is_numeric($endValue) ? round((float) $endValue - (float) $startValue, 3) : null;

        if ($consumption !== null && $consumption < 0) {
            throw ValidationException::withMessages(['meters' => "Der Verbrauch des Zählers „{$meter->meter_number}“ ist negativ. Bitte Zählerwechsel oder Ablesungen prüfen."]);
        }

        $result = [
            'startValue' => is_numeric($startValue) ? (float) $startValue : null,
            'startDate' => $this->readingDate($startReading),
            'startNote' => $startReading?->notes,
            'endValue' => is_numeric($endValue) ? (float) $endValue : null,
            'endDate' => $this->readingDate($endReading),
            'endNote' => $endReading?->notes,
            'consumption' => $consumption,
        ];

        $successor = $meter->successorMeter;
        if ($successor && $effectiveUntil->lt($until)) {
            $successor->loadMissing(['readings', 'successorMeter']);
            $successorDifference = $this->meterDifference($successor, $start, $until);
            if ($successorDifference['consumption'] === null) {
                return $result;
            }

            $result['endValue'] = $successorDifference['endValue'];
            $result['endDate'] = $successorDifference['endDate'];
            $result['endNote'] = $successorDifference['endNote'];
            $result['consumption'] = $result['consumption'] === null
                ? $successorDifference['consumption']
                : round((float) $result['consumption'] + (float) $successorDifference['consumption'], 3);
        }

        return $result;
    }

    private function hasOverlappingPredecessor(Meter $meter, Carbon $from, Carbon $until): bool
    {
        $predecessor = $meter->predecessorMeter;
        if (! $predecessor || ! $predecessor->billing_relevant) return false;

        return ($predecessor->installation_date === null || Carbon::parse($predecessor->installation_date)->lte($until))
            && ($predecessor->removed_on === null || Carbon::parse($predecessor->removed_on)->gte($from));
    }

    private function requireConsumption(Meter $meter, array $difference, Carbon $from, Carbon $until): void
    {
        if ($difference['consumption'] !== null) return;
        throw ValidationException::withMessages(['meters' => 'Für den abrechnungsrelevanten Zähler „'.$meter->meter_number.'“ fehlen passende Anfangs- oder Endstände für den Zeitraum '.$from->format('d.m.Y').'–'.$until->format('d.m.Y').'.']);
    }

    private function readingOnOrBefore(Collection $readings, Carbon $date): ?MeterReading
    {
        return $readings
            ->filter(fn (MeterReading $reading): bool => $reading->reference_date !== null || $reading->reading_date !== null)
            ->filter(fn (MeterReading $reading): bool => Carbon::parse($reading->reference_date ?? $reading->reading_date)->startOfDay()->lte($date))
            ->sortByDesc(fn (MeterReading $reading): int => Carbon::parse($reading->reference_date ?? $reading->reading_date)->timestamp)->first();
    }

    private function readingDate(?MeterReading $reading): ?string
    {
        $value = $reading?->reference_date ?? $reading?->reading_date;
        return $value ? Carbon::parse($value)->toDateString() : null;
    }

    private function meterRow(Meter $meter, array $difference, float $share, string $modeLabel, float $totalWeight): array
    {
        $consumption = $difference['consumption'];
        return [
            'meterId' => (string) $meter->id,
            'meterNumber' => $meter->meter_number,
            'label' => trim(collect([Meter::typeLabel($meter->meter_type), $meter->location ? '('.$meter->location.')' : null])->filter()->join(' ')),
            'group' => $this->groupKey($meter),
            'allocationMode' => $meter->billing_allocation_mode ?: 'individual',
            'allocationLabel' => $modeLabel,
            'totalWeight' => round($totalWeight, 4),
            'share' => round($share, 8),
            'wastewaterRelevant' => $meter->wastewater_relevant !== false,
            'totalConsumption' => $consumption,
            'allocatedConsumption' => $consumption !== null ? round($consumption * $share, 3) : null,
            'unit' => $meter->unit_of_measure,
            'reading' => $difference,
        ];
    }

    private function groupKey(Meter $meter): string
    {
        if ($meter->billing_group) return $meter->billing_group;
        return match ($meter->meter_type) {
            'cold_water' => 'water',
            'hot_water' => 'hot_water',
            'heat', 'heat_cost_allocator' => 'heating',
            default => 'other',
        };
    }
}
