<?php

namespace App\Services\OperatingCosts;

use App\Models\Meter;
use App\Models\MeterReading;
use App\Models\Property;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

final class HeatingCostComplianceService
{
    public const ROOM_HEAT = 'room_heat_output';
    public const HOT_WATER_HEAT = 'hot_water_heat_output';
    public const HEATING_ROD = 'heating_rod_input';
    public const HEAT_PUMP_INPUT = 'heat_pump_input';

    public function systemSnapshot(Property $property, Carbon $from, Carbon $until): array
    {
        $room = $this->roleConsumption($property, self::ROOM_HEAT, $from, $until, true);
        $hotWater = $this->roleConsumption($property, self::HOT_WATER_HEAT, $from, $until, true);
        $heatingRod = $this->roleConsumption($property, self::HEATING_ROD, $from, $until, false);
        $heatPumpInput = $this->roleConsumption($property, self::HEAT_PUMP_INPUT, $from, $until, false);
        $thermalTotal = (float) $room['consumptionKwh'] + (float) $hotWater['consumptionKwh'];
        if ($thermalTotal <= 0) {
            throw ValidationException::withMessages([
                'meters' => 'Die gemessene Gesamtwärmemenge für Raumheizung und Warmwasser muss größer als 0 kWh sein.',
            ]);
        }

        $electricalInput = null;
        if ($heatPumpInput !== null) {
            $electricalInput = (float) $heatPumpInput['consumptionKwh'];
            if ($heatingRod !== null) {
                $electricalInput += (float) $heatingRod['consumptionKwh'];
            }
        }

        return [
            'roomHeat' => $room,
            'hotWaterHeat' => $hotWater,
            'heatingRod' => $heatingRod,
            'heatPumpInput' => $heatPumpInput,
            'thermalTotalKwh' => round($thermalTotal, 3),
            'roomHeatShare' => round((float) $room['consumptionKwh'] / $thermalTotal, 8),
            'hotWaterShare' => round((float) $hotWater['consumptionKwh'] / $thermalTotal, 8),
            'electricalInputKwh' => $electricalInput !== null ? round($electricalInput, 3) : null,
            'seasonalPerformanceFactor' => $electricalInput !== null && $electricalInput > 0
                ? round($thermalTotal / $electricalInput, 3)
                : null,
            'costSplitMethod' => 'Gemessener Wärmeverbrauch nach § 9 Abs. 1 HeizkostenV',
        ];
    }

    private function roleConsumption(Property $property, string $role, Carbon $from, Carbon $until, bool $required): ?array
    {
        $meters = Meter::query()
            ->where('property_id', $property->id)
            ->where('heating_system_role', $role)
            ->where(fn ($query) => $query->whereNull('installation_date')->orWhereDate('installation_date', '<=', $until))
            ->where(fn ($query) => $query->whereNull('removed_on')->orWhereDate('removed_on', '>=', $from))
            ->with(['readings' => fn ($query) => $query->orderBy('reference_date')->orderBy('reading_date')->orderBy('created_at')])
            ->orderBy('installation_date')
            ->get();

        if ($meters->isEmpty()) {
            if (! $required) return null;
            throw ValidationException::withMessages([
                'meters' => 'Für das Objekt fehlt der Zähler mit der Heizsystem-Rolle „'.Meter::heatingSystemRoleLabel($role).'“.',
            ]);
        }

        $rows = $meters->map(function (Meter $meter) use ($from, $until): array {
            $effectiveFrom = $meter->installation_date && $meter->installation_date->greaterThan($from)
                ? Carbon::parse($meter->installation_date)->startOfDay()
                : $from->copy();
            $effectiveUntil = $meter->removed_on && $meter->removed_on->lessThan($until)
                ? Carbon::parse($meter->removed_on)->startOfDay()
                : $until->copy();
            $notBefore = $meter->installation_date && $meter->installation_date->greaterThan($from)
                ? $effectiveFrom->toDateString()
                : null;
            $start = $this->readingOnOrBefore($meter->readings, $effectiveFrom, $notBefore);
            $end = $this->readingOnOrBefore($meter->readings, $effectiveUntil, $notBefore);
            if (! $start || ! $end) {
                throw ValidationException::withMessages([
                    'meters' => 'Für den Heizsystem-Zähler „'.$meter->meter_number.'“ fehlen passende Anfangs- oder Endstände für '.$effectiveFrom->format('d.m.Y').'–'.$effectiveUntil->format('d.m.Y').'.',
                ]);
            }
            $raw = round((float) $end->value - (float) $start->value, 3);
            if ($raw < 0) {
                throw ValidationException::withMessages(['meters' => 'Der Verbrauch des Heizsystem-Zählers „'.$meter->meter_number.'“ ist negativ.']);
            }
            $factor = $meter->unit_of_measure === 'MWh' ? 1000.0 : 1.0;

            return [
                'meterId' => (string) $meter->id,
                'meterNumber' => (string) $meter->meter_number,
                'role' => $meter->heating_system_role,
                'roleLabel' => Meter::heatingSystemRoleLabel($meter->heating_system_role),
                'from' => $this->readingDate($start),
                'until' => $this->readingDate($end),
                'startValue' => (float) $start->value,
                'endValue' => (float) $end->value,
                'sourceUnit' => (string) $meter->unit_of_measure,
                'consumptionKwh' => round($raw * $factor, 3),
            ];
        })->values();

        return [
            'role' => $role,
            'roleLabel' => Meter::heatingSystemRoleLabel($role),
            'consumptionKwh' => round((float) $rows->sum('consumptionKwh'), 3),
            'meters' => $rows->all(),
        ];
    }

    private function readingOnOrBefore(Collection $readings, Carbon $date, ?string $notBefore = null): ?MeterReading
    {
        return $readings
            ->filter(fn (MeterReading $reading): bool => $reading->reference_date !== null || $reading->reading_date !== null)
            ->filter(fn (MeterReading $reading): bool => Carbon::parse($reading->reference_date ?? $reading->reading_date)->startOfDay()->lte($date))
            ->when($notBefore !== null, fn (Collection $rows): Collection => $rows->filter(fn (MeterReading $reading): bool => Carbon::parse($reading->reference_date ?? $reading->reading_date)->startOfDay()->gte(Carbon::parse($notBefore)->startOfDay())))
            ->sortByDesc(fn (MeterReading $reading): int => Carbon::parse($reading->reference_date ?? $reading->reading_date)->timestamp)
            ->first();
    }

    private function readingDate(?MeterReading $reading): ?string
    {
        $value = $reading?->reference_date ?? $reading?->reading_date;
        return $value ? Carbon::parse($value)->toDateString() : null;
    }

}
