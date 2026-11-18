<?php

namespace App\Services\OperatingCosts\Concerns;

use App\Models\IncomingInvoice;
use App\Models\IncomingInvoiceItem;
use App\Models\Unit;
use App\Support\Formatting\OperatingCostDisplayFormatter;
use Carbon\Carbon;
use Illuminate\Support\Collection;

trait CalculatesInvoiceCosts
{
    private function invoiceItems(): Collection
    {
        return IncomingInvoiceItem::query()
            ->where('is_allocatable', true)
            ->with([
                'invoice.supplier',
                'invoice.allocations.payment',
                'propertyAccount.costType',
                'propertyAccount.allocationKey',
            ])
            ->whereHas('invoice', fn ($query) => $query
                ->where('property_id', $this->unit->property_id)
                ->whereIn('workflow_status', ['review', 'approved'])
                ->where(function ($period) {
                    $period->where(function ($start) {
                        $start->whereDate('service_period_from', '<=', $this->periodUntil)
                            ->orWhere(fn ($fallback) => $fallback->whereNull('service_period_from')
                                ->whereDate('invoice_date', '<=', $this->periodUntil));
                    })->where(function ($end) {
                        $end->whereDate('service_period_until', '>=', $this->periodFrom)
                            ->orWhere(fn ($fallback) => $fallback->whereNull('service_period_until')
                                ->whereDate('service_period_from', '>=', $this->periodFrom))
                            ->orWhere(fn ($fallback) => $fallback->whereNull('service_period_until')
                                ->whereNull('service_period_from')
                                ->whereDate('invoice_date', '>=', $this->periodFrom));
                    });
                }))
            ->whereHas('propertyAccount', fn ($query) => $query
                ->where('is_active', true)
                ->where(fn ($nested) => $nested->whereNull('valid_from')->orWhereDate('valid_from', '<=', $this->periodUntil))
                ->where(fn ($nested) => $nested->whereNull('valid_until')->orWhereDate('valid_until', '>=', $this->periodFrom)))
            ->orderBy('sort_order')
            ->get();
    }

    /** @param Collection<int, IncomingInvoiceItem> $items */
    private function allocatedInvoiceRows(Collection $items, Collection $units): array
    {
        return $items->flatMap(function (IncomingInvoiceItem $item) use ($units): array {
            $account = $item->propertyAccount;
            if (! $account) return [];

            $period = $this->invoicePeriodAmount($item);
            if (abs($period['amount']) < 0.005) return [];

            $label = $account->custom_label ?: $account->costType?->name ?: $item->description;
            $invoicePresentation = $this->invoicePresentation($item, $period);
            $details = $this->invoicePresentationText($invoicePresentation);

            if ($this->isWaterMeterBaseFee($item) && $this->waterMeterBaseFeeUsesResidentialUnits($item)) {
                $rows = $this->allocateSplits(
                    [['allocationKeyCode' => 'residential_units', 'sharePercent' => 100]],
                    $units,
                    'incoming_invoice',
                    (string) $item->id,
                    $label,
                    $period['amount'],
                    $details,
                    $account,
                    $label,
                );
                $rows = $this->withInvoicePresentation($rows, $invoicePresentation);
                $rows = $this->withInvoiceCalculationLines($rows, $item, $period, $units);
                return $this->withLegacyWaterPresentation($rows, $item, $period, $units);
            }

            $rows = $this->allocateByAccount(
                $account,
                $units,
                'incoming_invoice',
                (string) $item->id,
                $label,
                $period['amount'],
                $details,
            );
            $rows = $this->withInvoicePresentation($rows, $invoicePresentation);
            $rows = $this->withInvoiceCalculationLines($rows, $item, $period, $units);

            return $this->isWaterItem($item)
                ? $this->withLegacyWaterPresentation($rows, $item, $period, $units)
                : $rows;
        })->filter()->values()->all();
    }

    private function withInvoicePresentation(array $rows, array $presentation): array
    {
        return collect($rows)->map(fn (array $row): array => [...$row, 'invoicePresentation' => $presentation])->all();
    }

