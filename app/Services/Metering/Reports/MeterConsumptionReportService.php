<?php

namespace App\Services\Metering\Reports;

use App\Models\Contract;
use App\Models\Meter;
use App\Models\Property;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use InvalidArgumentException;
use Illuminate\Validation\ValidationException;

class MeterConsumptionReportService
{
    private const TYPES = ['heat', 'hot_water', 'cold_water'];

    private const TYPE_ORDER = ['heat' => 10, 'hot_water' => 20, 'cold_water' => 30];

    /** @return array<string, mixed> */
    public function build(Property $property, CarbonImmutable $referenceDate1, CarbonImmutable $referenceDate2, ?Contract $contract = null): array
    {
        $date1 = $referenceDate1->toDateString();
        $date2 = $referenceDate2->toDateString();

        if ($date2 <= $date1) {
            throw new InvalidArgumentException('Ablesung 2 muss nach Ablesung 1 liegen.');
        }

        if ($referenceDate2->greaterThanOrEqualTo($referenceDate1->addYearsNoOverflow(10))) {
            throw ValidationException::withMessages(['referenceDate2' => 'Der Vergleich darf höchstens zehn Jahre umfassen.']);
        }

        $contractAssignment = $contract ? $this->contractAssignment($contract, $property, $date1, $date2) : null;
        $referenceDates = [$date1, $date2];

        $meters = Meter::query()
            ->where('property_id', $property->id)
            ->whereNotNull('unit_id')
            ->when($contractAssignment, fn ($query) => $query->where('unit_id', $contractAssignment->unit_id))
            ->whereIn('meter_type', $contract ? Meter::TYPES : self::TYPES)
            ->where(fn ($query) => $query->whereNull('installation_date')->orWhereDate('installation_date', '<=', $date2))
            ->where(fn ($query) => $query->whereNull('removed_on')->orWhereDate('removed_on', '>=', $date1))
            ->whereHas('unit', fn ($query) => $contractAssignment ? $query : $query->where('unit_type', 'apartment'))
            ->with([
                'unit:id,property_id,unit_number,name,unit_type,floor',
                'readings' => fn ($query) => $query
                    ->whereIn('reference_date', $referenceDates)
                    ->orderBy('reference_date')
                    ->orderByDesc('reading_date')
                    ->orderByDesc('created_at'),
            ])
            ->get()
            ->sort(function (Meter $left, Meter $right): int {
                $unitOrder = strnatcasecmp((string) ($left->unit?->unit_number ?? ''), (string) ($right->unit?->unit_number ?? ''));
                if ($unitOrder !== 0) {
                    return $unitOrder;
                }

                $typeOrder = (self::TYPE_ORDER[$left->meter_type] ?? 999) <=> (self::TYPE_ORDER[$right->meter_type] ?? 999);
                if ($typeOrder !== 0) {
                    return $typeOrder;
                }

                return strnatcasecmp((string) $left->meter_number, (string) $right->meter_number);
            })
            ->values();

        $unitGroups = $meters
            ->groupBy(fn (Meter $meter): string => (string) $meter->unit_id)
            ->map(fn (Collection $unitMeters) => $this->unitData($unitMeters, $date1, $date2))
            ->values();

        $typeSummaries = $this->typeSummaries($unitGroups);
        $meterCount = $unitGroups->sum(fn (array $unit): int => (int) $unit['meterCount']);
        $missingReadingCount = $unitGroups->sum(fn (array $unit): int => (int) $unit['missingReadingCount']);
        $missingMeterCount = $unitGroups->sum(fn (array $unit): int => (int) $unit['missingMeterCount']);

        return [
            'title' => 'Zähler-Verbrauchsreport',
            'property' => [
                'id' => (string) $property->id,
                'number' => (string) $property->property_number,
                'name' => (string) $property->name,
                'label' => trim((string) $property->property_number.' · '.(string) $property->name, ' ·'),
                'address' => trim(implode(' · ', array_filter([
                    (string) $property->address,
                    trim((string) $property->postal_code.' '.(string) $property->city),
                ]))),
            ],
            'referenceDate1' => $date1,
            'referenceDate2' => $date2,
            'referenceDate1Label' => $referenceDate1->format('d.m.Y'),
            'referenceDate2Label' => $referenceDate2->format('d.m.Y'),
            'generatedAt' => now()->format('d.m.Y H:i'),
            'scope' => $contract ? [
                'type' => 'contract',
                'contractId' => (string) $contract->id,
                'contractNumber' => (string) $contract->contract_number,
                'unitId' => (string) $contractAssignment->unit_id,
                'note' => 'Ein Vertragsbezug ist eine zeitliche Eingrenzung der zugeordneten Einheit; der Report ist keine Heizkostenabrechnung.',
            ] : ['type' => 'property'],
            'units' => $unitGroups->all(),
            'typeSummaries' => $typeSummaries->all(),
            'summary' => [
                'unitCount' => $unitGroups->count(),
                'meterCount' => $meterCount,
                'missingReadingCount' => $missingReadingCount,
                'missingMeterCount' => $missingMeterCount,
                'completeMeterCount' => max(0, $meterCount - $missingMeterCount),
            ],
            'filename' => 'Zaehler-Verbrauch-'.($contract ? $contract->contract_number : $property->property_number).'-'.$date1.'-'.$date2.'.pdf',
        ];
    }

