<?php

namespace App\Services\Contracts;

use App\Models\ContractDeposit;
use App\Models\ContractDepositEvent;
use App\Models\PaymentAllocation;
use Carbon\CarbonImmutable;

/**
 * Transparent ACT/ACT simple-interest forecast. Never posts the forecast to the
 * custodial balance: only documented bank credits may be booked as interest.
 */
final class ContractDepositInterestCalculator
{
    /** @return array<string,mixed> */
    public function calculate(ContractDeposit $deposit, CarbonImmutable $through): array
    {
        $deposit->loadMissing([
            'interestRates', 'events',
            'installments.receivable.allocations.payment',
            'receivables.allocations.payment',
        ]);

        $credits = $deposit->events->where('event_type', 'interest_credit');
        $bookedCredits = round((float) $credits->sum('amount'), 2);
        $result = [
            'enabled' => $deposit->isCashSecurity() && (bool) $deposit->interest_relevant,
            'calculationMethod' => 'ACT/ACT (Kalendertage, 365/366; Schätzung, kein Bankbeleg)',
            'asOf' => $through->toDateString(),
            'recordedInterest' => (float) $deposit->interest_amount,
            'postedInterest' => $bookedCredits,
            'legacyInterest' => (float) $deposit->legacy_interest_amount,
            'estimatedInterest' => 0.0,
            'differenceToRecorded' => 0.0,
            'principalAtEnd' => 0.0,
            'missingRatePeriods' => false,
            'movements' => [],
        ];
        if (! $deposit->isCashSecurity()) return $result;

        $flows = [];
        $push = static function (string $date, int $cents, string $type, string $reference) use (&$flows): void {
            if ($cents === 0) return;
            $flows[] = compact('date', 'cents', 'type', 'reference');
        };
        $toCents = static fn (mixed $amount): int => (int) round((float) $amount * 100);

        foreach ($deposit->installments as $installment) {
            foreach ($installment->receivable?->allocations ?? [] as $allocation) {
                if (! $allocation->payment || $allocation->allocation_type === 'overpayment') continue;
                $date = $this->paymentDate($allocation);
                if ($date) $push($date, $toCents($allocation->amount), 'Einzahlung', (string) ($installment->receivable?->number ?? ''));
            }
        }

        foreach ($deposit->receivables->where('type', 'deposit_refund') as $refund) {
            foreach ($refund->allocations as $allocation) {
                if (! $allocation->payment) continue;
                $date = $this->paymentDate($allocation);
                if ($date) $push($date, -$toCents($allocation->amount), 'Auszahlung', (string) $refund->number);
            }
        }

        foreach ($deposit->events as $event) {
            if ($event->event_type === 'interest_credit') {
                $push($event->effective_on->toDateString(), $toCents($event->amount), 'Bankzinsgutschrift', (string) ($event->reference ?? ''));
            } elseif ($event->event_type === 'retention_offset') {
                $push($event->effective_on->toDateString(), -$toCents($event->amount), 'OP-Verrechnung', (string) ($event->reference ?? ''));
            }
        }

        usort($flows, static fn (array $a, array $b): int => strcmp($a['date'], $b['date']));
        $result['movements'] = array_values(array_map(
            static fn (array $row): array => [
                'date' => $row['date'], 'amount' => $row['cents'] / 100,
                'type' => $row['type'], 'reference' => $row['reference'],
            ],
            array_filter($flows, static fn (array $row): bool => $row['date'] <= $through->toDateString()),
        ));

        $rates = $deposit->interestRates->sortBy('effective_from')->values();
        if (! $flows) return $result;

        $first = CarbonImmutable::parse($flows[0]['date']);
        $balance = 0;
        $interest = 0.0;
        $flowIndex = 0;
        $rateIndex = 0;
        $rate = null;
        $missing = false;
        $day = $first;

        // Bounded to 100 years to keep even malformed historical data cheap.
        if ($through->lt($first)) return $result;
        if ($first->diffInYears($through) > 100) {
            $result['missingRatePeriods'] = true;
            return $result;
        }

        for (; $day->lte($through); $day = $day->addDay()) {
            $iso = $day->toDateString();
            while ($flowIndex < count($flows) && $flows[$flowIndex]['date'] <= $iso) {
                $balance += $flows[$flowIndex]['cents'];
                $flowIndex++;
            }
            while ($rateIndex < $rates->count() && $rates[$rateIndex]->effective_from->toDateString() <= $iso) {
                $rate = (float) $rates[$rateIndex]->annual_rate_percent;
                $rateIndex++;
            }
            if ($rate === null && $balance > 0) $missing = true;
            if ($result['enabled'] && $rate !== null && $balance > 0) {
                $daysInYear = $day->isLeapYear() ? 366 : 365;
                $interest += ($balance / 100) * ($rate / 100) / $daysInYear;
            }
        }

        $result['missingRatePeriods'] = $missing;
        $result['principalAtEnd'] = round($balance / 100, 2);
        $result['estimatedInterest'] = round($interest, 2);
        $result['differenceToRecorded'] = round($result['estimatedInterest'] - $result['recordedInterest'], 2);

        return $result;
    }

    private function paymentDate(PaymentAllocation $allocation): ?string
    {
        return $allocation->payment?->value_date?->toDateString()
            ?? $allocation->payment?->booking_date?->toDateString();
    }
}