    private function invoicePresentation(IncomingInvoiceItem $item, array $period): array
    {
        $invoice = $item->invoice;
        $supplier = trim((string) ($invoice?->supplier_label ?? ''));
        $number = trim((string) ($invoice?->external_number ?: $invoice?->number ?: ''));
        if (in_array($invoice?->document_type, ['supplier_credit', 'credit'], true) && $number !== '') $number = 'GS '.$number;
        $label = trim((string) ($item->propertyAccount?->custom_label ?: $item->propertyAccount?->costType?->name ?: $item->description ?: $invoice?->description ?: ''));
        $showPosition = (bool) ($item->propertyAccount?->show_invoice_position_text ?? true);
        $position = $showPosition ? trim((string) ($item->description ?: $invoice?->description ?: '')) : '';
        if ($this->sameInvoicePresentationValue($position, $label)) $position = '';
        $showAmount = ! $this->isTenantWaterConsumptionInvoice($item);

        $sourcePeriodMatchesStatement = isset($period['periodFrom'], $period['periodUntil'])
            && (string) $period['periodFrom'] === $this->periodFrom->toDateString()
            && (string) $period['periodUntil'] === $this->periodUntil->toDateString();

        return [
            'supplier' => $supplier !== '' ? $supplier : null,
            'number' => $number !== '' ? $number : null,
            'position' => $position !== '' ? $position : null,
            'periodFrom' => ! $sourcePeriodMatchesStatement && ! empty($period['periodFrom']) ? (string) $period['periodFrom'] : null,
            'periodUntil' => ! $sourcePeriodMatchesStatement && ! empty($period['periodUntil']) ? (string) $period['periodUntil'] : null,
            'amount' => $showAmount ? round((float) $item->gross_amount * $this->invoiceSign($invoice), 2) : null,
        ];
    }

    private function isTenantWaterConsumptionInvoice(IncomingInvoiceItem $item): bool
    {
        if (! $this->isWaterItem($item)) return false;
        return collect((array) ($item->propertyAccount?->splits ?? []))
            ->contains(fn (array $split): bool => (string) ($split['allocationKeyCode'] ?? '') === 'consumption');
    }

    private function invoicePresentationText(array $presentation): string
    {
        $period = $this->invoicePresentationPeriod($presentation['periodFrom'] ?? null, $presentation['periodUntil'] ?? null);

        return collect([
            ! empty($presentation['supplier']) ? 'Lieferant: '.$presentation['supplier'] : null,
            ! empty($presentation['number']) ? 'RG-Nr.: '.$presentation['number'] : null,
            ! empty($presentation['position']) ? 'Position: '.$presentation['position'] : null,
            $period !== null ? 'Abrechnungszeitraum: '.$period : null,
        ])->filter()->join(' · ');
    }

    private function sameInvoicePresentationValue(string $left, string $right): bool
    {
        $normalize = static fn (string $value): string => mb_strtolower(trim(preg_replace('/\s+/u', ' ', $value) ?? $value));

        return $normalize($left) !== '' && $normalize($left) === $normalize($right);
    }

    private function invoicePresentationPeriod(mixed $from, mixed $until): ?string
    {
        if (! $from && ! $until) return null;
        try {
            $fromDate = $from ? Carbon::parse($from)->format('d.m.Y') : null;
            $untilDate = $until ? Carbon::parse($until)->format('d.m.Y') : null;
        } catch (\Throwable) {
            $fromDate = $from ? trim((string) $from) : null;
            $untilDate = $until ? trim((string) $until) : null;
        }
        if ($fromDate && $untilDate) return $fromDate.'–'.$untilDate;
        return $fromDate ?: $untilDate;
    }

    private function withInvoiceCalculationLines(
        array $rows,
        IncomingInvoiceItem $item,
        array $period,
        Collection $units,
    ): array {
        return collect($rows)->map(function (array $row) use ($item, $period, $units): array {
            $row['calculationLine'] = $this->buildInvoiceCalculationLine($item, $period, $row, $units);

            return $row;
        })->all();
    }

    private function buildCalculationLine(array $parts): ?string
    {
        return OperatingCostDisplayFormatter::calculationLine($parts);
    }

