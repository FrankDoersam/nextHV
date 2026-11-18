<?php

namespace App\Services\OperatingCosts;

use App\Models\Contract;
use App\Models\WasteCollection;
use App\Models\WasteContainer;
use App\Models\WasteContainerTariff;
use Carbon\Carbon;
use App\Support\Formatting\OperatingCostDisplayFormatter;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

final class WasteCostAllocationService
{
    public function __construct(private readonly PersonDayAllocationService $personDays) {}

    public function allocateContainers(Contract $contract, Carbon|string $from, Carbon|string $until): array
    {
        $from = Carbon::parse($from)->startOfDay();
        $until = Carbon::parse($until)->startOfDay();
        $propertyId = $contract->effectiveMainUnit()?->property_id;
        if (! $propertyId) throw ValidationException::withMessages(['wasteContainers' => 'Müllkosten können nicht berechnet werden, weil der Vertrag keinem Objekt zugeordnet ist.']);
        $containers = WasteContainer::query()
            ->where('property_id', $propertyId)->where('status', '!=', 'cancelled')
            ->where(fn ($query) => $query->whereNull('valid_from')->orWhereDate('valid_from', '<=', $until))
            ->where(fn ($query) => $query->whereNull('valid_until')->orWhereDate('valid_until', '>=', $from))
            ->with([
                'tariffs' => fn ($query) => $query
                    ->where(fn ($nested) => $nested->whereNull('billing_period_from')->orWhereDate('billing_period_from', '<=', $until))
                    ->where(fn ($nested) => $nested->whereNull('billing_period_until')->orWhereDate('billing_period_until', '>=', $from))
                    ->orderBy('billing_period_from'),
                'collections' => fn ($query) => $query->whereBetween('collection_date', [$from, $until])->orderBy('collection_date'),
            ])->orderBy('waste_type')->orderBy('container_number')->get();
        if ($containers->isEmpty()) return ['rows' => [], 'warnings' => []];
        $totalPersonDays = (float) ($this->personDays->forProperty((string) $propertyId, $from, $until)['total'] ?? 0);
        $ownPersonDays = (float) $this->personDays->forContract($contract, $from, $until);
        if ($totalPersonDays <= 0 || $ownPersonDays <= 0) {
            throw ValidationException::withMessages(['wasteContainers' => 'Müllkosten sind vorhanden, aber für den Vertrag oder das Objekt konnten keine Personentage ermittelt werden.']);
        }
        $rows = [];
        foreach ($containers as $container) {
            if ($container->tariffs->isEmpty()) throw ValidationException::withMessages(['wasteContainers' => 'Für '.$this->containerLabel($container).' ist im Abrechnungszeitraum kein gültiger Tarif hinterlegt.']);
            $this->assertTariffsDoNotOverlap($container, $from, $until);
            $rows = [...$rows, ...$this->baseFeeRows($contract, $container, $from, $until, $totalPersonDays, $ownPersonDays), ...$this->extraCollectionRows($container, $totalPersonDays, $ownPersonDays)];
        }
        return ['rows' => $rows, 'warnings' => []];
    }

    private function baseFeeRows(Contract $contract, WasteContainer $container, Carbon $from, Carbon $until, float $totalPersonDays, float $ownPersonDays): array
    {
        $totalBase = 0.0;
        $usageDays = 0;
        foreach ($container->tariffs as $tariff) {
            $segment = $this->tariffOverlap($container, $tariff, $from, $until);
            if (! $segment) continue;
            $annualFee = (float) $tariff->annual_fee_amount;
            if ($annualFee < 0) throw ValidationException::withMessages(['wasteContainers' => 'Der Jahrestarif von '.$this->containerLabel($container).' darf nicht negativ sein.']);
            $amount = match ($tariff->basic_fee_calculation) {
                'per_collection' => 0.0,
                'prorated' => $this->proratedAnnualFee($annualFee, $segment['from'], $segment['until']),
                default => $annualFee,
            };
            $totalBase += $amount;
            if ($amount > 0) {
                $usageDays += $segment['from']->diffInDays($segment['until']) + 1;
            }
        }
        if ($totalBase <= 0) return [];

        $periodDays = $from->diffInDays($until) + 1;
        $factor = $ownPersonDays / $totalPersonDays;
        $tenantUsageFrom = $this->contractUsageFrom($contract, $from, $until);
        $tenantUsageUntil = $this->contractUsageUntil($contract, $from, $until);
        $tenantUsageDays = $tenantUsageFrom && $tenantUsageUntil && $tenantUsageUntil->gte($tenantUsageFrom)
            ? $tenantUsageFrom->diffInDays($tenantUsageUntil) + 1
            : 0;

        $usageText = $tenantUsageFrom && $tenantUsageUntil
            ? 'Nutzung: '.$tenantUsageFrom->format('d.m.Y').'–'.$tenantUsageUntil->format('d.m.Y')
                .($tenantUsageDays < $periodDays ? ' ('.$this->formatDays($tenantUsageDays, $periodDays).')' : '')
            : 'Nutzung: nicht ermittelbar';
        $tariffText = $usageDays < $periodDays
            ? 'Tarif: '.$this->formatDays($usageDays, $periodDays).' mit Grundgebühr'
            : 'Tarif: Grundgebühr';

        return [[
            'sourceType' => 'waste_container', 'sourceId' => (string) $container->id,
            'label' => $this->containerLabel($container).' (Grundkosten)',
            'allocationKey' => 'person_days', 'allocationKeyName' => 'Personentage', 'splitPercent' => 100.0,
            'totalAmount' => round($totalBase, 2), 'factor' => round($factor, 8), 'allocatedAmount' => round($totalBase * $factor, 2),
            'details' => collect([$usageText, $tariffText])->join(' · '),
            'calculationLine' => OperatingCostDisplayFormatter::calculationLine([
                'base' => $this->euro($totalBase),
                'factors' => [
                    OperatingCostDisplayFormatter::integer($ownPersonDays).' / '.OperatingCostDisplayFormatter::integer($totalPersonDays).' Personentage',
                ],
                'result' => $this->euro($totalBase * $factor),
            ]),
            'account' => $this->syntheticAccount(), 'category' => 'waste',
        ]];
    }

