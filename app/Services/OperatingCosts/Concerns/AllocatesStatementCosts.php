<?php

namespace App\Services\OperatingCosts\Concerns;

use App\Models\AllocationKey;
use App\Models\IncomingInvoiceItem;
use App\Models\PropertyAccount;
use App\Models\Unit;
use App\Support\Formatting\OperatingCostDisplayFormatter;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

trait AllocatesStatementCosts
{
    private function allocateByAccount(PropertyAccount $account, Collection $units, string $sourceType, string $sourceId, string $label, float $amount, ?string $details): array
    {
        return $this->allocateSplits($account->allocationSplits(), $units, $sourceType, $sourceId, $label, $amount, $details, $account, $label);
    }

    private function allocateSplits(array $splits, Collection $units, string $sourceType, string $sourceId, string $label, float $amount, ?string $details, ?PropertyAccount $account = null, ?string $allocationContext = null): array
    {
        if (abs($amount) < 0.005) return [];
        $splits = collect($splits)->filter(fn (mixed $split): bool => is_array($split) && (float) ($split['sharePercent'] ?? 0) > 0)->values();
        $accountLabel = $account?->custom_label ?: $account?->costType?->name ?: $label;
        if ($splits->isEmpty()) {
            throw ValidationException::withMessages(['propertyAccount' => "Für das Objektkonto „{$accountLabel}“ ist kein gültiger Umlageschlüssel hinterlegt."]);
        }
        $shareTotal = round($splits->sum(fn (array $split): float => (float) ($split['sharePercent'] ?? 0)), 2);
        if (abs($shareTotal - 100.0) > 0.01) {
            throw ValidationException::withMessages(['propertyAccount' => "Die Umlageanteile des Objektkontos „{$accountLabel}“ ergeben {$shareTotal} statt 100 Prozent."]);
        }

        return $splits->map(function (array $split) use ($units, $sourceType, $sourceId, $label, $amount, $details, $account, $accountLabel, $allocationContext): ?array {
            $allocation = $this->resolveAllocationKey($split, $accountLabel);
            $key = $allocation['code'];
            if ($sourceType === 'incoming_invoice' && in_array($key, ['contract', 'direct_unit'], true)) {
                throw ValidationException::withMessages(['propertyAccount' => "Das Objektkonto „{$accountLabel}“ ist als Direktkonto konfiguriert, die Rechnungsposition enthält jedoch kein Vertrags- oder Einheitsziel. Direkte Leistungen müssen als Leistung/Direktumlage erfasst werden."]);
            }
            $splitPercent = (float) ($split['sharePercent'] ?? 0);
            $splitAmount = $amount * $splitPercent / 100;
            $isMixedWater = $key === 'consumption'
                && $this->isMixedWaterAndWastewaterLabel($allocationContext ?: $label, $accountLabel);
            if ($isMixedWater) {
                $this->recordAllocationWarning(
                    'Die Kostenposition „'.$accountLabel.'“ mischt Frischwasser und Schmutzwasser. '
                    .'Für einen nachvollziehbaren Gartenwasserabzug müssen beide Gebührenarten '
                    .'als getrennte Rechnungspositionen/Kostenkonten erfasst werden.',
                );
            }
            $isWastewater = $key === 'consumption'
                && ! $isMixedWater
                && $this->isWastewaterCostLabel($allocationContext ?: $label, $accountLabel);
            $factorData = $key === 'consumption'
                ? $this->meterFactor($this->meterGroupsForLabel($allocationContext ?: $label), $accountLabel, $isWastewater)
                : $this->allocationFactorData($key, $units, $accountLabel);
            $factor = (float) $factorData['factor'];
            if ($factor <= 0) return null;

            $quantityPricing = $key === 'consumption'
                ? $this->quantityPricedIncomingInvoiceAllocation($sourceType, $sourceId, $splitPercent, $factorData)
                : null;
            $totalAmount = (float) ($quantityPricing['totalAmount'] ?? $splitAmount);
            $allocatedAmount = (float) ($quantityPricing['allocatedAmount'] ?? ($splitAmount * $factor));
            $effectiveFactor = (float) ($quantityPricing['factor'] ?? $factor);

            $row = [
                'sourceType' => $sourceType,
                'sourceId' => $sourceId,
                'label' => $label,
                'allocationKey' => $key,
                'allocationKeyName' => $allocation['name'],
                'splitPercent' => round($splitPercent, 2),
                'totalAmount' => round($totalAmount, 2),
                'factor' => round($effectiveFactor, 8),
                'allocatedAmount' => round($allocatedAmount, 2),
                'calculationBaseAmount' => round($amount, 2),
                'details' => $details,
                'account' => $this->accountSnapshot($account, $key),
                'category' => $this->costCategory($account, $label, $sourceType),
            ];
            $row['calculationLine'] = $this->buildAllocationCalculationLine(
                $key,
                $amount,
                $splitPercent,
                $factorData,
                $allocatedAmount,
            );

            if ($isWastewater) {
                // Raw vs. chargeable volume comes from the same snapshot groups.
                // A marked garden meter stays in the freshwater quantity.
                $meterKeys = $this->meterGroupsForLabel($allocationContext ?: $label);
                $rawOwn = collect($meterKeys)->sum(fn (string $group): float => (float) data_get($this->meterGroups, $group.'.own', 0));
                $row['wastewaterAdjustment'] = [
                    'freshwaterConsumption' => round($rawOwn, 3),
                    'excludedConsumption' => round(max(0.0, $rawOwn - (float) ($factorData['own'] ?? 0)), 3),
                    'chargeableConsumption' => round((float) ($factorData['own'] ?? 0), 3),
                ];
            }

            if ($quantityPricing !== null) {
                $row['quantityPricing'] = $quantityPricing['meta'];
                // Backward-compatible key consumed by the existing water PDF presentation.
                $row['wastewaterQuantityPricing'] = $quantityPricing['meta'];
            }

            return $row;
        })->filter()->values()->all();
    }