    private function buildInvoiceCalculationLine(
        IncomingInvoiceItem $item,
        array $period,
        array $row,
        Collection $units,
    ): ?string {
        $key = (string) ($row['allocationKey'] ?? '');

        if (in_array($key, ['contract', 'direct_unit'], true)) {
            return $this->buildCalculationLine([
                'prefix' => 'direkt zugeordnet',
                'result' => OperatingCostDisplayFormatter::money((float) ($row['allocatedAmount'] ?? 0)),
            ]);
        }

        $quantityPricing = (array) ($row['quantityPricing'] ?? $row['wastewaterQuantityPricing'] ?? []);
        if ($key === 'consumption' && is_numeric($quantityPricing['ownConsumption'] ?? null) && is_numeric($quantityPricing['unitPrice'] ?? null)) {
            $unit = OperatingCostDisplayFormatter::unit((string) ($quantityPricing['unit'] ?? 'm³'));
            $own = (float) $quantityPricing['ownConsumption'];
            $unitPrice = (float) $quantityPricing['unitPrice'];

            if ($own > 0 && $unitPrice > 0) {
                return $this->buildCalculationLine([
                    'base' => OperatingCostDisplayFormatter::quantity($own, $unit),
                    'factors' => [OperatingCostDisplayFormatter::unitRate($unitPrice, $unit)],
                    'result' => OperatingCostDisplayFormatter::money((float) ($row['allocatedAmount'] ?? 0)),
                ]);
            }
        }

        $effectiveFactor = (float) ($period['effectiveFactor'] ?? 1.0);
        $baseAmount = array_key_exists('calculationBaseAmount', $period)
            ? (float) $period['calculationBaseAmount']
            : (float) $item->gross_amount * $effectiveFactor * $this->invoiceSign($item->invoice);
        $base = OperatingCostDisplayFormatter::money($baseAmount);
        if ($effectiveFactor < 0.999999) $base .= ' (nach Skonto)';

        $factors = [];
        $splitPercent = (float) ($row['splitPercent'] ?? 100);
        if ($splitPercent < 99.999999) {
            $factors[] = OperatingCostDisplayFormatter::percent($splitPercent / 100);
        }

        if ($key === 'living_area') {
            $own = $this->unitArea($this->unit);
            $total = $this->totalUnitArea($units);
            if ($own > 0 && $total > 0 && $own < $total) {
                $factors[] = OperatingCostDisplayFormatter::squareMeters($own).' / '.OperatingCostDisplayFormatter::squareMeters($total);
            }
        } elseif (in_array($key, ['persons', 'person_days'], true)) {
            $own = (float) $this->personDays->forContract($this->contract, $this->periodFrom, $this->periodUntil);
            $total = $this->personDayTotalForUnits($units);
            if ($own > 0 && $total > 0 && $own < $total) {
                $factors[] = OperatingCostDisplayFormatter::integer($own).' / '.OperatingCostDisplayFormatter::integer($total).' Personentage';
            }
        } elseif (in_array($key, ['units', 'residential_units'], true)) {
            $eligible = $key === 'residential_units'
                ? $units->filter(fn (Unit $unit): bool => $unit->unit_type === 'apartment')->values()
                : $units;
            $own = $eligible->contains('id', $this->unit->id) ? 1 : 0;
            $total = $eligible->count();
            if ($own > 0 && $total > 0 && $own < $total) {
                $label = $key === 'residential_units' ? 'Wohnungen' : 'Einheiten';
                $factors[] = '/ '.$total.' '.$label;
                $factors[] = $own === 1 ? ($key === 'residential_units' ? '1 Wohnung' : '1 Einheit') : $own.' '.$label;
            }
        } elseif ($key === 'consumption') {
            $description = (string) ($row['label'] ?? $item->description);
            $meter = $this->meterFactor(
                $this->meterGroupsForLabel($description),
                $description,
                $this->isWastewaterCostLabel($description),
            );
            $own = (float) ($meter['own'] ?? 0);
            $total = (float) ($meter['total'] ?? 0);
            $unit = OperatingCostDisplayFormatter::unit((string) ($meter['unit'] ?? ''));
            if ($own > 0 && $total > 0 && $own < $total) {
                $factors[] = OperatingCostDisplayFormatter::quantity($own, $unit).' / '.OperatingCostDisplayFormatter::quantity($total, $unit);
            }
        }

        if (! ($period['isFullPeriod'] ?? true)) {
            $overlapDays = (int) ($period['overlapDays'] ?? 0);
            $sourceDays = (int) ($period['sourceDays'] ?? 0);
            if ($overlapDays > 0 && $sourceDays > 0 && $overlapDays < $sourceDays) {
                $factors[] = $overlapDays.'/'.$sourceDays.' Tage';
            }
        }

        if (in_array($key, ['living_area', 'units', 'residential_units'], true)) {
            $usagePart = $this->usageTimeCalculationPart();
            if ($usagePart !== null) $factors[] = $usagePart;
        }

        return $this->buildCalculationLine([
            'base' => $base,
            'factors' => $factors,
            'result' => OperatingCostDisplayFormatter::money((float) ($row['allocatedAmount'] ?? 0)),
        ]);
    }

