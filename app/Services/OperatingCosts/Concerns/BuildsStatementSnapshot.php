<?php

namespace App\Services\OperatingCosts\Concerns;

use App\Models\BusinessPartner;
use App\Models\PropertyAccount;
use App\Models\Unit;
use Illuminate\Support\Collection;

trait BuildsStatementSnapshot
{
    private function recipientSnapshot(): array
    {
        $partners = $this->contract->correspondencePartiesDuring($this->usageFrom, $this->usageUntil)
            ->pluck('businessPartner')
            ->filter()
            ->unique('id')
            ->values();
        $names = $partners
            ->map(fn (BusinessPartner $partner): string => trim((string) $partner->display_name))
            ->filter()
            ->values();
        $address = $partners
            ->flatMap(fn (BusinessPartner $partner) => $partner->addresses
                ->filter(fn ($row): bool => $row->isCurrentlyValid())
                ->sortByDesc('is_primary'))
            ->first();
        $addressLines = $address ? array_values(array_filter([
            trim((string) $address->street.' '.(string) $address->house_number),
            trim((string) $address->postal_code.' '.(string) $address->city),
        ])) : [];

        return [
            'names' => $names->all(),
            'addressLines' => $addressLines,
            'lines' => [...$names->all(), ...$addressLines],
            'salutation' => $this->salutation($partners),
        ];
    }

    private function salutation(Collection $partners): string
    {
        $parts = $partners->map(function (BusinessPartner $partner): ?string {
            $profile = $partner->personProfile;
            if (! $profile) {
                return null;
            }
            $lastName = trim((string) $profile->last_name);

            return match (mb_strtolower(trim((string) $profile->salutation))) {
                'frau' => $lastName !== '' ? "Sehr geehrte Frau {$lastName}," : 'Sehr geehrte Dame,',
                'herr' => $lastName !== '' ? "Sehr geehrter Herr {$lastName}," : 'Sehr geehrter Herr,',
                default => $lastName !== '' ? "Guten Tag {$lastName}," : null,
            };
        })->filter()->unique()->values();

        return $parts->isNotEmpty() ? $parts->join("\n") : 'Sehr geehrte Damen und Herren,';
    }

    private function allocationSnapshot(Collection $units): array
    {
        $areaRows = $units->map(fn (Unit $unit): array => [
            'unit' => collect([$unit->unit_number, $unit->name])->filter()->join(' · '),
            'value' => round($this->unitArea($unit), 2),
        ])->values();

        return [
            'areas' => [
                'total' => round($areaRows->sum('value'), 2),
                'own' => round($this->unitArea($this->unit), 2),
                'rows' => $areaRows->all(),
            ],
            'units' => [
                'total' => $units->count(),
                'own' => 1,
                'rows' => $units->map(fn (Unit $unit): array => [
                    'unit' => collect([$unit->unit_number, $unit->name])->filter()->join(' · '),
                    'value' => 1,
                ])->values()->all(),
            ],
        ];
    }

    private function personDaySnapshot(): array
    {
        $property = $this->personDays->forProperty(
            (string) $this->unit->property_id,
            $this->periodFrom,
            $this->periodUntil,
        );

        return [
            'label' => 'Personentage',
            'total' => (int) ($property['total'] ?? 0),
            'own' => $this->personDays->forContract(
                $this->contract,
                $this->periodFrom,
                $this->periodUntil,
            ),
            'details' => $property['details'] ?? [],
            'contractPeriods' => $property['contractPeriods'] ?? [],
        ];
    }

    private function accountSnapshot(?PropertyAccount $account, string $allocationKey): array
    {
        $costType = $account?->costType;
        $directTarget = match ($allocationKey) {
            'contract' => PropertyAccount::TARGET_CONTRACT,
            'direct_unit' => PropertyAccount::TARGET_UNIT,
            default => PropertyAccount::TARGET_DISTRIBUTED,
        };

        return [
            'id' => $account?->id,
            'number' => $costType?->number,
            'name' => $costType?->name,
            'label' => $account?->custom_label ?: $costType?->name,
            'group' => $costType?->group_name,
            'billingType' => $costType?->billing_type,
            'directTarget' => $directTarget,
            'isDirect' => $directTarget !== PropertyAccount::TARGET_DISTRIBUTED,
        ];
    }

    private function syntheticCostRow(
        string $sourceType,
        string $sourceId,
        string $label,
        string $allocationKey,
        string $allocationKeyName,
        float $totalAmount,
        float $factor,
        float $allocatedAmount,
        ?string $details,
        string $category,
    ): array {
        return [
            'sourceType' => $sourceType,
            'sourceId' => $sourceId,
            'label' => $label,
            'allocationKey' => $allocationKey,
            'allocationKeyName' => $allocationKeyName,
            'splitPercent' => 100.0,
            'totalAmount' => round($totalAmount, 2),
            'factor' => round($factor, 8),
            'allocatedAmount' => round($allocatedAmount, 2),
            'details' => $details,
            'account' => [
                'id' => null,
                'number' => null,
                'name' => 'Interne Heizkostenberechnung',
                'label' => 'Interne Heizkostenberechnung',
                'group' => 'Heizkosten',
                'billingType' => 'heating',
                'directTarget' => PropertyAccount::TARGET_DISTRIBUTED,
                'isDirect' => false,
            ],
            'category' => $category,
        ];
    }

    private function costCategory(?PropertyAccount $account, string $label, string $sourceType): string
    {
        if ($sourceType === 'direct_allocation') {
            return 'direct';
        }

        $costType = $account?->costType;
        $billingType = mb_strtolower(trim((string) $costType?->billing_type));
        $haystack = mb_strtolower(implode(' ', array_filter([
            $label,
            $costType?->name,
            $costType?->group_name,
            $costType?->number,
            $billingType,
        ])));

        if (in_array($billingType, ['heating', 'heating_cost'], true) || $this->containsAny($haystack, [
            'heiz', 'wärme', 'waerme', 'warmwasser', 'gas', 'heizöl', 'heizoel', 'fernwärme', 'fernwaerme',
        ])) {
            return 'heating';
        }
        if ($this->containsAny($haystack, ['wasser', 'abwasser', 'kanal', 'niederschlag'])) {
            return 'water';
        }
        if ($this->containsAny($haystack, [
            'müll', 'muell', 'abfall', 'tonne', 'container', 'entsorgung', 'sperrmüll', 'sperrmuell',
        ])) {
            return 'waste';
        }

        return 'general';
    }

    private function unitArea(Unit $unit): float
    {
        return (float) (
            $unit->billing_area_sqm
            ?: $unit->living_area_sqm
            ?: $unit->usable_area_sqm
            ?: 0
        );
    }

    private function containsAny(string $haystack, array $needles): bool
    {
        foreach ($needles as $needle) {
            if (str_contains($haystack, $needle)) {
                return true;
            }
        }

        return false;
    }
}
