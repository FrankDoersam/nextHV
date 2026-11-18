<?php

namespace App\Services\OperatingCosts;

use App\Models\Contract;
use App\Models\ContractCondition;
use App\Models\Payment;
use App\Models\PaymentAllocation;
use App\Models\Receivable;
use Carbon\Carbon;
use App\Support\Formatting\OperatingCostDisplayFormatter;

final class ActualAdvancePaymentService
{
    public function calculate(Contract $contract, Carbon|string $from, Carbon|string $until, string $billingMode): array
    {
        $from = Carbon::parse($from)->startOfMonth();
        $until = Carbon::parse($until)->endOfMonth();
        $contract->loadMissing('conditions');

        $receivables = Receivable::query()
            ->where('contract_id', $contract->id)
            ->with(['allocations.payment'])
            ->orderBy('service_month')->orderBy('due_date')->get()
            ->filter(fn (Receivable $receivable): bool => $this->isRelevantAdvance($receivable, $billingMode))
            ->filter(function (Receivable $receivable) use ($from, $until): bool {
                $month = $this->receivableMonth($receivable);
                return $month !== null && $month->betweenIncluded($from, $until);
            })->values();

        $months = [];
        foreach ($receivables as $receivable) {
            $month = $this->receivableMonth($receivable);
            if (! $month) continue;

            $scopeFactors = $this->advanceScopeFactors($contract, $receivable, $billingMode, $month);
            if ($scopeFactors === []) continue;

            $creditAllocations = $receivable->allocations
                ->filter(fn (PaymentAllocation $allocation): bool => $allocation->payment?->direction === 'credit')
                ->sortBy(fn (PaymentAllocation $allocation): string => implode('|', [
                    $allocation->booked_at?->toIso8601String() ?? '',
                    (string) $allocation->id,
                ]))
                ->values();
            // Allocate cents once over all payment receipts and scopes.
            // Independent rounding of each scope/payment can otherwise count
            // the same cent twice in a combined NKA/HKA advance.
            $scopedBookings = $this->scopedPaymentBookings($creditAllocations->all(), $scopeFactors);
            $fallbackAmount = 0.0;
            if ($receivable->allocations->isEmpty()) {
                $fallbackAmount = max(0.0, round((float) $receivable->amount - (float) $receivable->open_amount, 2));
            }

            $scopedFallback = $this->splitAdvanceCents((int) round($fallbackAmount * 100), $scopeFactors);
            foreach ($scopeFactors as $scope => $factor) {
                if ($factor <= 0.0) continue;

                $scopedAllocationAmount = round(collect((array) ($scopedBookings[$scope] ?? []))
                    ->sum(fn (array $booking): float => (float) $booking['amount']), 2);
                $scopedFallbackAmount = ((int) ($scopedFallback[$scope] ?? 0)) / 100;
                $amount = round($scopedAllocationAmount + $scopedFallbackAmount, 2);
                if ($amount <= 0.0) continue;

                $key = $month->format('Y-m');
                $months[$key] ??= [
                    'month' => $key,
                    'amount' => 0.0,
                    'allocationAmount' => 0.0,
                    'fallbackAmount' => 0.0,
                    'receivableIds' => [],
                    'byScope' => [],
                    'bookings' => [],
                ];
                $months[$key]['amount'] = round($months[$key]['amount'] + $amount, 2);
                if ($scopedAllocationAmount > 0.0) {
                    foreach ((array) ($scopedBookings[$scope] ?? []) as $booking) {
                        /** @var PaymentAllocation $allocation */
                        $allocation = $booking['allocation'];
                        $bookingAmount = (float) $booking['amount'];
                        if ($bookingAmount <= 0.0) continue;
                        $payment = $allocation->payment;
                        $months[$key]['bookings'][] = [
                            'scope' => $scope,
                            'scopeLabel' => $this->advanceScopeDisplay($scope),
                            'paymentId' => (string) ($payment?->id ?? ''),
                            'opNumber' => $receivable->number ?: $receivable->external_number ?: (string) $receivable->id,
                            'opDescription' => $receivable->description,
                            'paymentNumber' => $payment?->number ?: $payment?->receipt_number ?: (string) $allocation->payment_id,
                            'bookingDate' => $payment?->booking_date?->toDateString(),
                            'valueDate' => $payment?->value_date?->toDateString(),
                            'paymentAmount' => round((float) ($payment?->amount ?? 0), 2),
                            'allocatedAmount' => $bookingAmount,
                            'paymentMethod' => $payment?->payment_method,
                            'counterparty' => $payment?->counterparty_name,
                            'purpose' => $payment?->purpose,
                            'reference' => $allocation->reference,
                        ];
                    }
                }
                $months[$key]['allocationAmount'] = round($months[$key]['allocationAmount'] + $scopedAllocationAmount, 2);
                $months[$key]['fallbackAmount'] = round($months[$key]['fallbackAmount'] + $scopedFallbackAmount, 2);
                $months[$key]['receivableIds'][] = (string) $receivable->id;
                $months[$key]['byScope'][$scope] ??= [
                    'scope' => $scope,
                    'scopeLabel' => $this->advanceScopeDisplay($scope),
                    'amount' => 0.0,
                    'allocationAmount' => 0.0,
                    'fallbackAmount' => 0.0,
                    'receivableIds' => [],
                ];
                $months[$key]['byScope'][$scope]['amount'] = round($months[$key]['byScope'][$scope]['amount'] + $amount, 2);
                $months[$key]['byScope'][$scope]['allocationAmount'] = round($months[$key]['byScope'][$scope]['allocationAmount'] + $scopedAllocationAmount, 2);
                $months[$key]['byScope'][$scope]['fallbackAmount'] = round($months[$key]['byScope'][$scope]['fallbackAmount'] + $scopedFallbackAmount, 2);
                $months[$key]['byScope'][$scope]['receivableIds'][] = (string) $receivable->id;
            }
        }

        ksort($months);
        $monthRows = array_values(array_map(function (array $row): array {
            $byScope = collect((array) ($row['byScope'] ?? []))
                ->map(function (array $scopeRow): array {
                    $scopeRow['receivableIds'] = array_values(array_unique((array) ($scopeRow['receivableIds'] ?? [])));

                    return $scopeRow;
                })
                ->sortBy('scopeLabel')
                ->values()
                ->all();
            $row['byScope'] = $byScope;
            $row['bookings'] = collect((array) ($row['bookings'] ?? []))->values()->all();
            $row['receivableIds'] = array_values(array_unique((array) ($row['receivableIds'] ?? [])));
            $row['scope'] = count($byScope) === 1 ? (string) ($byScope[0]['scope'] ?? 'advance') : 'mixed_advance_scopes';
            $row['scopeLabel'] = count($byScope) === 1 ? (string) ($byScope[0]['scopeLabel'] ?? 'Vorauszahlung') : 'mehrere Vorauszahlungsarten';

            return $row;
        }, $months));
        $groups = $this->formatAdvanceGroups($monthRows);
        $allocationTotal = round(array_sum(array_column($monthRows, 'allocationAmount')), 2);
        $fallbackTotal = round(array_sum(array_column($monthRows, 'fallbackAmount')), 2);
        $source = match (true) {
            $allocationTotal > 0 && $fallbackTotal > 0 => 'actual_payment_allocations_with_legacy_fallback',
            $allocationTotal > 0 => 'actual_payment_allocations',
            $fallbackTotal > 0 => 'legacy_balance_fallback',
            default => 'none',
        };

        return [
            'total' => round(array_sum(array_column($monthRows, 'amount')), 2),
            'details' => $this->formatPaymentBlocks($groups),
            'groups' => $groups,
            'months' => $monthRows,
            'receipts' => $this->paymentReceipts($contract, $monthRows),
            'source' => $source,
        ];
    }