    private function totalUnitArea(Collection $units): float
    {
        return $units->sum(fn (Unit $unit): float => $this->unitArea($unit));
    }

    private function withLegacyWaterPresentation(array $rows, IncomingInvoiceItem $item, array $period, Collection $units): array
    {
        return collect($rows)->map(function (array $row) use ($item, $period, $units): array {
            $presentation = $this->legacyWaterPresentation($item, $period, $row, $units);

            return [
                ...$row,
                'grundbetrag' => $presentation['grundbetrag'],
                'umlagebetrag' => $presentation['umlagebetrag'],
                'zeitanteil' => $presentation['zeitanteil'],
                'schluessel' => $presentation['schluessel'],
                'verteilung' => $presentation['verteilung'],
                'berechnung' => $row['calculationLine'] ?? null,
                'waterPresentation' => $presentation,
            ];
        })->all();
    }

    private function legacyWaterPresentation(IncomingInvoiceItem $item, array $period, array $row, Collection $units): array
    {
        $grossAmount = round((float) $item->gross_amount * $this->invoiceSign($item->invoice), 2);
        $periodAmount = round((float) ($period['amount'] ?? 0), 2);
        $key = (string) ($row['allocationKey'] ?? '');
        $factor = (float) ($row['factor'] ?? 0);
        $distribution = $this->compactWaterDistribution($key, $row, $units);

        return [
            'grundbetrag' => $grossAmount,
            'umlagebetrag' => $periodAmount,
            'zeitanteil' => $this->legacyPeriodText($period),
            'schluessel' => $this->legacyWaterAllocationLabel($key),
            'verteilung' => $distribution,
            'berechnung' => $row['calculationLine'] ?? null,
        ];
    }

    private function legacyPeriodText(array $period): ?string
    {
        $overlapDays = (int) ($period['overlapDays'] ?? 0);
        $sourceDays = (int) ($period['sourceDays'] ?? 0);

        return $overlapDays > 0 && $sourceDays > 0 && $overlapDays < $sourceDays
            ? $overlapDays.'/'.$sourceDays.' Tage'
            : null;
    }

    private function compactWaterDistribution(string $key, array $row, Collection $units): ?string
    {
        if ($key === 'consumption') {
            $pricing = (array) ($row['quantityPricing'] ?? $row['wastewaterQuantityPricing'] ?? []);
            if (is_numeric($pricing['ownConsumption'] ?? null)) {
                $unit = OperatingCostDisplayFormatter::unit((string) ($pricing['unit'] ?? 'm³'));

                return OperatingCostDisplayFormatter::quantity((float) $pricing['ownConsumption'], $unit);
            }

            return null;
        }

        if (in_array($key, ['residential_units', 'units'], true)) {
            $eligible = $key === 'residential_units'
                ? $units->filter(fn (Unit $unit): bool => $unit->unit_type === 'apartment')->values()
                : $units;
            $own = $eligible->contains('id', $this->unit->id) ? 1 : 0;
            $total = $eligible->count();

            return $own > 0 && $total > 0 && $own < $total ? $own.' / '.$total : null;
        }

        if ($key === 'living_area') {
            $own = $this->unitArea($this->unit);
            $total = $this->totalUnitArea($units);

            return $own > 0 && $total > 0 && $own < $total
                ? OperatingCostDisplayFormatter::squareMeters($own).' / '.OperatingCostDisplayFormatter::squareMeters($total)
                : null;
        }

        if (in_array($key, ['persons', 'person_days'], true)) {
            $own = (float) $this->personDays->forContract($this->contract, $this->periodFrom, $this->periodUntil);
            $total = $this->personDayTotalForUnits($units);

            return $own > 0 && $total > 0 && $own < $total
                ? OperatingCostDisplayFormatter::integer($own).' / '.OperatingCostDisplayFormatter::integer($total).' Personentage'
                : null;
        }

        return in_array($key, ['contract', 'direct_unit'], true) ? 'direkt zugeordnet' : null;
    }