    /** @return array{totalAmount:float,factor:float,allocatedAmount:float,meta:array<string,mixed>}|null */
    private function quantityPricedIncomingInvoiceAllocation(string $sourceType, string $sourceId, float $splitPercent, array $factorData): ?array
    {
        if ($sourceType !== 'incoming_invoice') return null;

        $ownConsumption = (float) ($factorData['own'] ?? 0);
        $meterUnit = $this->canonicalConsumptionUnit((string) ($factorData['unit'] ?? ''));
        if ($ownConsumption <= 0 || $meterUnit === null) return null;

        $item = IncomingInvoiceItem::query()->with('invoice:id,document_type')->find($sourceId);
        if (! $item) return null;

        $quantity = (float) ($item->quantity ?? 0);
        $gross = (float) ($item->gross_amount ?? 0) * (in_array($item->invoice?->document_type, ['supplier_credit', 'credit'], true) ? -1 : 1);
        $invoiceUnit = $this->canonicalConsumptionUnit((string) ($item->unit ?? ''));
        if ($quantity <= 0 || abs($gross) < 0.005 || $invoiceUnit === null || $invoiceUnit !== $meterUnit) return null;

        $splitGross = $gross * $splitPercent / 100;
        if (abs($splitGross) < 0.005) return null;

        $unitPrice = $splitGross / $quantity;
        $allocatedAmount = $ownConsumption * $unitPrice;
        $displayUnit = $this->displayConsumptionUnit($meterUnit);

        return [
            'totalAmount' => round($splitGross, 2),
            'factor' => round($allocatedAmount / $splitGross, 8),
            'allocatedAmount' => round($allocatedAmount, 2),
            'meta' => [
                'invoiceGrossAmount' => round($gross, 2),
                'invoiceQuantity' => round($quantity, 3),
                'unit' => $displayUnit,
                'unitPrice' => round($unitPrice, 6),
                'ownConsumption' => round($ownConsumption, 3),
                'totalMeterConsumption' => round((float) ($factorData['total'] ?? 0), 3),
            ],
        ];
    }

    private function canonicalConsumptionUnit(string $unit): ?string
    {
        return match (mb_strtolower(trim($unit))) {
            'm3', 'm³', 'cbm' => 'm3',
            'kwh' => 'kwh',
            'mwh' => 'mwh',
            'l', 'liter', 'litre' => 'l',
            'units', 'einheiten' => 'units',
            default => null,
        };
    }