    /**
     * Split a cent amount into the selected scopes. When every scope is in the
     * statement, the final scope gets the remainder, never a second rounded
     * share of the same cent. In NKA-only mode the excluded HKA cents remain
     * outside this statement.
     *
     * @param array<string,float> $scopeFactors
     * @return array<string,int>
     */
    private function splitAdvanceCents(int $amountCents, array $scopeFactors): array
    {
        $keys = array_keys($scopeFactors);
        $fullScope = abs(array_sum($scopeFactors) - 1.0) < 0.00000001;
        $remaining = $amountCents;
        $result = [];
        foreach ($keys as $index => $scope) {
            $cents = $fullScope && $index === count($keys) - 1
                ? $remaining
                : (int) round($amountCents * (float) $scopeFactors[$scope]);
            $result[$scope] = $cents;
            $remaining -= $cents;
        }

        return $result;
    }

    /**
     * A running rounded allocation gives an exact per-scope monthly total.
     * The last scope in a full NKA+HKA statement receives each receipt's
     * remaining cents, so no receipt is split beyond its original amount.
     *
     * @param array<int,PaymentAllocation> $allocations
     * @param array<string,float> $scopeFactors
     * @return array<string,array<int,array{allocation:PaymentAllocation,amount:float}>>
     */
    private function scopedPaymentBookings(array $allocations, array $scopeFactors): array
    {
        $keys = array_keys($scopeFactors);
        $fullScope = abs(array_sum($scopeFactors) - 1.0) < 0.00000001;
        $result = array_fill_keys($keys, []);
        $previousScopeCents = array_fill_keys($keys, 0);
        $cumulativeCents = 0;
        foreach ($allocations as $allocation) {
            $receiptCents = (int) round((float) $allocation->amount * 100);
            $cumulativeCents += $receiptCents;
            $remainingReceiptCents = $receiptCents;
            foreach ($keys as $index => $scope) {
                if ($fullScope && $index === count($keys) - 1) {
                    $shareCents = $remainingReceiptCents;
                } else {
                    $targetCents = (int) round($cumulativeCents * (float) $scopeFactors[$scope]);
                    $shareCents = $targetCents - $previousScopeCents[$scope];
                    $previousScopeCents[$scope] = $targetCents;
                }
                $remainingReceiptCents -= $shareCents;
                if ($shareCents > 0) {
                    $result[$scope][] = [
                        'allocation' => $allocation,
                        'amount' => $shareCents / 100,
                    ];
                }
            }
        }

        return $result;
    }