    private function waterConsumptionValuesFor(string $label): array
    {
        $own = 0.0;
        $total = 0.0;
        $units = [];
        foreach ($this->meterGroupsForLabel($label) as $key) {
            $group = $this->meterGroups[$key] ?? null;
            if (! $group) continue;
            $own += (float) ($group['own'] ?? 0);
            $total += (float) ($group['total'] ?? 0);
            if (! empty($group['unit'])) $units[] = $this->displayWaterUnit((string) $group['unit']);
        }
        $unit = count(array_unique($units)) === 1 ? $units[0] : 'm³';
        return [$own, $total, $unit];
    }

    private function legacyWaterAllocationLabel(string $key): string
    {
        return match ($key) {
            'consumption' => 'Verbrauch', 'residential_units' => 'Wohneinheiten', 'units' => 'Einheiten',
            'living_area' => 'Wohnfläche', 'persons', 'person_days' => 'Personentage', 'contract' => 'Direkte Vertragszuordnung',
            'direct_unit' => 'Direkte Einheitszuordnung', default => $key,
        };
    }

    private function legacyMoney(float $amount): string { return OperatingCostDisplayFormatter::money($amount); }

    private function displayWaterUnit(string $unit): string
    {
        return OperatingCostDisplayFormatter::unit($unit);
    }

