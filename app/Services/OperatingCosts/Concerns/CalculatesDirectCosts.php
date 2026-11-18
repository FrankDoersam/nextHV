<?php

namespace App\Services\OperatingCosts\Concerns;

use App\Models\DirectAllocation;
use App\Models\Unit;
use App\Support\Formatting\OperatingCostDisplayFormatter;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

trait CalculatesDirectCosts
{
    private function directAllocationCosts(Collection $units): array
    {
        return DirectAllocation::query()
            ->with(['propertyAccount.costType', 'propertyAccount.allocationKey', 'scopedUnits'])
            ->where('property_id', $this->unit->property_id)
            ->whereBetween('service_date', [$this->periodFrom, $this->periodUntil])
            ->orderBy('service_date')
            ->get()
            ->flatMap(function (DirectAllocation $allocation) use ($units): array {
                if ($allocation->allocation_mode === 'contract'
                    && (string) $allocation->contract_id !== (string) $this->contract->id) {
                    return [];
                }

                if ($allocation->allocation_mode === 'unit'
                    && (string) $allocation->unit_id !== (string) $this->unit->id) {
                    return [];
                }

                $account = $allocation->propertyAccount;
                $amount = (float) $allocation->amount;
                if (abs($amount) < 0.005) {
                    return [];
                }

                $categoryLabel = $this->directAllocationCategoryLabel($allocation);
                $label = $categoryLabel ?: ($allocation->title ?: $account?->costType?->name ?: 'Direktumlage');
                $details = $this->directAllocationDetails($allocation, $categoryLabel);

                if (in_array($allocation->allocation_mode, ['contract', 'unit'], true)) {
                    $key = $allocation->allocation_mode === 'contract' ? 'contract' : 'direct_unit';

                    return [[
                        'sourceType' => 'direct_allocation',
                        'sourceId' => (string) $allocation->id,
                        'label' => $label,
                        'positionLabel' => $this->directAllocationPositionLabel($allocation),
                        'serviceDate' => $allocation->service_date?->toDateString(),
                        'allocationKey' => $key,
                        'allocationKeyName' => $key === 'contract' ? 'Direkt auf Vertrag' : 'Direkt auf Einheit',
                        'splitPercent' => 100.0,
                        'totalAmount' => round($amount, 2),
                        'factor' => 1.0,
                        'allocatedAmount' => round($amount, 2),
                        'calculationLine' => $this->buildCalculationLine([
                            'prefix' => 'direkt zugeordnet',
                            'result' => OperatingCostDisplayFormatter::money(round($amount, 2)),
                        ]),
                        'details' => $details,
                        'account' => $this->accountSnapshot($account, $key),
                        'category' => 'direct',
                    ]];
                }

                if (! $account) {
                    throw ValidationException::withMessages([
                        'directAllocations' => "Für die objektbezogene Direktumlage „{$label}“ ist kein Objektkonto hinterlegt.",
                    ]);
                }

                return collect($this->allocateSplits(
                    $account->allocationSplits(),
                    $this->eligibleUnits($allocation, $units),
                    'direct_allocation',
                    (string) $allocation->id,
                    $label,
                    $amount,
                    $details,
                    $account,
                    $label,
                ))->map(function (array $row) use ($allocation): array {
                    $row['positionLabel'] = $this->directAllocationPositionLabel($allocation);
                    $row['serviceDate'] = $allocation->service_date?->toDateString();
                    $row['category'] = 'direct';

                    return $row;
                })->all();
            })
            ->filter()
            ->values()
            ->all();
    }

    private function directAllocationCategoryLabel(DirectAllocation $allocation): string
    {
        return trim((string) (
            $allocation->propertyAccount?->custom_label
            ?: $allocation->propertyAccount?->costType?->name
            ?: $allocation->title
            ?: 'Direktumlage'
        ));
    }

    private function directAllocationPositionLabel(DirectAllocation $allocation): string
    {
        return $allocation->service_date?->format('d.m.Y')
            ?: trim((string) $allocation->title)
            ?: $this->directAllocationCategoryLabel($allocation);
    }

    private function directAllocationDetails(DirectAllocation $allocation, string $categoryLabel): string
    {
        $title = trim((string) $allocation->title);
        $reference = trim((string) $allocation->reference_number);
        $notes = trim((string) $allocation->notes);

        return collect([
            $allocation->service_date ? 'Leistungsdatum: '.$allocation->service_date->format('d.m.Y') : null,
            $title !== '' && mb_strtolower($title) !== mb_strtolower($categoryLabel) ? 'Bezeichnung: '.$title : null,
            $reference !== '' ? 'Referenz: '.$reference : null,
            $notes !== '' ? 'Hinweis: '.$notes : null,
        ])->filter()->join("\n");
    }

    private function eligibleUnits(DirectAllocation $allocation, Collection $units): Collection
    {
        $ids = $allocation->scopedUnitIds();

        return $ids === [] ? $units : $units->whereIn('id', $ids)->values();
    }
}
