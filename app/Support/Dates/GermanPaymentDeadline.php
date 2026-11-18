<?php

namespace App\Support\Dates;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use InvalidArgumentException;

/**
 * § 193 BGB: a payment deadline ending on a Saturday, Sunday or generally
 * recognised public holiday at the place of performance moves to the next
 * working day. Day-based periods remain calendar-day periods; only their
 * calculated final day is shifted.
 *
 * The app has no state field on property/issuer addresses. The operating
 * location is therefore explicit and deployment-configured; do not infer a
 * federal state from a postal code. Full-state holidays are covered. Local
 * exceptions (e.g. some Bavarian municipalities, individual Saxon/Thuringian
 * Corpus-Christi communities) require a separate local holiday configuration.
 */
final class GermanPaymentDeadline
{
    public const FEDERAL_STATES = [
        'BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV',
        'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH',
    ];

    public static function nextWorkingDay(CarbonInterface $nominalDueOn, ?string $federalState = null): CarbonImmutable
    {
        $state = strtoupper(trim($federalState ?? (string) config('payment_deadlines.federal_state', 'HE')));
        if (! in_array($state, self::FEDERAL_STATES, true)) {
            throw new InvalidArgumentException('Ungültiges Bundesland für Zahlungsfristen: '.$state);
        }

        $date = CarbonImmutable::instance($nominalDueOn)->startOfDay();
        while ($date->isWeekend() || self::isPublicHoliday($date, $state)) {
            $date = $date->addDay();
        }

        return $date;
    }

    private static function isPublicHoliday(CarbonImmutable $date, string $state): bool
    {
        $day = $date->format('m-d');

        // The nine statutory public holidays throughout Germany.
        if (in_array($day, ['01-01', '05-01', '10-03', '12-25', '12-26'], true)) {
            return true;
        }

        $easter = self::easterSunday($date->year);
        $target = $date->format('Y-m-d');

        if (in_array($target, [
            $easter->subDays(2)->format('Y-m-d'), // Karfreitag
            $easter->addDay()->format('Y-m-d'),   // Ostermontag
            $easter->addDays(39)->format('Y-m-d'), // Christi Himmelfahrt
            $easter->addDays(50)->format('Y-m-d'), // Pfingstmontag
        ], true)) {
            return true;
        }

        if ($target === $easter->addDays(60)->format('Y-m-d')
            && in_array($state, ['BW', 'BY', 'HE', 'NW', 'RP', 'SL'], true)) {
            return true; // Fronleichnam
        }

        if ($state === 'SN' && $target === self::repentanceDay($date)->format('Y-m-d')) {
            return true; // Buß- und Bettag
        }

        // Holiday only in specified whole federal states. Regional holidays
        // within some states intentionally are not guessed from a ZIP code.
        return match ($day) {
            '01-06' => in_array($state, ['BW', 'BY', 'ST'], true),
            '03-08' => in_array($state, ['BE', 'MV'], true),
            '08-15' => $state === 'SL',
            '09-20' => $state === 'TH',
            '10-31' => in_array($state, ['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH'], true),
            '11-01' => in_array($state, ['BW', 'BY', 'NW', 'RP', 'SL'], true),
            default => false,
        };
    }

    private static function repentanceDay(CarbonImmutable $date): CarbonImmutable
    {
        $day = $date->setDate($date->year, 11, 22);
        while (! $day->isWednesday()) {
            $day = $day->subDay();
        }

        return $day;
    }

    /**
     * Gregorian Easter Sunday (Meeus/Jones/Butcher), without the optional
     * PHP calendar extension or an external holiday web service.
     */
    private static function easterSunday(int $year): CarbonImmutable
    {
        $a = $year % 19;
        $b = intdiv($year, 100);
        $c = $year % 100;
        $d = intdiv($b, 4);
        $e = $b % 4;
        $f = intdiv($b + 8, 25);
        $g = intdiv($b - $f + 1, 3);
        $h = (19 * $a + $b - $d - $g + 15) % 30;
        $i = intdiv($c, 4);
        $k = $c % 4;
        $l = (32 + 2 * $e + 2 * $i - $h - $k) % 7;
        $m = intdiv($a + 11 * $h + 22 * $l, 451);
        $month = intdiv($h + $l - 7 * $m + 114, 31);
        $day = ($h + $l - 7 * $m + 114) % 31 + 1;

        return CarbonImmutable::create($year, $month, $day, 0, 0, 0, 'Europe/Berlin');
    }
}
