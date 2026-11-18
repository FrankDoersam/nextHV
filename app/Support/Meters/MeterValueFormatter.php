<?php

namespace App\Support\Meters;

final class MeterValueFormatter
{
    public static function format(mixed $value, ?string $unit): ?string
    {
        $number = self::formatNumber($value, $unit);
        if ($number === null) {
            return null;
        }

        $unitLabel = self::unitLabel($unit);

        return $unitLabel === '' ? $number : $number.' '.$unitLabel;
    }

    public static function formatNumber(mixed $value, ?string $unit): ?string
    {
        if ($value === null || $value === '' || ! is_numeric($value)) {
            return null;
        }

        $decimals = match ($unit) {
            'l', 'units' => 0,
            default => 3,
        };
        $formatted = number_format((float) $value, $decimals, ',', '.');

        if ($decimals > 0 && str_contains($formatted, ',')) {
            $formatted = rtrim(rtrim($formatted, '0'), ',');
        }

        return $formatted === '-0' ? '0' : $formatted;
    }

    public static function unitLabel(?string $unit): string
    {
        return match ($unit) {
            'm3' => 'm³',
            'l' => 'Liter',
            'units' => 'Einheiten',
            null => '',
            default => $unit,
        };
    }
}