    /**
     * One payment must occur only once in the tenant PDF, even if it was
     * allocated to several advance months or both operating and heating.
     * The actual advance shares come from the same bookings that determine
     * the statement balance. Rent is read from the payment's own OP allocations.
     *
     * Cross-contract/supplier allocations must never disclose another party's
     * full payment amount in the tenant statement: show only the allocations
     * explicitly assigned to this contract in that case.
     *
     * @param array<int,array<string,mixed>> $monthRows
     * @return array<int,array<string,mixed>>
     */
    private function paymentReceipts(Contract $contract, array $monthRows): array
    {
        $bookings = collect($monthRows)
            ->flatMap(fn (array $month): array => collect((array) ($month['bookings'] ?? []))
                ->map(fn (array $booking): array => [
                    ...$booking,
                    'month' => (string) ($month['month'] ?? ''),
                ])->all())
            ->filter(fn (array $booking): bool => trim((string) ($booking['paymentId'] ?? '')) !== '')
            ->values();
        $paymentIds = $bookings->pluck('paymentId')->unique()->values();
        if ($paymentIds->isEmpty()) return [];

        $bookingsByPayment = $bookings->groupBy('paymentId');
        $contractId = (string) $contract->id;

        return Payment::query()
            ->with(['allocations.receivable'])
            ->whereIn('id', $paymentIds->all())
            ->get()
            ->filter(fn (Payment $payment): bool => $payment->direction === 'credit')
            ->sortBy(fn (Payment $payment): string => implode('|', [
                $payment->booking_date?->toDateString() ?? '',
                (string) ($payment->number ?? $payment->receipt_number ?? ''),
                (string) $payment->id,
            ]))
            ->map(function (Payment $payment) use ($bookingsByPayment, $contractId): array {
                $relatedBookings = collect((array) ($bookingsByPayment->get((string) $payment->id)?->all() ?? []));
                $operating = 0.0;
                $heating = 0.0;
                $joint = 0.0;
                foreach ($relatedBookings as $booking) {
                    $amount = (float) ($booking['allocatedAmount'] ?? 0);
                    $scope = (string) ($booking['scope'] ?? '');
                    if (in_array($scope, ['operating_costs', 'operating_costs_prorated_from_combined_advance'], true)) {
                        $operating += $amount;
                    } elseif (in_array($scope, ['heating_costs', 'heating_costs_prorated_from_combined_advance'], true)) {
                        $heating += $amount;
                    } else {
                        // Do not guess a split for combined or legacy advances.
                        $joint += $amount;
                    }
                }

                $contractAllocations = $payment->allocations
                    ->filter(fn ($allocation): bool => (string) ($allocation->receivable?->contract_id ?? '') === $contractId);
                $foreignAllocation = $payment->allocations->count() !== $contractAllocations->count();
                $rent = round($contractAllocations
                    ->filter(fn ($allocation): bool => $allocation->receivable?->type === 'rent')
                    ->sum(fn ($allocation): float => (float) $allocation->amount), 2);
                $contractAmount = round($contractAllocations
                    ->sum(fn ($allocation): float => (float) $allocation->amount), 2);
                $visibleAmount = $foreignAllocation ? $contractAmount : round((float) $payment->amount, 2);
                $operating = round($operating, 2);
                $heating = round($heating, 2);
                $joint = round($joint, 2);
                $remaining = round($visibleAmount - $rent - $operating - $heating - $joint, 2);

                return [
                    'bookingDate' => $payment->booking_date?->toDateString(),
                    'paymentNumber' => trim((string) ($payment->number ?: $payment->receipt_number ?: '')),
                    'paymentMethod' => (string) ($payment->payment_method ?? ''),
                    'advanceMonths' => $relatedBookings->pluck('month')->filter()->unique()->sort()->values()->all(),
                    'displayAmount' => $visibleAmount,
                    'contractShareOnly' => $foreignAllocation,
                    'rentAmount' => $rent,
                    'operatingAmount' => $operating,
                    'heatingAmount' => $heating,
                    'jointAdvanceAmount' => $joint,
                    'otherAmount' => $remaining,
                    'unallocatedAmount' => $foreignAllocation ? 0.0 : round((float) ($payment->unallocated_amount ?? 0), 2),
                    'reconciled' => $remaining >= -0.009,
                ];
            })
            ->values()
            ->all();
    }