    /**
     * Contract-specific reports must not include another tenant's consumption.
     * Both reference dates must belong to the effective contract-unit interval.
     * No interpolated, prorated or cross-meter consumption is invented.
     */
    private function contractAssignment(Contract $contract, Property $property, string $date1, string $date2): \App\Models\ContractUnit
    {
        if (! in_array($contract->status, ['active', 'ended', 'archived'], true)) {
            throw ValidationException::withMessages([
                'contract' => 'Ein Vertrags-Verbrauchsreport ist erst für einen aktiven oder abgeschlossenen Vertrag möglich.',
            ]);
        }

        $assignment = $contract->units()->first();
        $unit = $assignment?->unit()->first();
        if (! $assignment || ! $unit || (string) $unit->property_id !== (string) $property->id) {
            throw ValidationException::withMessages(['contract' => 'Dem Vertrag ist keine eindeutige Einheit dieses Objekts zugeordnet.']);
        }

        $from = collect([$assignment->valid_from?->toDateString(), $contract->starts_on?->toDateString()])
            ->filter()->sortDesc()->first();
        $until = collect([$assignment->valid_until?->toDateString(), $contract->confirmed_end_on?->toDateString()])
            ->filter()->sort()->first();

        if (! $from || $date1 < $from || ($until && $date2 > $until)) {
            throw ValidationException::withMessages([
                'referenceDate1' => 'Beide Bezugsdaten müssen vollständig innerhalb der wirksamen Vertrags- und Einheitenzuordnung liegen.',
            ]);
        }

        return $assignment;
    }

    /** Resolve the owning property from the canonical contract-unit relationship. */
    public function propertyForContract(Contract $contract): Property
    {
        $assignment = $contract->units()->first();
        $propertyId = $assignment?->unit()->value('property_id');
        if (! $propertyId) {
            throw ValidationException::withMessages(['contract' => 'Für diesen Vertrag ist keine Einheit zugeordnet.']);
        }

        return Property::query()->findOrFail($propertyId);
    }