    private function extraCollectionRows(WasteContainer $container, float $totalPersonDays, float $ownPersonDays): array
    {
        if ($container->collections->isEmpty()) return [];
        $chargeable = collect();
        $chargeable->push(...$container->collections->where('collection_type', 'extra')->values());
        foreach ($container->tariffs as $tariff) {
            $regular = $container->collections->where('collection_type', 'regular')
                ->filter(fn (WasteCollection $collection): bool => $this->tariffContainsDate($tariff, Carbon::parse($collection->collection_date)))
                ->sortBy('collection_date')->values();
            $chargeable->push(...$regular->slice(max(0, (int) $tariff->included_collections_count)));
        }
        $chargeable = $chargeable->unique('id')->sortBy('collection_date')->values();
        if ($chargeable->isEmpty()) return [];
        $priced = [];
        foreach ($chargeable as $collection) {
            $date = Carbon::parse($collection->collection_date)->startOfDay();
            $tariff = $this->tariffForDate($container->tariffs, $date);
            if (! $tariff) throw ValidationException::withMessages(['wasteContainers' => 'Für die Leerung von '.$this->containerLabel($container).' am '.$date->format('d.m.Y').' existiert kein gültiger Tarif.']);
            $price = (float) $tariff->extra_collection_amount;
            if ($price <= 0) throw ValidationException::withMessages(['wasteContainers' => 'Für die kostenpflichtige Leerung von '.$this->containerLabel($container).' am '.$date->format('d.m.Y').' ist kein positiver Zusatzpreis hinterlegt.']);

            $priced[] = [
                'id' => (string) $collection->id,
                'date' => $date->format('d.m.Y'),
                'price' => $price,
            ];
        }

        $count = count($priced);
        $base = array_reduce($priced, static fn (float $sum, array $item): float => $sum + (float) $item['price'], 0.0);

        $factor = $ownPersonDays / $totalPersonDays;


        return [[
            'sourceType' => 'waste_collection', 'sourceId' => implode(',', array_column($priced, 'id')),
            'label' => $this->containerLabel($container).' ('.$count.' kostenpflichtige '.($count === 1 ? 'Leerung' : 'Leerungen').')',
            'allocationKey' => 'person_days', 'allocationKeyName' => 'Personentage', 'splitPercent' => 100.0,
            'totalAmount' => round($base, 2), 'factor' => round($factor, 8), 'allocatedAmount' => round($base * $factor, 2),
            'details' => 'Leerungsdaten: '.collect($priced)->map(fn (array $item): string => $item['date'].' ('.$this->euro((float) $item['price']).')')->join(' · '),
            'calculationLine' => OperatingCostDisplayFormatter::calculationLine([
                'base' => $this->euro($base),
                'factors' => [
                    OperatingCostDisplayFormatter::integer($ownPersonDays).' / '.OperatingCostDisplayFormatter::integer($totalPersonDays).' Personentage',
                ],
                'result' => $this->euro($base * $factor),
            ]),
            'account' => $this->syntheticAccount(), 'category' => 'waste',
        ]];
    }

    /** @param array<int,string> $dates */
    private function dateRangeLabel(array $dates): string
    {
        $dates = array_values(array_filter($dates, static fn (string $date): bool => trim($date) !== ''));
        if ($dates === []) return '-';
        if (count($dates) === 1) return $dates[0];

        return $dates[0].' - '.$dates[array_key_last($dates)];
    }

