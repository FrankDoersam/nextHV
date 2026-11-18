<?php

namespace App\Services\Contracts\Reports;

use App\Models\Contract;
use App\Models\PaymentAllocation;
use App\Models\Receivable;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

class ContractRentLedgerReportService
{
    private const EXCLUDED_TYPES = ['deposit', 'deposit_installment', 'deposit_refund', 'retention'];

    private const EXCLUDED_COST_AREAS = ['deposit'];

    public function build(Contract $contract, CarbonImmutable|string $from, CarbonImmutable|string $to): array
    {
        $from = $from instanceof CarbonImmutable ? $from->startOfDay() : CarbonImmutable::parse($from)->startOfDay();
        $to = $to instanceof CarbonImmutable ? $to->startOfDay() : CarbonImmutable::parse($to)->startOfDay();
        if ($to->lt($from)) {
            throw ValidationException::withMessages(['to' => 'Das Ende darf nicht vor dem Beginn liegen.']);
        }
        if ($to->gt($from->addYearsNoOverflow(3)->subDay())) {
            throw ValidationException::withMessages(['to' => 'Der Zeitraum darf maximal drei Jahre umfassen.']);
        }
        $balanceAsOf = CarbonImmutable::now();
        $serviceFrom = $from->startOfMonth();
        $serviceTo = $to->endOfMonth();

        $contract->loadMissing([
            'mainUnit.property',
            'units.unit.property',
            'parties.businessPartnerSummary:id,display_name',
            'terminations',
        ]);

        $receivables = $this->receivablesForContract($contract, $serviceFrom, $serviceTo);
        $months = collect($this->monthsInPeriod($from, $to))
            ->map(fn (CarbonImmutable $month): array => $this->monthReport($month, $receivables))
            ->filter(fn (array $month): bool => count($month['receivables']) > 0 || count($month['bookings']) > 0)
            ->values();
        $accounts = $this->summarize($receivables);
        $totals = $this->sumAccounts($accounts);

        return [
            'title' => 'Mietkonto Soll/Ist',
            'basis' => 'service_month_cohort_current_balance',
            'basisLabel' => 'Leistungsmonate mit aktuellem Buchungsstand',
            'balanceAsOf' => $balanceAsOf->toIso8601String(),
            'balanceAsOfLabel' => $balanceAsOf->format('d.m.Y H:i'),
            'period' => [
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
                'label' => $this->formatDate($from).' - '.$this->formatDate($to),
                'serviceFrom' => $serviceFrom->toDateString(),
                'serviceTo' => $serviceTo->toDateString(),
                'serviceLabel' => $this->formatDate($serviceFrom).' - '.$this->formatDate($serviceTo),
            ],
            'generatedAt' => $balanceAsOf->format('d.m.Y H:i'),
            'contract' => $this->contractPayload($contract),
            'accounts' => $accounts,
            'totals' => $totals,
            'months' => $months->all(),
            'filename' => $this->filename($contract, $from, $to),
        ];
    }

    private function receivablesForContract(Contract $contract, CarbonImmutable $from, CarbonImmutable $to): Collection
    {
        return Receivable::query()
            ->with(['allocations' => fn ($query) => $query
                ->whereHas('payment', fn ($payment) => $payment->whereNotIn('status', ['cancelled', 'canceled']))
                ->with('payment')])
            ->where('contract_id', $contract->id)
            ->whereNotIn('status', ['cancelled', 'canceled'])
            ->whereNotIn('type', self::EXCLUDED_TYPES)
            ->where(function ($query): void {
                $query->whereNull('cost_area')->orWhereNotIn('cost_area', self::EXCLUDED_COST_AREAS);
            })
            ->where(function ($query) use ($from, $to): void {
                $query
                    ->whereBetween('service_month', [$from->toDateString(), $to->toDateString()])
                    ->orWhere(fn ($fallback) => $fallback
                        ->whereNull('service_month')
                        ->whereBetween('due_date', [$from->toDateString(), $to->toDateString()]));
            })
            ->orderBy('service_month')
            ->orderBy('due_date')
            ->orderBy('number')
            ->get()
            ->values();
    }