    /** @return array<string, mixed> */
    private function unitData(Collection $meters, string $date1, string $date2): array
    {
        /** @var Meter $first */
        $first = $meters->first();
        $unit = $first->unit;
        $rows = $meters->map(fn (Meter $meter): array => $this->meterRow($meter, $date1, $date2))->values();
        $missingReadingCount = $rows->sum(fn (array $row): int => ((bool) $row['reading1Missing'] ? 1 : 0) + ((bool) $row['reading2Missing'] ? 1 : 0));
        $missingMeterCount = $rows->filter(fn (array $row): bool => (bool) $row['missing'])->count();

        return [
            'id' => (string) $unit?->id,
            'number' => (string) ($unit?->unit_number ?? ''),
            'name' => (string) ($unit?->name ?? ''),
            'label' => trim((string) ($unit?->unit_number ?? '').' · '.(string) ($unit?->name ?? ''), ' ·'),
            'meterCount' => $rows->count(),
            'missingReadingCount' => $missingReadingCount,
            'missingMeterCount' => $missingMeterCount,
            'meters' => $rows->all(),
        ];
    }

    /** @return Collection<int, array<string, mixed>> */
    private function typeSummaries(Collection $units): Collection
    {
        $rows = $units->flatMap(fn (array $unit): array => (array) ($unit['meters'] ?? []));

        return $rows
            ->groupBy(fn (array $row): string => $row['type'].'|'.$row['unitOfMeasure'])
            ->map(function (Collection $groupRows): array {
                $firstRow = (array) $groupRows->first();
                $missingDate1 = $groupRows->contains(fn (array $row): bool => (bool) ($row['reading1Missing'] ?? false));
                $missingDate2 = $groupRows->contains(fn (array $row): bool => (bool) ($row['reading2Missing'] ?? false));
                $reading1Sum = round($groupRows->sum(fn (array $row): float => (float) ($row['reading1'] ?? 0)), 3);
                $reading2Sum = round($groupRows->sum(fn (array $row): float => (float) ($row['reading2'] ?? 0)), 3);
                $complete = ! $missingDate1 && ! $missingDate2;

                return [
                    'type' => (string) ($firstRow['type'] ?? ''),
                    'typeLabel' => (string) ($firstRow['typeLabel'] ?? 'Zähler'),
                    'unitOfMeasure' => (string) ($firstRow['unitOfMeasure'] ?? ''),
                    'meterCount' => $groupRows->count(),
                    'reading1' => $reading1Sum,
                    'reading2' => $reading2Sum,
                    'consumption' => $complete ? round($reading2Sum - $reading1Sum, 3) : null,
                    'reading1Complete' => ! $missingDate1,
                    'reading2Complete' => ! $missingDate2,
                    'complete' => $complete,
                ];
            })
            ->sortBy(fn (array $group): array => [self::TYPE_ORDER[$group['type']] ?? 999, $group['typeLabel'], $group['unitOfMeasure']])
            ->values();
    }

    /** @return array<string, mixed> */
    private function meterRow(Meter $meter, string $date1, string $date2): array
    {
        $reading1 = $meter->readings->first(fn ($reading): bool => $reading->reference_date?->toDateString() === $date1);
        $reading2 = $meter->readings->first(fn ($reading): bool => $reading->reference_date?->toDateString() === $date2);
        $value1 = $reading1 === null ? null : round((float) $reading1->value, 3);
        $value2 = $reading2 === null ? null : round((float) $reading2->value, 3);

        return [
            'id' => (string) $meter->id,
            'meterNumber' => (string) $meter->meter_number,
            'type' => (string) $meter->meter_type,
            'typeLabel' => $this->typeLabel((string) $meter->meter_type),
            'unitOfMeasure' => (string) $meter->unit_of_measure,
            'location' => (string) ($meter->location ?? ''),
            'reading1' => $value1,
            'reading2' => $value2,
            'difference' => $value1 === null || $value2 === null ? null : round($value2 - $value1, 3),
            'reading1Missing' => $value1 === null,
            'reading2Missing' => $value2 === null,
            'missing' => $value1 === null || $value2 === null,
        ];
    }

    private function typeLabel(string $type): string
    {
        return match ($type) {
            'heat' => 'Wärmemenge',
            'hot_water' => 'Warmwasser',
            'cold_water' => 'Kaltwasser',
            default => Meter::typeLabel($type),
        };
    }
}