    private function isRelevantAdvance(Receivable $receivable, string $billingMode): bool
    {
        // A rent demand that mentions ancillary costs is still rent, never an
        // advance payment. Keep only explicit advances and legacy 'other' OPs.
        if (! in_array($receivable->type, ['advance', 'other'], true)) return false;

        $includeOperating = in_array($billingMode, ['operating_and_heating', 'operating_only'], true);
        $includeHeating = in_array($billingMode, ['operating_and_heating', 'heating_only'], true);
        if (! $includeOperating && ! $includeHeating) return false;
        $costArea = mb_strtolower(trim((string) $receivable->cost_area));
        if ($receivable->type === 'advance') {
            if ($costArea === 'operating_costs') return $includeOperating;
            if ($costArea === 'heating_costs') return $includeHeating;
            if ($costArea === 'operating_and_heating') return $includeOperating || $includeHeating;
        }
        $text = mb_strtolower(trim(implode(' ', array_filter([$receivable->number, $receivable->external_number, $receivable->description, $receivable->notes]))));
        $operating = $this->containsAny($text, ['nka', 'nebenkosten', 'betriebskosten']);
        $heating = $this->containsAny($text, ['hka', 'heizkosten', 'warmwasser']);
        return ($includeOperating && $operating) || ($includeHeating && $heating);
    }

    /** @return array<string,float> */
    private function advanceScopeFactors(Contract $contract, Receivable $receivable, string $billingMode, Carbon $month): array
    {
        $includeOperating = in_array($billingMode, ['operating_and_heating', 'operating_only'], true);
        $includeHeating = in_array($billingMode, ['operating_and_heating', 'heating_only'], true);
        $costArea = mb_strtolower(trim((string) $receivable->cost_area));

        if ($costArea === 'operating_costs') return $includeOperating ? ['operating_costs' => 1.0] : [];
        if ($costArea === 'heating_costs') return $includeHeating ? ['heating_costs' => 1.0] : [];
        if ($costArea !== 'operating_and_heating') {
            // Older OPs can lack the cost-area tag. Use an unambiguous
            // description instead of showing the amount as an unexplained
            // mixed advance or silently attributing rent to NKA.
            $text = mb_strtolower(trim(implode(' ', array_filter([
                $receivable->number, $receivable->external_number,
                $receivable->description, $receivable->notes,
            ]))));
            $operatingInText = $this->containsAny($text, ['nka', 'nebenkosten', 'betriebskosten']);
            $heatingInText = $this->containsAny($text, ['hka', 'heizkosten', 'warmwasser']);
            if ($operatingInText && ! $heatingInText) return $includeOperating ? ['operating_costs' => 1.0] : [];
            if ($heatingInText && ! $operatingInText) return $includeHeating ? ['heating_costs' => 1.0] : [];
            if (! $operatingInText || ! $heatingInText) return [];
            $costArea = 'operating_and_heating';
        }
        if (! $includeOperating && ! $includeHeating) return [];

        $condition = $contract->conditionOverlapping($month->copy()->startOfMonth(), $month->copy()->endOfMonth());
        $operating = (float) ($condition?->operating_cost_advance_amount ?? 0);
        $heating = (float) ($condition?->heating_cost_advance_amount ?? 0);
        $total = $operating + $heating;
        if ($total > 0.0) {
            $operatingScope = $includeHeating ? 'operating_costs' : 'operating_costs_prorated_from_combined_advance';
            $heatingScope = $includeOperating ? 'heating_costs' : 'heating_costs_prorated_from_combined_advance';

            return array_filter([
                $operatingScope => $includeOperating && $operating > 0.0 ? $operating / $total : 0.0,
                $heatingScope => $includeHeating && $heating > 0.0 ? $heating / $total : 0.0,
            ], fn (float $factor): bool => $factor > 0.0);
        }

        return $includeOperating && $includeHeating ? ['operating_and_heating' => 1.0] : [];
    }