    /** @param Collection<int, IncomingInvoiceItem> $items */
    private function internalHeatingCosts(Collection $items, Collection $units): array
    {
        if ($items->isEmpty()) return [];

        $base = 0.0;
        $sourceIds = [];
        $details = [];
        foreach ($items as $item) {
            $period = $this->invoicePeriodAmount($item);
            if (abs($period['amount']) < 0.005) continue;
            $base += $period['amount'];
            $sourceIds[] = (string) $item->id;
            $details[] = $this->invoicePresentationText($this->invoicePresentation($item, $period));
        }
        if (abs($base) < 0.005) return [];

        $roomHeatShare = (float) data_get($this->heatingSystem, 'roomHeatShare', 0);
        $hotWaterShare = (float) data_get($this->heatingSystem, 'hotWaterShare', 0);
        if ($roomHeatShare <= 0 || $hotWaterShare <= 0 || abs(($roomHeatShare + $hotWaterShare) - 1.0) > 0.0001) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'meters' => 'Die gemessenen Wärmemengen für Raumheizung und Warmwasser ergeben keinen gültigen Kostenanteil.',
            ]);
        }

        $roomPool = $base * $roomHeatShare;
        $hotWaterPool = $base * $hotWaterShare;
        $roomConsumptionPool = $roomPool * 0.70;
        $roomAreaPool = $roomPool * 0.30;
        $hotWaterConsumptionPool = $hotWaterPool * 0.70;
        $hotWaterAreaPool = $hotWaterPool * 0.30;

        $sourceId = implode(',', $sourceIds);
        $sourceDetails = implode('; ', array_values(array_unique(array_filter($details))));
        $room = $this->meterFactor(['heating'], 'Heizung');
        $hotWater = $this->meterFactor(['hot_water'], 'Warmwasser');
        $areaFactor = $this->allocationFactor('living_area', $units, 'Heizung/Warmwasser');
        $usageDays = max(0, $this->usageFrom->diffInDays($this->usageUntil) + 1);
        $periodDays = max(1, $this->periodFrom->diffInDays($this->periodUntil) + 1);
        $usageFactor = $usageDays / $periodDays;
        $roomKwh = (float) data_get($this->heatingSystem, 'roomHeat.consumptionKwh', 0);
        $hotWaterKwh = (float) data_get($this->heatingSystem, 'hotWaterHeat.consumptionKwh', 0);

        $sourceDetails = implode('; ', array_values(array_unique(array_filter($details))));
        $room70 = OperatingCostDisplayFormatter::percent(0.70);
        $room30 = OperatingCostDisplayFormatter::percent(0.30);
        $heatingHeader = collect([
            $sourceDetails !== '' ? 'Rechnungsquellen: '.$sourceDetails : null,
            'Wärmemengen: Raumheizung '.OperatingCostDisplayFormatter::quantity($roomKwh, 'kWh').' · Warmwasser '.OperatingCostDisplayFormatter::quantity($hotWaterKwh, 'kWh'),
            'Flächenanteil: '.OperatingCostDisplayFormatter::squareMeters($this->unitArea($this->unit)).' / '.OperatingCostDisplayFormatter::squareMeters($this->totalUnitArea($units)),
            $room70.' Verbrauch · '.$room30.' Fläche nach §§ 7, 8 HeizkostenV',
        ])->filter()->join(' · ');

        $rows = [
            $this->syntheticCostRow(
                sourceType: 'heating_calculation', sourceId: $sourceId.':room-consumption', label: 'Raumheizung · '.$room70.' Verbrauch',
                allocationKey: 'consumption', allocationKeyName: 'Wärmeverbrauch', totalAmount: $roomConsumptionPool,
                factor: $room['factor'], allocatedAmount: $roomConsumptionPool * $room['factor'],
                details: $heatingHeader !== '' ? $heatingHeader : null,
                category: 'heating',
            ),
            $this->syntheticCostRow(
                sourceType: 'heating_calculation', sourceId: $sourceId.':room-area', label: 'Raumheizung · '.$room30.' Fläche',
                allocationKey: 'living_area', allocationKeyName: 'Wohnfläche mit Nutzungszeitanteil', totalAmount: $roomAreaPool,
                factor: $areaFactor * $usageFactor, allocatedAmount: $roomAreaPool * $areaFactor * $usageFactor,
                details: null,
                category: 'heating',
            ),
            $this->syntheticCostRow(
                sourceType: 'heating_calculation', sourceId: $sourceId.':hot-water-consumption', label: 'Warmwasser · '.$room70.' Verbrauch',
                allocationKey: 'consumption', allocationKeyName: 'Warmwasserverbrauch', totalAmount: $hotWaterConsumptionPool,
                factor: $hotWater['factor'], allocatedAmount: $hotWaterConsumptionPool * $hotWater['factor'],
                details: null,
                category: 'heating',
            ),
            $this->syntheticCostRow(
                sourceType: 'heating_calculation', sourceId: $sourceId.':hot-water-area', label: 'Warmwasser · '.$room30.' Fläche',
                allocationKey: 'living_area', allocationKeyName: 'Wohnfläche mit Nutzungszeitanteil', totalAmount: $hotWaterAreaPool,
                factor: $areaFactor * $usageFactor, allocatedAmount: $hotWaterAreaPool * $areaFactor * $usageFactor,
                details: null,
                category: 'heating',
            ),
        ];

        $rows[0]['heatingPresentation'] = $heatingHeader;
        foreach ($rows as $index => &$row) {
            $factors = [];
            if ($index === 0) {
                $factors = [$room70];
                if ((float) ($room['factor'] ?? 0) < 0.999999) {
                    $factors[] = OperatingCostDisplayFormatter::quantity((float) ($room['own'] ?? $roomKwh), 'kWh').' / '.OperatingCostDisplayFormatter::quantity((float) ($room['total'] ?? 0), 'kWh');
                }
                $row['calculationLine'] = $this->buildCalculationLine(['prefix' => 'Raumheizung '.$room70.' Verbrauch', 'base' => OperatingCostDisplayFormatter::money($roomPool), 'factors' => array_values(array_filter($factors)), 'result' => OperatingCostDisplayFormatter::money((float) $row['allocatedAmount'])]);
            } elseif ($index === 1) {
                $factors = [$room30, OperatingCostDisplayFormatter::squareMeters($this->unitArea($this->unit)).' / '.OperatingCostDisplayFormatter::squareMeters($this->totalUnitArea($units))];
                if ($usageFactor < 0.999999) $factors[] = $usageDays.'/'.$periodDays.' Tage';
                $row['calculationLine'] = $this->buildCalculationLine(['prefix' => 'Raumheizung '.$room30.' Fläche', 'base' => OperatingCostDisplayFormatter::money($roomPool), 'factors' => $factors, 'result' => OperatingCostDisplayFormatter::money((float) $row['allocatedAmount'])]);
            } elseif ($index === 2) {
                $factors = [$room70];
                if ((float) ($hotWater['factor'] ?? 0) < 0.999999) {
                    $factors[] = OperatingCostDisplayFormatter::quantity((float) ($hotWater['own'] ?? $hotWaterKwh), 'kWh').' / '.OperatingCostDisplayFormatter::quantity((float) ($hotWater['total'] ?? 0), 'kWh');
                }
                $row['calculationLine'] = $this->buildCalculationLine(['prefix' => 'Warmwasser '.$room70.' Verbrauch', 'base' => OperatingCostDisplayFormatter::money($hotWaterPool), 'factors' => $factors, 'result' => OperatingCostDisplayFormatter::money((float) $row['allocatedAmount'])]);
            } else {
                $factors = [$room30, OperatingCostDisplayFormatter::squareMeters($this->unitArea($this->unit)).' / '.OperatingCostDisplayFormatter::squareMeters($this->totalUnitArea($units))];
                if ($usageFactor < 0.999999) $factors[] = $usageDays.'/'.$periodDays.' Tage';
                $row['calculationLine'] = $this->buildCalculationLine(['prefix' => 'Warmwasser '.$room30.' Fläche', 'base' => OperatingCostDisplayFormatter::money($hotWaterPool), 'factors' => $factors, 'result' => OperatingCostDisplayFormatter::money((float) $row['allocatedAmount'])]);
            }
        }
        unset($row);

        return $rows;
    }


    private function invoicePeriodAmount(IncomingInvoiceItem $item): array
    {
        $invoice = $item->invoice;
        $periodFrom = Carbon::parse($invoice?->service_period_from ?? $invoice?->invoice_date ?? $this->periodFrom)->startOfDay();
        $periodUntil = Carbon::parse($invoice?->service_period_until ?? $invoice?->service_period_from ?? $invoice?->invoice_date ?? $periodFrom)->startOfDay();
        if ($periodUntil->lt($periodFrom)) [$periodFrom, $periodUntil] = [$periodUntil, $periodFrom];

        $overlapFrom = $periodFrom->greaterThan($this->periodFrom) ? $periodFrom->copy() : $this->periodFrom->copy();
        $overlapUntil = $periodUntil->lessThan($this->periodUntil) ? $periodUntil->copy() : $this->periodUntil->copy();
        if ($overlapUntil->lt($overlapFrom)) {
            return ['amount' => 0.0, 'text' => null, 'overlapDays' => 0, 'sourceDays' => 0, 'isFullPeriod' => false, 'periodFrom' => $periodFrom->toDateString(), 'periodUntil' => $periodUntil->toDateString(), 'overlapFrom' => null, 'overlapUntil' => null];
        }

        $sourceDays = $periodFrom->diffInDays($periodUntil) + 1;
        $overlapDays = $overlapFrom->diffInDays($overlapUntil) + 1;
        $effectiveFactor = $this->invoiceCostFactor($invoice);
        $calculationBaseAmount = (float) $item->gross_amount * $effectiveFactor * $this->invoiceSign($invoice);
        $amount = $calculationBaseAmount * ($overlapDays / max(1, $sourceDays));

        return [
            'amount' => $amount,
            'text' => collect([
                $overlapDays < $sourceDays ? $overlapDays.'/'.$sourceDays.' Tage' : null,
                $effectiveFactor < 0.999999 ? '(nach Skonto)' : null,
            ])->filter()->join(' · ') ?: null,
            'overlapDays' => $overlapDays,
            'sourceDays' => $sourceDays,
            'isFullPeriod' => $overlapDays >= $sourceDays,
            'effectiveFactor' => $effectiveFactor,
            'calculationBaseAmount' => $calculationBaseAmount,
            'periodFrom' => $periodFrom->toDateString(),
            'periodUntil' => $periodUntil->toDateString(),
            'overlapFrom' => $overlapFrom->toDateString(),
            'overlapUntil' => $overlapUntil->toDateString(),
        ];
    }

    /** Supplier credits reduce the allocatable expense; they never create a new positive cost. */
    private function invoiceSign(?IncomingInvoice $invoice): float
    {
        return in_array($invoice?->document_type, ['supplier_credit', 'credit'], true) ? -1.0 : 1.0;
    }

    private function invoiceCostFactor(?IncomingInvoice $invoice): float
    {
        $gross = (float) ($invoice?->gross_amount ?? 0);
        if ($gross <= 0) return 1.0;
        $paid = (float) ($invoice?->paid_amount ?? 0);
        $open = (float) ($invoice?->open_amount ?? 0);
        $actualDiscount = max(0.0, min($gross, $gross - $paid - $open));
        return max(0.0, min(1.0, ($gross - $actualDiscount) / $gross));
    }

    private function isHeatingItem(IncomingInvoiceItem $item): bool
    {
        $costType = $item->propertyAccount?->costType;
        $billingType = mb_strtolower(trim((string) $costType?->billing_type));
        $text = $this->itemText($item);
        return in_array($billingType, ['heating', 'heating_cost'], true)
            || $this->containsAny($text, ['heiz', 'wärme', 'waerme', 'gas', 'heizöl', 'heizoel', 'fernwärme', 'fernwaerme', 'wärmepumpe', 'waermepumpe', 'heizstab']);
    }

    private function isWaterItem(IncomingInvoiceItem $item): bool
    {
        return $this->containsAny($this->itemText($item), ['wasser', 'abwasser', 'kanal', 'entwässer', 'entwaesser', 'niederschlag', 'zählergebühr', 'zaehlergebuehr', 'zählermiete', 'zaehlermiete', 'zaehlermiwte']);
    }

    private function isWasteItem(IncomingInvoiceItem $item): bool
    {
        return $this->containsAny($this->itemText($item), ['müll', 'muell', 'abfall', 'tonne', 'container', 'entsorgung', 'sperrmüll', 'sperrmuell']);
    }

    /** Honour the configured allocation key for shared water meter base fees. */
    private function waterMeterBaseFeeUsesResidentialUnits(IncomingInvoiceItem $item): bool
    {
        $splits = collect((array) ($item->propertyAccount?->splits ?? []));

        return $splits->isNotEmpty()
            && $splits->every(fn (array $split): bool => (string) ($split['allocationKeyCode'] ?? '') === 'residential_units'
                && abs((float) ($split['sharePercent'] ?? 0) - 100.0) < 0.00001);
    }

    private function isWaterMeterBaseFee(IncomingInvoiceItem $item): bool
    {
        $number = trim((string) $item->propertyAccount?->costType?->number);
        if ($number === '4040') return true;
        $text = $this->itemText($item);
        return $this->containsAny($text, ['wasserzähler', 'wasserzaehler', 'zählermiete', 'zaehlermiete', 'zaehlermiwte', 'zählergrundgebühr', 'zaehlergrundgebuehr', 'wasser grundgebühr', 'wasser grundgebuehr']);
    }

    private function itemText(IncomingInvoiceItem $item): string
    {
        $costType = $item->propertyAccount?->costType;
        return mb_strtolower(implode(' ', array_filter([
            $costType?->number, $costType?->name, $costType?->group_name, $item->propertyAccount?->custom_label, $item->description, $item->invoice?->description,
        ])));
    }
}
