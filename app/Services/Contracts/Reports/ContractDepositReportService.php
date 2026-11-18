<?php

namespace App\Services\Contracts\Reports;

use App\Models\Contract;
use App\Models\ContractDeposit;
use App\Models\ContractDepositInstallment;
use App\Models\OpenItem;
use App\Services\Contracts\ContractDepositInterestCalculator;
use App\Services\Contracts\ContractDepositService;
use Carbon\CarbonImmutable;

final class ContractDepositReportService
{
    public function __construct(
        private readonly ContractDepositService $deposits,
        private readonly ContractDepositInterestCalculator $interest,
    ) {}

    /** Complete recorded financial ledger, optionally scoped to a period. Null start includes all recorded history. */
    public function build(Contract $contract, ?CarbonImmutable $from, CarbonImmutable $to): array
    {
        $deposit = ContractDeposit::query()->where('contract_id', $contract->id)
            ->with([
                'custodyBankAccount', 'interestRates', 'events',
                'installments.receivable.allocations.payment',
                'receivables.allocations.payment',
            ])->first();

        $summary = $deposit ? $this->deposits->readSummaryFromLoaded($deposit)
            : ['agreed' => 0, 'requested' => 0, 'paid' => 0, 'open' => 0,
                'available' => 0, 'refundOpen' => 0, 'refunded' => 0, 'retained' => 0,
                'remainingToAllocate' => 0, 'released' => 0];
        $rows = [];
        $include = static fn (?string $date): bool => $date !== null
            && ($from === null || $date >= $from->toDateString()) && $date <= $to->toDateString();

        if ($deposit) {
            foreach ($deposit->installments as $installment) {
                foreach ($installment->receivable?->allocations ?? [] as $allocation) {
                    if (! in_array($allocation->allocation_type, ['regular', 'partial', 'settlement'], true) || ! $allocation->payment
                        || $allocation->payment->direction !== 'credit'
                        || in_array($allocation->payment->status, ['cancelled', 'canceled'], true)) continue;
                    $date = $allocation->payment?->value_date?->toDateString()
                        ?? $allocation->payment?->booking_date?->toDateString();
                    if ($include($date)) $rows[] = [
                        'date' => $date, 'type' => 'Einzahlung',
                        'description' => 'Rate '.$installment->installment_number,
                        'reference' => $installment->receivable?->number,
                        'amount' => (float) $allocation->amount,
                    ];
                }
            }
            foreach ($deposit->receivables as $settlement) {
                if ($settlement->type === 'deposit_refund') {
                    foreach ($settlement->allocations as $allocation) {
                        if (! in_array($allocation->allocation_type, ['regular', 'partial', 'settlement'], true) || ! $allocation->payment
                            || $allocation->payment->direction !== 'debit'
                            || in_array($allocation->payment->status, ['cancelled', 'canceled'], true)) continue;
                        $date = $allocation->payment?->value_date?->toDateString()
                            ?? $allocation->payment?->booking_date?->toDateString();
                        if ($include($date)) $rows[] = [
                            'date' => $date, 'type' => 'Auszahlung',
                            'description' => $settlement->description,
                            'reference' => $settlement->number,
                            'amount' => -(float) $allocation->amount,
                        ];
                    }
                } elseif ($settlement->type === 'retention' && $include($settlement->due_date?->toDateString())) {
                    $rows[] = [
                        'date' => $settlement->due_date?->toDateString(), 'type' => 'Einbehalt (Reserve)',
                        'description' => $settlement->notes ?: $settlement->description,
                        'reference' => $settlement->number,
                        'amount' => -(float) $settlement->amount,
                    ];
                }
            }
            foreach ($deposit->events as $event) {
                $date = $event->effective_on?->toDateString();
                if (! $include($date)) continue;
                $rows[] = [
                    'date' => $date,
                    'type' => match ($event->event_type) {
                        'interest_credit' => 'Bankzinsgutschrift',
                        'retention_offset' => 'OP-Verrechnung',
                        'retention_release' => 'Reserve freigegeben',
                        default => 'Ereignis',
                    },
                    'description' => $event->notes ?: ($event->reference ?? ''),
                    'reference' => $event->reference,
                    'amount' => (float) $event->amount * ($event->event_type === 'retention_offset' ? -1 : 1),
                ];
            }
        }

        usort($rows, static fn (array $a, array $b): int => strcmp((string) $a['date'], (string) $b['date'])
            ?: strcmp($a['type'], $b['type']));

        return [
            'filename' => 'Kautionsreport-'.preg_replace('/[^a-zA-Z0-9_-]/', '-', $contract->contract_number).'.pdf',
            'contractLabel' => (string) $contract->contract_number,
            'period' => $from ? ['from' => $from->toDateString(), 'to' => $to->toDateString()] : null,
            'generatedOn' => CarbonImmutable::today()->toDateString(),
            'data' => $deposit ? [
                'status' => $summary['status'] ?? $deposit->status,
                'contractId' => (string) $contract->id,
                'agreedAmount' => (float) $deposit->agreed_amount,
                'currency' => $deposit->currency,
                'dueFrom' => $deposit->due_from?->toDateString(),
                'plannedRefundOn' => $deposit->planned_refund_on?->toDateString(),
                'custodyType' => $deposit->custody_type,
                'custodyAccountLabel' => $deposit->custodyBankAccount
                    ? trim($deposit->custodyBankAccount->account_holder.' · '.$deposit->custodyBankAccount->bank_name) : null,
                'segregatedOn' => $deposit->segregated_on?->toDateString(),
                'custodyEvidenceReference' => $deposit->custody_evidence_reference,
                'securityProvider' => $deposit->security_provider,
                'securityPolicyNumber' => $deposit->security_policy_number,
                'securityReceivedOn' => $deposit->security_received_on?->toDateString(),
                'securityValidUntil' => $deposit->security_valid_until?->toDateString(),
                'securityReleasedOn' => $deposit->security_released_on?->toDateString(),
                'securityEvidenceReference' => $deposit->security_evidence_reference,
                'reference' => $deposit->reference,
                'interestRates' => $deposit->interestRates->map(static fn ($rate): array => [
                    'effectiveFrom' => $rate->effective_from?->toDateString(),
                    'annualRatePercent' => (float) $rate->annual_rate_percent,
                    'reference' => $rate->reference,
                ])->all(),
                'interestProjection' => $this->interest->calculate($deposit, $to),
                'installments' => $deposit->installments->map(static fn (ContractDepositInstallment $row): array => [
                    'installmentNumber' => $row->installment_number,
                    'amount' => (float) $row->amount,
                    'openAmount' => (float) ($row->receivable?->open_amount ?? $row->amount),
                    'dueDate' => $row->due_date?->toDateString(),
                    'description' => 'Rate '.$row->installment_number,
                ])->all(),
                'settlements' => $deposit->receivables->map(static fn (OpenItem $row): array => [
                    'type' => $row->type, 'description' => $row->description,
                    'amount' => (float) $row->amount, 'openAmount' => (float) $row->open_amount,
                    'dueDate' => $row->due_date?->toDateString(),
                ])->all(),
            ] : [],
            'summary' => $summary,
            'movements' => $rows,
        ];
    }
}