    private function displayConsumptionUnit(string $unit): string
    {
        return OperatingCostDisplayFormatter::unit($unit);
    }

    /** @return array{code:string,name:string} */
    private function resolveAllocationKey(array $split, string $accountLabel): array
    {
        $allocationKey = null;
        $keyId = trim((string) ($split['allocationKeyId'] ?? ''));
        if ($keyId !== '') $allocationKey = $this->allocationKeys->get($keyId);
        $keyCode = trim((string) ($split['allocationKeyCode'] ?? ''));
        if (! $allocationKey && $keyCode !== '') $allocationKey = $this->allocationKeysByCode->get(mb_strtolower($keyCode));
        $rawCode = trim((string) ($allocationKey?->code ?: $keyCode));
        if ($rawCode === '') {
            throw ValidationException::withMessages(['propertyAccount' => "Ein Umlageschlüssel des Objektkontos „{$accountLabel}“ kann nicht mehr aufgelöst werden."]);
        }
        $code = $this->canonicalAllocationKey($rawCode);
        if (! in_array($code, ['living_area', 'persons', 'person_days', 'units', 'residential_units', 'consumption', 'ownership_share', 'contract', 'direct_unit'], true)) {
            throw ValidationException::withMessages(['propertyAccount' => "Der Umlageschlüssel „{$rawCode}“ des Objektkontos „{$accountLabel}“ wird von der Abrechnung nicht unterstützt."]);
        }

        return ['code' => $code, 'name' => $allocationKey?->name ?: $this->allocationKeyFallbackLabel($code)];
    }

    /** @return array{factor:float,text:?string,own?:float,total?:float,usageFactor?:float,unit?:string} */
    private function allocationFactorData(string $key, Collection $units, string $accountLabel): array
    {
        if (! $units->contains('id', $this->unit->id)) return ['factor' => 0.0, 'text' => null];
        if ($key === 'contract') return ['factor' => 1.0, 'own' => 1, 'total' => 1, 'text' => 'Direkte Vertragszuordnung'];
        if ($key === 'direct_unit') return ['factor' => 1.0, 'own' => 1, 'total' => 1, 'text' => 'Direkte Einheitszuordnung'];
        if ($key === 'living_area') {
            $own = $this->unitArea($this->unit);
            $total = $units->sum(fn (Unit $unit): float => $this->unitArea($unit));
            if ($total <= 0) throw ValidationException::withMessages(['propertyAccount' => "Für die Flächenumlage des Objektkontos „{$accountLabel}“ sind keine abrechenbaren Flächen hinterlegt."]);
            $areaFactor = $own / $total;
            $usageFactor = $this->usageTimeFactor();
            $factor = $areaFactor * $usageFactor;

            return [
                'factor' => $factor,
                'own' => $own,
                'total' => $total,
                'usageFactor' => $usageFactor,
                'text' => null,
            ];
        }
        if (in_array($key, ['persons', 'person_days'], true)) {
            $total = $this->personDayTotalForUnits($units);
            $own = (float) $this->personDays->forContract($this->contract, $this->periodFrom, $this->periodUntil);
            if ($total <= 0) throw ValidationException::withMessages(['propertyAccount' => "Für die Personentage-Umlage des Objektkontos „{$accountLabel}“ sind im ausgewählten Einheitenkreis keine aktiven Mieterparteien ermittelbar."]);
            $factor = $own / $total;

            return ['factor' => $factor, 'own' => $own, 'total' => $total, 'text' => null];
        }
        if (in_array($key, ['units', 'residential_units'], true)) {
            $eligible = $key === 'residential_units' ? $units->filter(fn (Unit $unit): bool => $unit->unit_type === 'apartment')->values() : $units;
            $own = $eligible->contains('id', $this->unit->id) ? 1 : 0;
            $total = $eligible->count();
            $baseFactor = $own > 0 && $total > 0 ? 1 / $total : 0.0;
            $usageFactor = $this->usageTimeFactor();
            $factor = $baseFactor * $usageFactor;
            $label = $key === 'residential_units' ? 'Wohnungen' : 'Einheiten';

            return [
                'factor' => $factor,
                'own' => $own,
                'total' => $total,
                'usageFactor' => $usageFactor,
                'text' => null,
            ];
        }
        if ($key === 'ownership_share') {
            throw ValidationException::withMessages(['propertyAccount' => "Für den Miteigentumsanteil des Objektkontos „{$accountLabel}“ existieren im neuen Modell noch keine belastbaren Einheitsanteile. Eine Gleichverteilung wird ausdrücklich nicht als Ersatz verwendet."]);
        }

        return ['factor' => 0.0, 'text' => null];
    }

