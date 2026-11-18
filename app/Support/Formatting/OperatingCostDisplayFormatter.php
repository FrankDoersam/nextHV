<?php

namespace App\Support\Formatting;

final class OperatingCostDisplayFormatter
{
    private const CURRENCY = 'EUR';

    public static function number(float|int|string|null $value, int $decimals = 2): string
    {
        return number_format((float) ($value ?? 0), $decimals, ',', '.');
    }

    public static function money(float|int|string|null $value): string
    {
        return self::number($value, 2).' '.self::CURRENCY;
    }

    public static function moneySymbol(float|int|string|null $value): string
    {
        return self::number($value, 2).' €';
    }

    public static function quantity(float|int|string|null $value, string $unit): string
    {
        $unit = self::unit($unit);

        return self::number($value, self::decimalsForUnit($unit)).' '.$unit;
    }

    public static function cubicMeters(float|int|string|null $value): string
    {
        return self::quantity($value, 'm³');
    }

    public static function squareMeters(float|int|string|null $value): string
    {
        return self::quantity($value, 'm²');
    }

    public static function unitRate(float|int|string|null $value, string $unit): string
    {
        // Unit prices retain four decimals so the displayed calculation remains
        // reproducible from the underlying invoice quantity and gross amount.
        return self::number($value, 4).' '.self::CURRENCY.'/'.self::unit($unit);
    }

    public static function percent(float|int|string|null $fraction): string
    {
        return self::number(((float) ($fraction ?? 0)) * 100, 2).' %';
    }

    /**
     * Builds the compact, single-line calculation shared by all operating-cost displays.
     *
     * Supported parts: prefix, base, factors and result. Each factor is already formatted
     * by the caller so this method only defines the common order and separators.
     *
     * @param array{prefix?:string,base?:string,factors?:array<int,string>,result?:string} $parts
     */
    public static function calculationLine(array $parts): ?string
    {
        $prefix = trim((string) ($parts['prefix'] ?? ''));
        $base = trim((string) ($parts['base'] ?? ''));
        $factors = collect((array) ($parts['factors'] ?? []))
            ->map(fn (mixed $factor): string => trim((string) $factor))
            ->filter()
            ->values()
            ->all();
        $result = trim((string) ($parts['result'] ?? ''));

        if ($base === '' && $prefix === '' && $factors === [] && $result === '') {
            return null;
        }

        $expression = $base;
        foreach ($factors as $factor) {
            $expression .= str_starts_with($factor, '/') ? ' '.$factor : ' × '.$factor;
        }
        if ($prefix !== '') {
            $expression = $expression !== '' ? $prefix.': '.$expression : $prefix;
        }
        if ($result !== '') {
            return $expression !== ''
                ? ($base === '' && $factors === [] ? $prefix.' = '.$result : $expression.' = '.$result)
                : $result;
        }

        return $expression !== '' ? $expression : null;
    }

    public static function integer(float|int|string|null $value): string
    {
        return self::number($value, 0);
    }

    public static function unit(string $unit): string
    {
        return match (mb_strtolower(trim($unit))) {
            'm3', 'm³', 'cbm' => 'm³',
            'm2', 'm²', 'qm' => 'm²',
            'kwh' => 'kWh',
            'mwh' => 'MWh',
            'l', 'liter', 'litre' => 'l',
            'units', 'einheiten' => 'Einheiten',
            default => trim($unit) ?: 'Einheiten',
        };
    }

    private static function decimalsForUnit(string $unit): int
    {
        return match ($unit) {
            'm³' => 3,
            'm²' => 2,
            'kWh', 'MWh' => 3,
            'l' => 2,
            'Einheiten' => 0,
            default => 2,
        };
    }
}