    private function advanceScopeDisplay(string $scope): string
    {
        return match ($scope) {
            'operating_costs', 'operating_costs_prorated_from_combined_advance' => 'Betriebskostenvorauszahlung',
            'heating_costs', 'heating_costs_prorated_from_combined_advance' => 'Heizkostenvorauszahlung',
            'operating_and_heating' => 'Betriebs-/Heizkostenvorauszahlung',
            default => 'Vorauszahlung',
        };
    }

    private function receivableMonth(Receivable $receivable): ?Carbon
    {
        $value = $receivable->due_date ?: $receivable->service_month;
        return $value ? Carbon::parse($value)->startOfMonth() : null;
    }

    private function formatAdvanceGroups(array $monthRows): array
    {
        $expanded = collect($monthRows)
            ->flatMap(function (array $month): array {
                return collect((array) ($month['byScope'] ?? []))
                    ->map(fn (array $scope): array => [
                        'month' => (string) $month['month'],
                        'scope' => (string) ($scope['scope'] ?? 'advance'),
                        'scopeLabel' => (string) ($scope['scopeLabel'] ?? 'Vorauszahlung'),
                        'amount' => (float) ($scope['amount'] ?? 0),
                    ])
                    ->all();
            })
            ->filter(fn (array $row): bool => abs((float) ($row['amount'] ?? 0)) >= 0.005)
            ->sortBy([['scopeLabel', 'asc'], ['month', 'asc']])
            ->values();

        return $expanded
            ->groupBy('scopeLabel')
            ->map(function ($rows, string $label): array {
                $rows = collect($rows)->sortBy('month')->values();

                return [
                    'title' => $label,
                    'scope' => (string) ($rows->first()['scope'] ?? 'advance'),
                    'amount' => round($rows->sum('amount'), 2),
                    'details' => $this->formatScopedPaymentBlocks($rows->all()),
                ];
            })
            ->sortBy('title')
            ->values()
            ->all();
    }

    private function formatPaymentBlocks(array $groups): array
    {
        $groups = collect($groups)->filter(fn (array $group): bool => abs((float) ($group['amount'] ?? 0)) >= 0.005)->values();
        if ($groups->count() === 1) {
            return (array) ($groups->first()['details'] ?? []);
        }

        return $groups
            ->flatMap(fn (array $group): array => collect((array) ($group['details'] ?? []))
                ->map(fn (string $detail): string => ((string) ($group['title'] ?? 'Vorauszahlung')).': '.$detail)
                ->all())
            ->values()
            ->all();
    }

    private function formatScopedPaymentBlocks(array $rows): array
    {
        $details = [];
        $start = $end = null;
        $amount = null;
        foreach ($rows as $row) {
            $current = Carbon::createFromFormat('Y-m', (string) $row['month'])->startOfMonth();
            $value = (float) $row['amount'];
            if ($amount === null) {
                $start = $end = $current;
                $amount = $value;
                continue;
            }
            if (abs($value - $amount) < 0.01 && $end->copy()->addMonth()->format('Y-m') === $current->format('Y-m')) {
                $end = $current;
                continue;
            }
            $details[] = $this->formatPaymentBlock($start, $end, $amount);
            $start = $end = $current;
            $amount = $value;
        }
        if ($start && $end && $amount !== null) $details[] = $this->formatPaymentBlock($start, $end, $amount);

        return $details;
    }

    private function formatPaymentBlock(Carbon $start, Carbon $end, float $amount): string
    {
        $value = OperatingCostDisplayFormatter::moneySymbol($amount);
        return $start->eq($end)
            ? $start->format('m.Y').' '.$value
            : $start->format('m.Y').'-'.$end->format('m.Y').' monatlich '.$value;
    }

    private function containsAny(string $haystack, array $needles): bool
    {
        foreach ($needles as $needle) if (str_contains($haystack, $needle)) return true;
        return false;
    }
}