    private function allocationFactor(string $key, Collection $units, string $accountLabel): float
    {
        return (float) $this->allocationFactorData($key, $units, $accountLabel)['factor'];
    }

    private function buildAllocationCalculationLine(
        string $key,
        float $baseAmount,
        float $splitPercent,
        array $factorData,
        float $allocatedAmount,
    ): ?string {
        $factors = [];
        if ($splitPercent < 99.999999) {
            $factors[] = OperatingCostDisplayFormatter::percent($splitPercent / 100);
        }

        $factor = (float) ($factorData['factor'] ?? 0);
        if ($key === 'living_area') {
            $own = (float) ($factorData['own'] ?? 0);
            $total = (float) ($factorData['total'] ?? 0);
            $baseFactor = $total > 0 ? $own / $total : 0.0;
            if ($baseFactor < 0.999999 && $own > 0 && $total > 0) {
                $factors[] = OperatingCostDisplayFormatter::squareMeters($own).' / '.OperatingCostDisplayFormatter::squareMeters($total);
            }
            $time = $this->usageTimeCalculationPart();
            if ($time !== null) {
                $factors[] = $time;
            }
        } elseif (in_array($key, ['persons', 'person_days'], true)) {
            $own = (float) ($factorData['own'] ?? 0);
            $total = (float) ($factorData['total'] ?? 0);
            if ($own > 0 && $total > 0 && $own < $total) {
                $factors[] = OperatingCostDisplayFormatter::integer($own).' / '.OperatingCostDisplayFormatter::integer($total).' Personentage';
            }
        } elseif (in_array($key, ['units', 'residential_units'], true)) {
            $own = (int) round((float) ($factorData['own'] ?? 0));
            $total = (int) round((float) ($factorData['total'] ?? 0));
            $label = $key === 'residential_units' ? 'Wohnungen' : 'Einheiten';
            if ($own > 0 && $total > 0 && $own < $total) {
                $ownLabel = $own === 1
                    ? ($key === 'residential_units' ? '1 Wohnung' : '1 Einheit')
                    : OperatingCostDisplayFormatter::integer($own).' '.$label;
                $factors[] = '/ '.OperatingCostDisplayFormatter::integer($total).' '.$label;
                $factors[] = $ownLabel;
            }
            $time = $this->usageTimeCalculationPart();
            if ($time !== null) {
                $factors[] = $time;
            }
        } elseif ($key === 'consumption') {
            $own = (float) ($factorData['own'] ?? 0);
            $total = (float) ($factorData['total'] ?? 0);
            $unit = OperatingCostDisplayFormatter::unit((string) ($factorData['unit'] ?? ''));
            if ($own > 0 && $total > 0 && $own < $total) {
                $factors[] = OperatingCostDisplayFormatter::quantity($own, $unit).' / '.OperatingCostDisplayFormatter::quantity($total, $unit);
            }
        } elseif (in_array($key, ['contract', 'direct_unit'], true)) {
            return $this->buildCalculationLine([
                'prefix' => 'direkt zugeordnet',
                'result' => OperatingCostDisplayFormatter::money($allocatedAmount),
            ]);
        }

        if ($factors === [] && $factor <= 0) {
            return null;
        }

        return $this->buildCalculationLine([
            'base' => OperatingCostDisplayFormatter::money($baseAmount),
            'factors' => $factors,
            'result' => OperatingCostDisplayFormatter::money($allocatedAmount),
        ]);
    }