    private function contractPayload(Contract $contract): array
    {
        $unit = $contract->effectiveMainUnit();
        $property = $unit?->property;

        return [
            'id' => $contract->id,
            'number' => $contract->contract_number,
            'status' => $contract->status,
            'tenant' => $contract->tenant_labels ?: '-',
            'property' => $property ? collect([$property->property_number, $property->name])->filter()->join(' · ') : '-',
            'unit' => $unit ? collect([$unit->unit_number, $unit->name])->filter()->join(' · ') : ($contract->unit_labels ?: '-'),
            'period' => collect([
                $this->formatDate($contract->starts_on),
                $contract->confirmed_end_on ? $this->formatDate($contract->confirmed_end_on) : 'offen',
            ])->filter()->join(' - '),
        ];
    }

    private function monthReport(CarbonImmutable $month, Collection $receivables): array
    {
        $start = $month->startOfMonth();
        $end = $month->endOfMonth();
        $rows = $receivables->filter(function (Receivable $receivable) use ($start, $end): bool {
            $date = $receivable->service_month ?: $receivable->due_date;

            return $date && CarbonImmutable::parse($date)->betweenIncluded($start, $end);
        })->values();
        $serialized = $rows->map(fn (Receivable $receivable): array => $this->serializeReceivable($receivable))->values();
        $bookings = $serialized
            ->flatMap(fn (array $row): array => $row['bookings'])
            ->sortBy('sortDate')
            ->values();
        $accounts = $this->summarize($rows);

        return [
            'month' => $month->format('Y-m'),
            'label' => $this->formatMonth($month),
            'accounts' => $accounts,
            'totals' => $this->sumAccounts($accounts),
            'receivables' => $serialized->all(),
            'bookings' => $bookings->all(),
        ];
    }

    private function serializeReceivable(Receivable $receivable): array
    {
        $account = $this->accountFor($receivable);
        $bookings = $receivable->allocations
            ->sortBy(fn (PaymentAllocation $allocation): string => $this->bookingSortDate($allocation))
            ->map(fn (PaymentAllocation $allocation): array => $this->serializeBooking($allocation, $receivable, $account))
            ->values();
        $payments = round((float) $bookings->where('allocationType', '!=', 'overpayment')->sum('amount'), 2);
        $overpayments = round((float) $bookings->where('allocationType', 'overpayment')->sum('amount'), 2);
        $coverage = round($payments + $overpayments, 2);
        $soll = $this->signedAmount($receivable);
        $open = $this->signedOpenAmount($receivable);
        $period = $receivable->service_month ?: $receivable->due_date;

        return [
            'id' => $receivable->id,
            'number' => $receivable->number,
            'externalNumber' => $receivable->external_number,
            'description' => $receivable->description,
            'type' => $receivable->type,
            'costArea' => $receivable->cost_area,
            'accountKey' => $account['key'],
            'accountLabel' => $account['label'],
            'periodLabel' => $period ? CarbonImmutable::parse($period)->format('m/Y') : '',
            'dueDate' => $receivable->due_date?->toDateString(),
            'status' => $receivable->status,
            'soll' => $soll,
            'payments' => $payments,
            'overpayments' => $overpayments,
            'coverage' => $coverage,
            'open' => $open,
            'saldo' => round($soll - $coverage, 2),
            'bookings' => $bookings->all(),
        ];
    }