    private function contractUsageFrom(Contract $contract, Carbon $from, Carbon $until): ?Carbon
    {
        $start = Carbon::parse($contract->starts_on)->startOfDay();
        if ($start->lt($from)) $start = $from->copy();

        $end = $this->contractUsageUntil($contract, $from, $until);
        if ($end && $start->gt($end)) return null;

        return $start->lte($until) ? $start : null;
    }

    private function contractUsageUntil(Contract $contract, Carbon $from, Carbon $until): ?Carbon
    {
        $endValue = $contract->confirmed_end_on ?? $contract->fixed_until;
        $end = $endValue ? Carbon::parse($endValue)->startOfDay() : $until->copy();
        if ($end->gt($until)) $end = $until->copy();
        return $end->gte($from) ? $end : null;
    }

    private function formatDays(int $days, int $totalDays): string
    {
        return $days.'/'.$totalDays.' Tage';
    }

    private function personDayLine(float $base, float $total, float $own): string
    {
        return $this->euro($base)
            .' / '.OperatingCostDisplayFormatter::integer($total).' P-Tage (Gesamt)'
            .' × '.OperatingCostDisplayFormatter::integer($own).' P-Tage (Eigenanteil)';
    }

    private function euro(float $value): string
    {
        return OperatingCostDisplayFormatter::money($value);
    }

    private function proratedAnnualFee(float $annualFee, Carbon $from, Carbon $until): float
    {
        $total = 0.0;
        $cursor = $from->copy();
        while ($cursor->lte($until)) {
            $segmentUntil = $cursor->copy()->endOfYear();
            if ($segmentUntil->gt($until)) $segmentUntil = $until->copy();
            $days = $cursor->diffInDays($segmentUntil) + 1;
            $total += $annualFee * $days / $cursor->copy()->endOfYear()->dayOfYear;
            $cursor = $segmentUntil->copy()->addDay()->startOfDay();
        }
        return $total;
    }

    private function assertTariffsDoNotOverlap(WasteContainer $container, Carbon $from, Carbon $until): void
    {
        $segments = $container->tariffs->map(fn (WasteContainerTariff $tariff): ?array => $this->tariffOverlap($container, $tariff, $from, $until))->filter()->sortBy(fn (array $segment): int => $segment['from']->timestamp)->values();
        for ($index = 1; $index < $segments->count(); $index++) {
            if ($segments[$index]['from']->lte($segments[$index - 1]['until'])) throw ValidationException::withMessages(['wasteContainers' => 'Die Tarife von '.$this->containerLabel($container).' überschneiden sich im Abrechnungszeitraum.']);
        }
    }

    private function tariffOverlap(WasteContainer $container, WasteContainerTariff $tariff, Carbon $from, Carbon $until): ?array
    {
        $starts = collect(array_filter([$from, $container->valid_from ? Carbon::parse($container->valid_from)->startOfDay() : null, $tariff->billing_period_from ? Carbon::parse($tariff->billing_period_from)->startOfDay() : null]));
        $ends = collect(array_filter([$until, $container->valid_until ? Carbon::parse($container->valid_until)->startOfDay() : null, $container->cancellation_date ? Carbon::parse($container->cancellation_date)->startOfDay() : null, $tariff->billing_period_until ? Carbon::parse($tariff->billing_period_until)->startOfDay() : null]));
        $start = $starts->sortByDesc(fn (Carbon $date): int => $date->timestamp)->first()?->copy();
        $end = $ends->sortBy(fn (Carbon $date): int => $date->timestamp)->first()?->copy();
        return $start && $end && $start->lte($end) ? ['from' => $start, 'until' => $end] : null;
    }

    private function tariffContainsDate(WasteContainerTariff $tariff, Carbon $date): bool
    {
        return (! $tariff->billing_period_from || $tariff->billing_period_from->lte($date)) && (! $tariff->billing_period_until || $tariff->billing_period_until->gte($date));
    }

    private function tariffForDate(Collection $tariffs, Carbon $date): ?WasteContainerTariff
    {
        return $tariffs->filter(fn (WasteContainerTariff $tariff): bool => $this->tariffContainsDate($tariff, $date))->sortByDesc('billing_period_from')->first();
    }

    private function containerLabel(WasteContainer $container): string
    {
        $type = match ($container->waste_type) { 'residual' => 'Restmüll', 'organic' => 'Biomüll', 'paper' => 'Papier', 'packaging' => 'Verpackung', 'glass' => 'Glas', default => 'Müll' };
        return trim($type.' '.$container->container_number);
    }

    private function syntheticAccount(): array
    {
        return ['id' => null, 'number' => null, 'name' => 'Müllbehälter', 'label' => 'Müllbehälter', 'group' => 'Müll', 'billingType' => 'operating_cost', 'directTarget' => 'distributed', 'isDirect' => false];
    }
}