    private function usageTimeCalculationPart(): ?string
    {
        $periodDays = max(1, $this->periodFrom->diffInDays($this->periodUntil) + 1);
        $usageFrom = $this->usageFrom->greaterThan($this->periodFrom) ? $this->usageFrom : $this->periodFrom;
        $usageUntil = $this->usageUntil->lessThan($this->periodUntil) ? $this->usageUntil : $this->periodUntil;
        if ($usageUntil->lt($usageFrom)) return null;

        $usageDays = $usageFrom->diffInDays($usageUntil) + 1;
        if ($usageDays >= $periodDays) return null;

        return $usageDays.'/'.$periodDays.' Tage';
    }

    private function usageTimeFactor(): float
    {
        $periodDays = max(1, $this->periodFrom->diffInDays($this->periodUntil) + 1);
        $usageFrom = $this->usageFrom->greaterThan($this->periodFrom) ? $this->usageFrom : $this->periodFrom;
        $usageUntil = $this->usageUntil->lessThan($this->periodUntil) ? $this->usageUntil : $this->periodUntil;
        if ($usageUntil->lt($usageFrom)) return 0.0;

        $usageDays = $usageFrom->diffInDays($usageUntil) + 1;

        return min(1.0, max(0.0, $usageDays / $periodDays));
    }

    private function usageTimeText(float $usageFactor): string
    {
        $periodDays = max(1, $this->periodFrom->diffInDays($this->periodUntil) + 1);
        $usageFrom = $this->usageFrom->greaterThan($this->periodFrom) ? $this->usageFrom : $this->periodFrom;
        $usageUntil = $this->usageUntil->lessThan($this->periodUntil) ? $this->usageUntil : $this->periodUntil;
        if ($usageUntil->lt($usageFrom)) return ' · 0/'.$periodDays.' Tage';

        $usageDays = $usageFrom->diffInDays($usageUntil) + 1;
        if ($usageDays >= $periodDays) return '';

        return ' · '.$usageDays.'/'.$periodDays.' Tage';
    }

    private function personDayTotalForUnits(Collection $units): float
    {
        $unitIds = $units->pluck('id')->map(fn ($id): string => (string) $id)->unique()->values();
        if ($unitIds->isEmpty()) return 0.0;

        return $this->personDays
            ->activeContracts((string) $this->unit->property_id, $this->periodFrom, $this->periodUntil)
            ->filter(fn ($contract): bool => $unitIds->contains((string) $contract->effectiveMainUnitId()))
            ->sum(fn ($contract): int => $this->personDays->forContract($contract, $this->periodFrom, $this->periodUntil));
    }

    /** @return array{factor:float,text:string,own?:float,total?:float,unit?:string} */
    private function meterFactor(array $groupKeys, string $accountLabel, bool $forWastewater = false): array
    {
        $own = 0.0;
        $total = 0.0;
        $units = [];
        $labels = [];
        foreach (array_values(array_unique($groupKeys)) as $key) {
            $group = $this->meterGroups[$key] ?? null;
            if (! $group) continue;
            $own += (float) ($group[$forWastewater ? 'wastewaterOwn' : 'own'] ?? $group['own'] ?? 0);
            $total += (float) ($group[$forWastewater ? 'wastewaterTotal' : 'total'] ?? $group['total'] ?? 0);
            if (! empty($group['unit'])) $units[] = (string) $group['unit'];
            if (! empty($group['label'])) $labels[] = (string) $group['label'];
        }
        if ($total <= 0) {
            // An all-exempt set of valid freshwater meters is a legitimate
            // zero sewer volume, not a missing reading or incomplete account.
            $freshwaterTotal = collect($groupKeys)->sum(
                fn (string $key): float => (float) data_get($this->meterGroups, $key.'.total', 0),
            );
            if ($forWastewater && $freshwaterTotal > 0) {
                return ['factor' => 0.0, 'text' => null, 'own' => 0.0, 'total' => 0.0, 'unit' => 'm3'];
            }

            $message = 'Für die Verbrauchsumlage des Objektkontos „'.$accountLabel.'“ fehlen vollständige abrechnungsrelevante Zählerstände oder eine passende Zählergruppe ('.implode(', ', $groupKeys).'). Die Position wird in dieser Abrechnung nicht angesetzt; bitte Zählerstände nachpflegen oder den Umlageschlüssel bewusst anpassen.';
            $this->recordAllocationWarning($message);

            return ['factor' => 0.0, 'text' => $message, 'own' => $own, 'total' => $total, 'unit' => null];
        }
        $unit = count(array_unique($units)) === 1 ? $units[0] : 'Einheiten';
        $factor = $own / $total;

        return [
            'factor' => $factor,
            'own' => $own,
            'total' => $total,
            'unit' => $unit,
            'text' => null,
        ];
    }