    private function serializeBooking(PaymentAllocation $allocation, Receivable $receivable, array $account): array
    {
        $payment = $allocation->payment;
        $date = $payment?->value_date ?: $payment?->booking_date;
        $allocationType = (string) ($allocation->allocation_type ?: 'payment');
        $isPayout = $receivable->isPayoutLike();

        return [
            'id' => $allocation->id,
            'paymentId' => $allocation->payment_id,
            'date' => $this->formatDate($date),
            'dateLabel' => $payment?->value_date ? 'Wertstellung' : ($payment?->booking_date ? 'Zahlungsbuchung' : 'Zahlungsdatum unbekannt'),
            'bookingDate' => $payment?->booking_date?->toDateString(),
            'valueDate' => $payment?->value_date?->toDateString(),
            'bookedAt' => $this->formatDate($allocation->booked_at),
            'bookedAtLabel' => 'Zuordnung',
            'sortDate' => $this->bookingSortDate($allocation),
            'paymentLabel' => trim(($isPayout ? 'Auszahlung ' : 'Zahlung ').$this->formatDate($date)),
            'paymentAmount' => $payment ? (float) $payment->amount : null,
            'paymentDirection' => $payment?->direction,
            'counterparty' => $payment?->counterparty_name,
            'iban' => $this->iban($payment?->counterparty_iban),
            'purpose' => trim(collect([$payment?->purpose, $payment?->booking_text])->filter()->join(' / ')),
            'receivableId' => $receivable->id,
            'receivableLabel' => $receivable->description,
            'accountKey' => $account['key'],
            'accountLabel' => $account['label'],
            'allocationType' => $allocationType,
            'allocationTypeLabel' => $allocationType === 'overpayment' ? 'Überzahlung' : ($isPayout ? 'Auszahlung' : 'Zahlung'),
            'isOverpayment' => $allocationType === 'overpayment',
            'isPayout' => $isPayout,
            'amount' => round($this->directionSign($receivable) * (float) $allocation->amount, 2),
            'reference' => $allocation->reference,
        ];
    }

    private function iban(?string $iban): ?string
    {
        if (! $iban) {
            return null;
        }

        return strlen($iban) >= 8 ? substr($iban, 0, 2).' •••• '.substr($iban, -4) : '••••';
    }

    private function summarize(Collection $receivables): array
    {
        $accounts = $this->emptyAccounts();

        foreach ($receivables as $receivable) {
            $account = $this->accountFor($receivable);
            $key = $account['key'];
            $bookings = $receivable->allocations;
            $payments = round($this->directionSign($receivable) * (float) $bookings->where('allocation_type', '!=', 'overpayment')->sum('amount'), 2);
            $overpayments = round($this->directionSign($receivable) * (float) $bookings->where('allocation_type', 'overpayment')->sum('amount'), 2);
            $coverage = round($payments + $overpayments, 2);
            $soll = $this->signedAmount($receivable);
            $open = $this->signedOpenAmount($receivable);

            $accounts[$key]['receivableCount']++;
            $accounts[$key]['bookingCount'] += $bookings->count();
            $accounts[$key]['soll'] = round($accounts[$key]['soll'] + $soll, 2);
            $accounts[$key]['payments'] = round($accounts[$key]['payments'] + $payments, 2);
            $accounts[$key]['overpayments'] = round($accounts[$key]['overpayments'] + $overpayments, 2);
            $accounts[$key]['coverage'] = round($accounts[$key]['coverage'] + $coverage, 2);
            $accounts[$key]['open'] = round($accounts[$key]['open'] + $open, 2);
            $accounts[$key]['saldo'] = round($accounts[$key]['saldo'] + $soll - $coverage, 2);
        }

        return collect($accounts)
            ->filter(fn (array $account): bool => $account['receivableCount'] > 0 || abs((float) $account['soll']) >= 0.005 || abs((float) $account['payments']) >= 0.005)
            ->sortBy('sort')
            ->values()
            ->all();
    }

    private function sumAccounts(array $accounts): array
    {
        return collect($accounts)->reduce(function (array $carry, array $account): array {
            foreach (['soll', 'payments', 'overpayments', 'coverage', 'open', 'saldo'] as $field) {
                $carry[$field] = round($carry[$field] + (float) ($account[$field] ?? 0), 2);
            }
            $carry['receivableCount'] += (int) ($account['receivableCount'] ?? 0);
            $carry['bookingCount'] += (int) ($account['bookingCount'] ?? 0);

            return $carry;
        }, $this->emptyTotals());
    }

    private function emptyAccounts(): array
    {
        return collect($this->accountDefinitions())
            ->mapWithKeys(fn (array $definition, string $key): array => [$key => $this->emptyAccount($key, $definition['label'], $definition['sort'])])
            ->all();
    }

    private function emptyAccount(string $key, string $label, int $sort): array
    {
        return [
            'key' => $key,
            'label' => $label,
            'sort' => $sort,
            'receivableCount' => 0,
            'bookingCount' => 0,
            'soll' => 0.0,
            'payments' => 0.0,
            'overpayments' => 0.0,
            'coverage' => 0.0,
            'open' => 0.0,
            'saldo' => 0.0,
        ];
    }

