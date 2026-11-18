<?php

namespace App\Services\Contracts;

use App\Models\Contract;
use Carbon\CarbonImmutable;

class ContractTerminationCalculator
{
    public function suggestedEndDate(
        Contract $contract,
        string $terminationType,
        string $initiatedBy,
        string $receivedOn,
        ?string $requestedEndOn,
    ): ?string {
        $reference = CarbonImmutable::parse($receivedOn)->startOfDay();

        $suggested = match ($terminationType) {
            'ordinary_termination' => $this->ordinaryEndDate($contract, $initiatedBy, $reference, $requestedEndOn),
            'extraordinary_termination_with_notice' => $contract->contract_type === 'residential_lease'
                ? $this->statutoryMonthlyEndDate($reference)
                : ($requestedEndOn ? CarbonImmutable::parse($requestedEndOn) : null),
            'termination_without_notice' => CarbonImmutable::parse($requestedEndOn ?? $reference),
            'termination_agreement' => $requestedEndOn ? CarbonImmutable::parse($requestedEndOn) : null,
            'fixed_term_expiry' => $contract->fixed_until ? CarbonImmutable::parse($contract->fixed_until) : null,
            'withdrawal_or_contestation', 'other_termination' => $requestedEndOn ? CarbonImmutable::parse($requestedEndOn) : null,
            default => null,
        };

        if (! $suggested) {
            return null;
        }

        // A contractual minimum binding restricts only ordinary termination.
        // Statutory extraordinary rights, immediate termination and mutual agreements must not be extended artificially.
        if ($terminationType === 'ordinary_termination') {
            $minimumEnd = $this->minimumBindingEnd($contract);
            if ($minimumEnd && $suggested->lt($minimumEnd)) {
                $suggested = $minimumEnd;
            }
        }

        return $suggested->toDateString();
    }

    private function ordinaryEndDate(
        Contract $contract,
        string $initiatedBy,
        CarbonImmutable $reference,
        ?string $requestedEndOn,
    ): ?CarbonImmutable {
        if ($contract->contract_type === 'residential_lease') {
            $landlordExtensionMonths = $initiatedBy === 'landlord'
                ? $this->landlordExtensionMonths($contract, $reference)
                : 0;

            return $this->statutoryMonthlyEndDate($reference, $landlordExtensionMonths);
        }

        if (in_array($contract->contract_type, Contract::ANCILLARY_NOTICE_TYPES, true)) {
            $noticePeriod = $contract->notice_period_months;

            if ($noticePeriod === null) {
                return $this->statutoryMonthlyEndDate($reference);
            }

            return $reference
                ->startOfMonth()
                ->addMonthsNoOverflow(max(0, (int) $noticePeriod))
                ->endOfMonth();
        }

        return $requestedEndOn ? CarbonImmutable::parse($requestedEndOn) : null;
    }

    private function statutoryMonthlyEndDate(CarbonImmutable $reference, int $extensionMonths = 0): CarbonImmutable
    {
        $cutoff = $this->thirdWorkingDay($reference->startOfMonth());
        $receivedAfterCutoff = $reference->gt($cutoff);
        $monthsToEnd = 2 + $extensionMonths + ($receivedAfterCutoff ? 1 : 0);

        return $reference->startOfMonth()->addMonthsNoOverflow($monthsToEnd)->endOfMonth();
    }

    private function thirdWorkingDay(CarbonImmutable $month): CarbonImmutable
    {
        $cursor = $month->startOfMonth();
        $workingDays = 0;

        while (true) {
            // Saturday generally counts as a working day for the notice-period grace window.
            if (! $cursor->isSunday()) {
                $workingDays++;
            }

            if ($workingDays === 3) {
                // If the third working day itself is Saturday, the deadline moves to Monday.
                return $cursor->isSaturday() ? $cursor->addDays(2) : $cursor;
            }

            $cursor = $cursor->addDay();
        }
    }

    private function landlordExtensionMonths(Contract $contract, CarbonImmutable $reference): int
    {
        $occupationStarted = CarbonImmutable::parse($contract->handed_over_at ?? $contract->starts_on)->startOfDay();
        if ($reference->lt($occupationStarted)) {
            return 0;
        }

        $years = $occupationStarted->diffInYears($reference);
        if ($years >= 8) {
            return 6;
        }
        if ($years >= 5) {
            return 3;
        }

        return 0;
    }

    private function minimumBindingEnd(Contract $contract): ?CarbonImmutable
    {
        if ($contract->minimum_term_months <= 0) {
            return null;
        }

        return CarbonImmutable::parse($contract->starts_on)
            ->addMonthsNoOverflow($contract->minimum_term_months)
            ->subDay()
            ->endOfMonth();
    }
}