    private function recordAllocationWarning(string $message): void
    {
        $message = trim($message);
        if ($message === '') return;

        $this->allocationWarnings[] = $message;
    }

    private function isMixedWaterAndWastewaterLabel(string $description, string $accountLabel = ''): bool
    {
        $text = mb_strtolower($description.' '.$accountLabel);

        return $this->containsAny($text, [
            'wasser und abwasser', 'wasser/abwasser', 'wasser- und abwasser',
            'frisch- und schmutzwasser', 'frischwasser und schmutzwasser',
            'wasserversorgung und entwässerung', 'wasserversorgung und entwaesserung',
        ]);
    }

    private function isWastewaterCostLabel(string $description, string $accountLabel = ''): bool
    {
        $text = mb_strtolower($description.' '.$accountLabel);
        // Mixed water/sewer invoices must be split before an exempt m3 can
        // reduce only the correct sub-position. Rainwater is area based.
        if (str_contains($text, 'niederschlag') || $this->isMixedWaterAndWastewaterLabel($description, $accountLabel)) {
            return false;
        }

        return $this->containsAny($text, [
            'schmutzwasser', 'abwasser', 'entwässerung', 'entwaesserung',
            'kanalgebühr', 'kanalgebuehr', 'kanalwasser', 'kanal',
        ]);
    }

    /** @return array<int,string> */
    private function meterGroupsForLabel(string $label): array
    {
        $value = mb_strtolower($label);
        if ($this->containsAny($value, ['schmutzwasser', 'abwasser', 'entwässerung', 'entwaesserung', 'kanal'])) return ['water', 'garden'];
        if ($this->containsAny($value, ['garten', 'außenwasser', 'aussenwasser', 'bewässerung', 'bewaesserung'])) return ['garden'];
        if ($this->containsAny($value, ['warmwasser', 'wassererwärmung', 'wassererwaermung'])) return ['hot_water'];
        if ($this->containsAny($value, ['frischwasser', 'kaltwasser', 'trinkwasser', 'wasser'])) return ['water'];
        if ($this->containsAny($value, ['heiz', 'wärme', 'waerme'])) return ['heating'];

        return ['water', 'hot_water'];
    }

    private function canonicalAllocationKey(string $key): string
    {
        $key = mb_strtolower(trim($key));

        return match ($key) {
            'area', 'billing_area', 'sqm', 'wohnflaeche', 'wohnfläche', 'flaeche', 'fläche' => 'living_area',
            'occupants', 'personen' => 'persons',
            'personentage', 'personen_tage' => 'person_days',
            'einheiten' => 'units',
            'wohneinheiten', 'wohnungen' => 'residential_units',
            'verbrauch' => 'consumption',
            'miteigentumsanteil', 'mea' => 'ownership_share',
            'direct_contract', 'direkt_vertrag' => 'contract',
            'direkt_einheit' => 'direct_unit',
            default => $key,
        };
    }

    private function allocationKeyFallbackLabel(string $key): string
    {
        return match ($key) {
            'living_area' => 'Wohnfläche',
            'persons' => 'Personen',
            'person_days' => 'Personentage',
            'units' => 'Einheiten',
            'residential_units' => 'Wohneinheiten',
            'consumption' => 'Verbrauch',
            'ownership_share' => 'Miteigentumsanteil',
            'contract' => 'Direkt auf Vertrag',
            'direct_unit' => 'Direkt auf Einheit',
            default => $key,
        };
    }
}