    private function emptyTotals(): array
    {
        return [
            'soll' => 0.0,
            'payments' => 0.0,
            'overpayments' => 0.0,
            'coverage' => 0.0,
            'open' => 0.0,
            'saldo' => 0.0,
            'receivableCount' => 0,
            'bookingCount' => 0,
        ];
    }

    private function accountFor(Receivable $receivable): array
    {
        $definitions = $this->accountDefinitions();
        $key = $receivable->cost_area ?: match ($receivable->type) {
            'rent' => 'base_rent',
            'advance' => 'operating_and_heating',
            'settlement' => 'settlement',
            default => 'other',
        };

        if (! array_key_exists($key, $definitions)) {
            $key = 'other';
        }

        $definition = $definitions[$key];

        return $this->emptyAccount($key, $definition['label'], $definition['sort']);
    }

    private function accountDefinitions(): array
    {
        return [
            'base_rent' => ['label' => 'Grundmiete', 'sort' => 10],
            'operating_costs' => ['label' => 'Betriebskosten-Vorauszahlung', 'sort' => 20],
            'heating_costs' => ['label' => 'Heizkosten-Vorauszahlung', 'sort' => 30],
            'operating_and_heating' => ['label' => 'Nebenkosten-/Heizkosten-Vorauszahlung', 'sort' => 40],
            'garage' => ['label' => 'Garage', 'sort' => 50],
            'parking' => ['label' => 'Stellplatz', 'sort' => 60],
            'settlement' => ['label' => 'Abrechnung', 'sort' => 70],
            'other' => ['label' => 'Sonstige Forderung', 'sort' => 999],
        ];
    }

    private function signedAmount(Receivable $receivable): float
    {
        return round($this->directionSign($receivable) * (float) $receivable->amount, 2);
    }

    private function signedOpenAmount(Receivable $receivable): float
    {
        return round($this->directionSign($receivable) * (float) $receivable->open_amount, 2);
    }

    private function directionSign(Receivable $receivable): int
    {
        return $receivable->isPayoutLike() ? -1 : 1;
    }

    private function monthsInPeriod(CarbonImmutable $from, CarbonImmutable $to): array
    {
        $months = [];
        $cursor = $from->startOfMonth();
        $end = $to->startOfMonth();

        while ($cursor->lte($end)) {
            $months[] = $cursor;
            $cursor = $cursor->addMonth();
        }

        return $months;
    }

    private function bookingSortDate(PaymentAllocation $allocation): string
    {
        $payment = $allocation->payment;
        $date = $payment?->value_date ?: $payment?->booking_date;

        if ($date instanceof \DateTimeInterface) {
            return $date->format('Y-m-d H:i:s');
        }

        return (string) ($date ?: '9999-12-31');
    }

    private function formatMonth(CarbonImmutable $date): string
    {
        $months = [
            1 => 'Januar', 2 => 'Februar', 3 => 'März', 4 => 'April', 5 => 'Mai', 6 => 'Juni',
            7 => 'Juli', 8 => 'August', 9 => 'September', 10 => 'Oktober', 11 => 'November', 12 => 'Dezember',
        ];

        return ($months[(int) $date->format('n')] ?? $date->format('m')).' '.$date->format('Y');
    }

    private function formatDate(mixed $date): string
    {
        if (! $date) {
            return '';
        }

        return $date instanceof \DateTimeInterface
            ? $date->format('d.m.Y')
            : CarbonImmutable::parse($date)->format('d.m.Y');
    }

    private function filename(Contract $contract, CarbonImmutable $from, CarbonImmutable $to): string
    {
        $contractNumber = trim((string) $contract->contract_number) ?: 'Vertrag';
        $slug = trim(preg_replace('/[^A-Za-z0-9._-]+/', '_', $contractNumber) ?: '', '._-');

        return sprintf('Mietkonto_%s_%s_%s.pdf', $slug ?: 'Vertrag', $from->format('Ymd'), $to->format('Ymd'));
    }
}
