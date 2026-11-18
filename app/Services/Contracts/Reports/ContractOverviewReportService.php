<?php

namespace App\Services\Contracts\Reports;

use App\Models\BusinessPartnerBankAccount;
use App\Models\Contract;
use App\Models\ContractCondition;
use App\Models\ContractDeposit;
use App\Models\ContractParty;
use App\Models\ContractTermination;
use App\Models\DunningNotice;
use App\Models\OpenItem;
use App\Models\Payment;
use App\Models\PaymentAllocation;
use App\Models\Unit;
use App\Services\Contracts\ContractDepositService;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

class ContractOverviewReportService
{
    private const RENT_ALLOCATION_TYPES = ['regular', 'partial', 'settlement'];

    private const ACCOUNT_PREVIEW_LIMIT = 3;

    private const COMPONENTS = [
        'baseRentCents' => 'base_rent_amount',
        'garageCents' => 'garage_amount',
        'parkingCents' => 'parking_space_amount',
        'otherCents' => 'other_amount',
        'operatingCostsCents' => 'operating_cost_advance_amount',
        'heatingCostsCents' => 'heating_cost_advance_amount',
    ];

    private const BANK_COLUMNS = 'id,account_holder,iban,bank_name,valid_from,valid_until';

    public function __construct(
        private readonly ContractDepositService $deposits,
        private readonly ContractDepositReportService $depositReports,
    ) {}

    /**
     * Compact current account projection for contract detail. This deliberately does
     * not build the period report or hydrate its parties, notices or payment history.
     * Totals cover complete scopes; only the navigable booking preview is limited.
     *
     * @return array<string, mixed>
     */
    public function accountOverview(Contract $contract): array
    {
        $now = CarbonImmutable::now();
        $today = $now->startOfDay();
        $totals = $this->accountTotals($contract, $today);
        $rentItems = $contract->openItems()->rentDemands();
        $oldest = (clone $rentItems)->where('open_amount', '>', 0)
            ->where('due_date', '<', $today->toDateString())
            ->orderBy('due_date')->orderBy('number')->orderBy('id')
            ->first(['id', 'number', 'due_date']);
        $rows = (clone $rentItems)->orderByDesc('created_at')->orderByDesc('number')->orderByDesc('id')
            ->limit(self::ACCOUNT_PREVIEW_LIMIT)
            ->get(['id', 'number', 'description', 'service_month', 'due_date', 'amount', 'open_amount', 'status'])
            ->map(function (OpenItem $item) use ($today): array {
                $amount = $this->cents($item->amount);
                $open = $this->cents($item->open_amount);

                return [
                    'id' => (string) $item->id,
                    'number' => (string) $item->number,
                    'description' => $item->description,
                    'serviceMonth' => $item->service_month?->toDateString(),
                    'dueDate' => $item->due_date?->toDateString(),
                    'amountCents' => $amount,
                    'paidCents' => $amount - $open,
                    'openCents' => $open,
                    'status' => (string) $item->status,
                    'daysOverdue' => $open > 0 && $item->due_date?->lt($today)
                        ? (int) $item->due_date->diffInDays($today) : 0,
                ];
            })->all();
        $deposit = $contract->deposit()->first(['id', 'contract_id', 'agreed_amount', 'currency', 'custody_type', 'interest_amount']);

        return [
            'asOf' => $now->toIso8601String(),
            'asOfDate' => $today->toDateString(),
            'currency' => 'EUR',
            'rent' => [
                'openDebitCents' => $this->cents($totals->rent_open),
                'overdueDebitCents' => $this->cents($totals->rent_overdue),
                'openDebitCount' => (int) $totals->rent_open_count,
                'overdueDebitCount' => (int) $totals->rent_overdue_count,
                'maxDaysOverdue' => $oldest ? (int) $oldest->due_date->diffInDays($today) : 0,
                'oldestOverdueDueOn' => $oldest?->due_date?->toDateString(),
                'oldestOverdueOpenItemId' => $oldest ? (string) $oldest->id : null,
                'oldestOverdueOpenItemNumber' => $oldest ? (string) $oldest->number : null,
            ],
            'account' => [
                'openDebitCents' => $this->cents($totals->account_debit),
                'openCreditCents' => $this->cents($totals->account_credit),
                'netOpenCents' => $this->cents($totals->account_debit) - $this->cents($totals->account_credit),
                'overdueDebitCents' => $this->cents($totals->account_overdue),
                'notYetDueDebitCents' => $this->cents($totals->account_not_yet_due),
                'unknownDueDebitCents' => $this->cents($totals->account_unknown_due),
                'openDebitCount' => (int) $totals->account_open_count,
                'overdueDebitCount' => (int) $totals->account_overdue_count,
                'unknownDueDebitCount' => (int) $totals->account_unknown_due_count,
            ],
            'latestAllocatedPayment' => $this->latestAllocatedRentPayment($contract, $today),
            'preview' => [
                'rows' => $rows,
                'totalCount' => (int) $totals->rent_item_count,
                'hasMore' => (int) $totals->rent_item_count > count($rows),
            ],
            'deposit' => $deposit ? $this->accountDeposit($deposit) : null,
        ];
    }

    private function accountTotals(Contract $contract, CarbonImmutable $today): Contract
    {
        $openAccount = static fn (Builder $items): Builder => $items->contractAccount()->where('open_amount', '>', 0);
        $debit = static fn (Builder $items): Builder => $openAccount($items)->whereNotIn('type', OpenItem::PAYOUT_TYPES);
        $credit = static fn (Builder $items): Builder => $openAccount($items)->whereIn('type', OpenItem::PAYOUT_TYPES);
        $overdue = static fn (Builder $items): Builder => $debit($items)->where('due_date', '<', $today->toDateString());
        $unknownDue = static fn (Builder $items): Builder => $debit($items)->whereNull('due_date');
        $rent = static fn (Builder $items): Builder => $items->rentDemands();
        $openRent = static fn (Builder $items): Builder => $rent($items)->where('open_amount', '>', 0);
        $overdueRent = static fn (Builder $items): Builder => $openRent($items)->where('due_date', '<', $today->toDateString());

        return Contract::query()->select('contracts.id')
            ->withSum([
                'openItems as account_debit' => $debit,
                'openItems as account_credit' => $credit,
                'openItems as account_overdue' => $overdue,
                'openItems as account_not_yet_due' => static fn (Builder $items): Builder => $debit($items)->where('due_date', '>=', $today->toDateString()),
                'openItems as account_unknown_due' => $unknownDue,
                'openItems as rent_open' => $openRent,
                'openItems as rent_overdue' => $overdueRent,
            ], 'open_amount')
            ->withCount([
                'openItems as account_open_count' => $debit,
                'openItems as account_overdue_count' => $overdue,
                'openItems as account_unknown_due_count' => $unknownDue,
                'openItems as rent_open_count' => $openRent,
                'openItems as rent_overdue_count' => $overdueRent,
                'openItems as rent_item_count' => $rent,
            ])->findOrFail($contract->id);
    }

    private function latestAllocatedRentPayment(Contract $contract, CarbonImmutable $today): ?array
    {
        $eligible = static fn (Builder $allocations): Builder => $allocations
            ->whereIn('allocation_type', self::RENT_ALLOCATION_TYPES)
            ->where('amount', '>', 0)
            ->whereHas('openItem', static fn (Builder $items): Builder => $items
                ->where('contract_id', $contract->id)->rentDemands());
        $payments = Payment::query()->where('direction', 'credit')->where('amount', '>', 0)
            ->whereNotIn('status', ['cancelled', 'canceled'])->whereHas('allocations', $eligible);
        $columns = ['id', 'number', 'booking_date', 'value_date', 'amount'];
        $nextDay = $today->addDay()->toDateString();

        // Two bounded candidates preserve value-date fallback without a raw COALESCE
        // expression or loading and sorting the contract's entire payment history.
        // The exclusive next-day bound also includes today's midnight values on
        // SQLite installations that persist Eloquent date casts with a time suffix.
        $withValueDate = (clone $payments)->whereNotNull('value_date')->where('value_date', '<', $nextDay)
            ->orderByDesc('value_date')->orderByDesc('booking_date')->orderByDesc('id')->first($columns);
        $withBookingDate = (clone $payments)->whereNull('value_date')->where('booking_date', '<', $nextDay)
            ->orderByDesc('booking_date')->orderByDesc('id')->first($columns);
        $payment = collect([$withValueDate, $withBookingDate])->filter()
            ->sortByDesc(static fn (Payment $payment): string => ($payment->value_date ?? $payment->booking_date)->toDateString()
                .'|'.($payment->booking_date?->toDateString() ?? '').'|'.$payment->id)->first();
        if (! $payment) {
            return null;
        }

        $allocations = $eligible(PaymentAllocation::query()->where('payment_id', $payment->id));
        $allocatedAmount = $this->cents((clone $allocations)->sum('amount'));
        $targetCount = (int) (clone $allocations)->distinct()->count('receivable_id');
        if ($allocatedAmount <= 0 || $targetCount === 0) {
            return null;
        }
        $target = $targetCount === 1 ? OpenItem::query()->where('contract_id', $contract->id)->rentDemands()
            ->whereIn('id', (clone $allocations)->select('receivable_id'))
            ->first(['id', 'number', 'description', 'service_month']) : null;

        return [
            'paymentId' => (string) $payment->id,
            'paymentNumber' => (string) $payment->number,
            'paidOn' => ($payment->value_date ?? $payment->booking_date)->toDateString(),
            'allocatedAmountCents' => $allocatedAmount,
            'paymentAmountCents' => $this->cents($payment->amount),
            'allocatedOpenItemCount' => $targetCount,
            'openItemId' => $target ? (string) $target->id : null,
            'openItemNumber' => $target ? (string) $target->number : null,
            'description' => $target?->description,
            'serviceMonth' => $target?->service_month?->toDateString(),
        ];
    }

    private function accountDeposit(ContractDeposit $deposit): array
    {
        $summary = $this->deposits->readSummary($deposit);
        $result = [
            'currency' => (string) $deposit->currency,
            'bookingCurrency' => 'EUR',
            'status' => $summary['status'],
            'custodyType' => $deposit->custody_type,
        ];
        foreach (['agreed', 'requested', 'paid', 'open', 'available', 'remainingToAllocate', 'refundCommitted', 'refundOpen', 'refunded', 'retained'] as $key) {
            $result[$key.'Cents'] = $this->cents($summary[$key]);
        }

        return $result;
    }

    /**
     * The date range selects due rent/advance items for payment observations.
     * Contract data and open balances always describe the current stored state.
     * This read operation never refreshes deposits, generates obligations, or assigns payments.
     *
     * @return array<string, mixed>
     */
    /** Immutable read projection of all recorded contract activity at generation time. */
    public function build(Contract $contract, string $opDetails = 'exceptions'): array
    {
        if (! in_array($opDetails, ['exceptions', 'last12', 'last24', 'all'], true)) {
            throw new \InvalidArgumentException('Unsupported OP detail scope.');
        }
        $now = CarbonImmutable::now();
        $today = $now->startOfDay();
        $contract = $this->loadContract($contract);
        $warnings = [];
        $unit = $contract->mainUnit;
        if (! $unit && $contract->units->count() === 1) {
            $unit = Unit::query()->with('property.settlementBankAccount')->find($contract->units->first()->unit_id);
        }
        $assignment = $unit ? $contract->units->firstWhere('unit_id', $unit->id) : null;
        if ($contract->units->count() > 1 || ($unit && ! $assignment)) {
            $warnings[] = ['code' => 'ambiguous_unit_assignment', 'message' => 'Die zeitliche Einheitenzuordnung ist nicht eindeutig. Finanzdaten sind ausschließlich nach diesem Vertrag abgegrenzt.'];
        }
        if (! $unit) {
            $warnings[] = ['code' => 'missing_unit', 'message' => 'Für diesen Vertrag ist keine verfügbare Einheit hinterlegt.'];
        }
        $property = $unit?->property;

        // Query the entire active/cancelled OP cohort, including already settled years.
        // Never fabricate missing monthly obligations from agreed conditions.
        $items = $this->accountItems($contract);
        $openItems = $this->openItems($items, $today);
        if ($openItems['summary']['unknownDueDebitCents'] > 0) {
            $warnings[] = ['code' => 'missing_due_date', 'message' => 'Offene Forderungen ohne Fälligkeit sind im Saldo enthalten; ein Verzug ist für sie nicht bestimmbar.'];
        }
        $behavior = $this->paymentBehavior($items, $today);
        $recurringPayments = $this->recurringPaymentInsights($items, $behavior, $today);
        if ($behavior['summary']['unverifiableCount'] > 0) {
            $warnings[] = ['code' => 'incomplete_payment_evidence', 'message' => 'Für '.$behavior['summary']['unverifiableCount'].' Sollstellungen fehlt ein vollständig mit datierten Zahlungseingängen belegbarer Ausgleich. Sie werden nicht als pünktlich bewertet.'];
        }
        $conditions = $this->conditions($contract, $today, $warnings);
        $currentRent = $this->currentRent($conditions);
        $deposit = $this->deposit($contract->deposit);
        $depositLedger = $contract->deposit ? $this->depositLedger($contract, $today) : null;
        if ($depositLedger && $depositLedger['summary']['unverifiedReceiptCents'] > 0) {
            $warnings[] = [
                'code' => 'deposit_receipt_not_documented',
                'message' => 'Als ausgeglichen erfasste Kaution ohne vollständig zugeordneten, datierten Zahlungseingang: '
                    .number_format($depositLedger['summary']['unverifiedReceiptCents'] / 100, 2, ',', '.')
                    .' EUR. Der OP-Status ist kein Einzahlungsbeleg.',
            ];
        }
        if ($deposit && $deposit['currency'] !== 'EUR') {
            $warnings[] = ['code' => 'deposit_currency_difference', 'message' => 'Die Kautionsvereinbarung hat eine von EUR abweichende Währung. OP-Zahlungen sind in EUR erfasst; es wird kein fiktiver Wechselkurs verwendet.'];
        }

        $banks = [];
        foreach ([
            ['receiving', 'Zahlungsempfängerkonto des Objekts', $property?->settlementBankAccount],
            ['refund', 'Gutschrift- und Auszahlungskonto des Vertrags', $contract->refundBankAccount],
            ['custody', 'Verwahrkonto der Kaution', $contract->deposit?->custodyBankAccount],
        ] as [$role, $label, $account]) {
            if ($account) {
                $banks[] = $this->bank($account, $role, $label, $today);
            }
        }

        return [
            'title' => 'Vertragsreport',
            'basis' => 'contract_overview',
            'scope' => 'full_contract_lifecycle_current_snapshot',
            'generatedAt' => $now->toIso8601String(),
            'snapshotDate' => $today->toDateString(),
            'contract' => $this->contractData($contract),
            'property' => $property ? [
                'id' => (string) $property->id,
                'number' => (string) $property->property_number,
                'name' => (string) $property->name,
                'address' => (string) $property->full_address,
            ] : null,
            'unit' => $unit ? [
                'number' => (string) $unit->unit_number,
                'type' => (string) $unit->unit_type,
                'typeLabel' => $this->unitTypeLabel((string) $unit->unit_type),
                'validFrom' => $assignment?->valid_from?->toDateString(),
                'validUntil' => $assignment?->valid_until?->toDateString(),
            ] : null,
            'parties' => $this->parties($contract, $today),
            'bankAccounts' => $banks,
            'conditions' => $conditions,
            'currentRent' => $currentRent,
            'deposit' => $deposit,
            'depositLedger' => $depositLedger,
            'currentOpenItems' => $openItems,
            'paymentBehavior' => $behavior,
            'recurringPayments' => $recurringPayments,
            'itemLedger' => $this->itemLedger($items, $behavior, $today, $opDetails),
            'operatingCosts' => $this->operatingCosts($items, $today),
            'dunning' => $this->dunning($contract),
            'warnings' => $warnings,
            'filename' => 'Vertragsreport-'.preg_replace('/[^A-Za-z0-9_-]/', '-', (string) $contract->contract_number).'-Stand-'.$today->toDateString().'.pdf',
        ];
    }

    private function loadContract(Contract $contract): Contract
    {
        return Contract::query()->with([
            'mainUnit:id,property_id,unit_number,unit_type',
            'mainUnit.property:id,property_number,name,address,postal_code,city,settlement_bank_account_id',
            'mainUnit.property.settlementBankAccount:'.self::BANK_COLUMNS,
            'units:id,contract_id,unit_id,valid_from,valid_until',
            'parties:id,contract_id,business_partner_id,party_role,valid_from,valid_until',
            'parties.businessPartnerSummary:id,display_name',
            'conditions' => fn ($query) => $query->select([
                'id', 'contract_id', 'valid_from', 'valid_until', 'payment_interval', 'change_reason', ...array_values(self::COMPONENTS),
            ])->orderBy('valid_from'),
            'terminations:id,contract_id,termination_type,initiated_by,reason_type,received_on,requested_end_on,system_determined_end_on,confirmed_end_on,created_at',
            'deposit:id,contract_id,agreed_amount,currency,status,custody_type,custody_bank_account_id,segregated_on,due_from,installment_count,installment_amount,interest_amount,planned_refund_on,refunded_on,refunded_amount,retained_amount',
            'deposit.custodyBankAccount:'.self::BANK_COLUMNS,
            'refundBankAccount:'.self::BANK_COLUMNS,
        ])->findOrFail($contract->getKey());
    }

    private function contractData(Contract $contract): array
    {
        $termination = $contract->terminations->sortByDesc('created_at')->first();
        $terminationLabels = array_column(ContractTermination::typeOptions(), 'label', 'value');
        $initiatorLabels = array_column(ContractTermination::initiatorOptions(), 'label', 'value');
        $reasonLabels = array_column(ContractTermination::reasonTypeOptions(), 'label', 'value');

        return [
            'id' => (string) $contract->id,
            'number' => (string) $contract->contract_number,
            'type' => (string) $contract->contract_type,
            'typeLabel' => match ($contract->contract_type) {
                'residential_lease' => 'Wohnraummiete', 'commercial_lease' => 'Gewerberaummiete',
                'garage_lease' => 'Garagenmiete', 'parking_lease' => 'Stellplatzmiete',
                'mixed_lease' => 'Mischmietvertrag', default => 'Sonstige Miete',
            },
            'status' => (string) $contract->status,
            'statusLabel' => match ($contract->status) {
                'draft' => 'Entwurf', 'signature_pending' => 'Zur Unterschrift', 'active' => 'Aktiv',
                'ended' => 'Beendet', 'cancelled' => 'Storniert', 'archived' => 'Archiviert', default => 'Unbekannt',
            },
            'concludedOn' => $contract->concluded_on?->toDateString(),
            'startsOn' => $contract->starts_on?->toDateString(),
            'confirmedEndOn' => $contract->confirmed_end_on?->toDateString(),
            'termType' => (string) $contract->term_type,
            'termTypeLabel' => $contract->term_type === 'fixed' ? 'Befristet' : 'Unbefristet',
            'minimumTermMonths' => $contract->minimum_term_months,
            'noticePeriodMonths' => $contract->notice_period_months,
            'rentAdjustmentModel' => (string) $contract->rent_adjustment_model,
            'rentAdjustmentModelLabel' => match ($contract->rent_adjustment_model) {
                'none' => 'Keine automatische Anpassung', 'stepped_rent' => 'Staffelmiete',
                'index_rent' => 'Indexmiete', 'free_agreement' => 'Freie Vereinbarung',
                'not_applicable' => 'Nicht anwendbar', default => 'Nicht angegeben',
            },
            'handedOverAt' => $contract->handed_over_at?->toDateString(),
            'returnedAt' => $contract->returned_at?->toDateString(),
            'termination' => $termination ? [
                'typeLabel' => $terminationLabels[$termination->termination_type] ?? 'Sonstige Beendigung',
                'initiatedByLabel' => $initiatorLabels[$termination->initiated_by] ?? 'Nicht hinterlegt',
                'reasonLabel' => $reasonLabels[$termination->reason_type] ?? 'Nicht hinterlegt',
                'systemDeterminedEndOn' => $termination->system_determined_end_on?->toDateString(),
                'receivedOn' => $termination->received_on?->toDateString(),
                'requestedEndOn' => $termination->requested_end_on?->toDateString(),
                'confirmedEndOn' => $termination->confirmed_end_on?->toDateString(),
            ] : null,
        ];
    }

    private function parties(Contract $contract, CarbonImmutable $today): array
    {
        $labels = array_column(ContractParty::roleOptions(), 'label', 'value');

        return $contract->parties->sortBy(fn (ContractParty $party): string => ($party->valid_from?->toDateString() ?? '').'|'.$party->party_role)
            ->map(fn (ContractParty $party): array => [
                'name' => (string) ($party->businessPartnerSummary?->display_name ?? 'Nicht verfügbar'),
                'role' => (string) $party->party_role,
                'roleLabel' => $labels[$party->party_role] ?? 'Vertragspartei',
                'validFrom' => $party->valid_from?->toDateString(),
                'validUntil' => $party->valid_until?->toDateString(),
                'isCurrent' => $this->isCurrent($party->valid_from, $party->valid_until, $today),
            ])->values()->all();
    }

    private function bank(BusinessPartnerBankAccount $account, string $role, string $label, CarbonImmutable $today): array
    {
        $iban = preg_replace('/\s+/', '', (string) $account->iban) ?? '';
        $masked = strlen($iban) > 6 ? substr($iban, 0, 2).' •••• '.substr($iban, -4) : ($iban !== '' ? '••••' : '');

        return [
            'role' => $role,
            'label' => $label,
            'accountHolder' => (string) $account->account_holder,
            'bankName' => (string) ($account->bank_name ?? ''),
            'iban' => $masked,
            'bic' => null,
            'masked' => true,
            'validFrom' => $account->valid_from?->toDateString(),
            'validUntil' => $account->valid_until?->toDateString(),
            'isCurrent' => $this->isCurrent($account->valid_from, $account->valid_until, $today),
        ];
    }

    private function conditions(Contract $contract, CarbonImmutable $today, array &$warnings): array
    {
        $intervalLabels = array_column(ContractCondition::paymentIntervalOptions(), 'label', 'value');
        $reasonLabels = array_column(ContractCondition::changeReasonOptions(), 'label', 'value');
        $previousEnd = null;
        $seen = false;
        $rows = [];

        foreach ($contract->conditions as $condition) {
            if ($seen && (! $previousEnd || ! $condition->valid_from || $condition->valid_from->lte($previousEnd))) {
                $warnings['condition_overlap'] = ['code' => 'condition_overlap', 'message' => 'Konditionsfassungen überschneiden sich. Die Übersicht zeigt gespeicherte Vereinbarungen; daraus wird kein neues Mietsoll berechnet.'];
            }
            $previousEnd = $condition->valid_until;
            $seen = true;
            $amounts = [];
            foreach (self::COMPONENTS as $key => $field) {
                $amounts[$key] = $this->cents($condition->getRawOriginal($field));
            }
            $amounts['coldRentCents'] = $amounts['baseRentCents'] + $amounts['garageCents'] + $amounts['parkingCents'] + $amounts['otherCents'];
            $amounts['serviceChargesCents'] = $amounts['operatingCostsCents'] + $amounts['heatingCostsCents'];
            $amounts['totalCents'] = $amounts['coldRentCents'] + $amounts['serviceChargesCents'];

            $months = ContractCondition::RECURRING_INTERVAL_MONTHS[(string) $condition->payment_interval] ?? null;
            // Recurring equivalents are display rates, never generated OPs or historical cash receipts.
            $normalized = $months ? $this->conditionEquivalents($amounts, $months) : null;

            $rows[] = [
                'normalized' => $normalized,
                'validFrom' => $condition->valid_from?->toDateString(),
                'validUntil' => $condition->valid_until?->toDateString(),
                'paymentInterval' => (string) $condition->payment_interval,
                'paymentIntervalLabel' => $intervalLabels[$condition->payment_interval] ?? 'Unbekannt',
                'changeReason' => (string) $condition->change_reason,
                'changeReasonLabel' => $reasonLabels[$condition->change_reason] ?? 'Nicht angegeben',
                'state' => $condition->valid_from?->gt($today) ? 'planned' : (($condition->valid_until?->lt($today)) ? 'past' : 'current'),
                'amounts' => $amounts,
            ];
        }
        $warnings = array_values($warnings);

        return $rows;
    }

    private function deposit(?ContractDeposit $deposit): ?array
    {
        if (! $deposit) {
            return null;
        }
        // ContractDepositService::summary() writes refreshed state; only project the recorded agreement here.
        $statuses = array_column(ContractDeposit::statusOptions(), 'label', 'value');
        $custody = array_column(ContractDeposit::custodyTypeOptions(), 'label', 'value');

        return [
            'agreedCents' => $this->cents($deposit->agreed_amount),
            'currency' => (string) $deposit->currency,
            'status' => (string) $deposit->status,
            'statusLabel' => $statuses[$deposit->status] ?? 'Nicht angegeben',
            'custodyType' => $deposit->custody_type,
            'custodyTypeLabel' => $custody[$deposit->custody_type] ?? 'Nicht angegeben',
            'segregatedOn' => $deposit->segregated_on?->toDateString(),
            'dueFrom' => $deposit->due_from?->toDateString(),
            'installmentCount' => (int) $deposit->installment_count,
            'installmentAmountCents' => $this->cents($deposit->installment_amount),
            'interestCents' => $this->cents($deposit->interest_amount),
            'plannedRefundOn' => $deposit->planned_refund_on?->toDateString(),
            'refundedOn' => $deposit->refunded_on?->toDateString(),
            'recordedRefundedCents' => $this->cents($deposit->refunded_amount),
            'recordedRetainedCents' => $this->cents($deposit->retained_amount),
        ];
    }

    /** Exact annual rates and separately rounded monthly display values for recurring intervals. */
    private function conditionEquivalents(array $amounts, int $months): array
    {
        $monthly = [];
        $yearly = [];
        foreach (array_keys(self::COMPONENTS) as $field) {
            $monthly[$field] = (int) round($amounts[$field] / $months, 0, PHP_ROUND_HALF_UP);
            $yearly[$field] = intdiv($amounts[$field] * 12, $months);
        }
        $totals = static function (array $period): array {
            $period['coldRentCents'] = $period['baseRentCents'] + $period['garageCents']
                + $period['parkingCents'] + $period['otherCents'];
            $period['serviceChargesCents'] = $period['operatingCostsCents'] + $period['heatingCostsCents'];
            $period['totalCents'] = $period['coldRentCents'] + $period['serviceChargesCents'];

            return $period;
        };

        return ['monthly' => $totals($monthly), 'yearly' => $totals($yearly)];
    }

    private function currentRent(array $conditions): ?array
    {
        $current = collect($conditions)->firstWhere('state', 'current');
        if (! $current) {
            return null;
        }

        return [
            'validFrom' => $current['validFrom'],
            'validUntil' => $current['validUntil'],
            'paymentIntervalLabel' => $current['paymentIntervalLabel'],
            'monthly' => $current['normalized']['monthly'] ?? null,
            'yearly' => $current['normalized']['yearly'] ?? null,
        ];
    }

    /** Reuse the canonical deposit financial ledger; expose no free-text notes or full IBAN. */
    private function depositLedger(Contract $contract, CarbonImmutable $today): array
    {
        $ledger = $this->depositReports->build($contract, null, $today);
        $summary = [];
        foreach ([
            'agreed', 'requested', 'paid', 'open', 'available', 'refundCommitted',
            'refundOpen', 'refunded', 'retained', 'offset', 'released',
            'remainingToAllocate', 'remainingToRefund',
        ] as $key) {
            $summary[$key.'Cents'] = $this->cents($ledger['summary'][$key] ?? 0);
        }
        $movements = array_map(function (array $movement): array {
            $type = (string) $movement['type'];
            return [
                'date' => (string) $movement['date'],
                'type' => $type,
                'reference' => (string) ($movement['reference'] ?? ''),
                'amountCents' => $this->cents($movement['amount']),
                'kind' => match ($type) {
                    'Einzahlung', 'Auszahlung' => 'payment',
                    'Bankzinsgutschrift' => 'interest',
                    'Einbehalt (Reserve)' => 'reserve',
                    default => 'internal_settlement',
                },
            ];
        }, $ledger['movements']);
        $summary['actualIncomingCents'] = array_sum(array_map(static fn (array $movement): int =>
            $movement['type'] === 'Einzahlung' ? $movement['amountCents'] : 0, $movements));
        $summary['actualOutgoingCents'] = -array_sum(array_map(static fn (array $movement): int =>
            $movement['type'] === 'Auszahlung' ? $movement['amountCents'] : 0, $movements));
        $summary['unverifiedReceiptCents'] = max(0, $summary['paidCents'] - $summary['actualIncomingCents']);

        return ['bookingCurrency' => 'EUR', 'summary' => $summary, 'movements' => $movements];
    }

    /** Only live, correctly directed, dated allocations prove a cash movement. */
    private function paymentMovement(PaymentAllocation $allocation, OpenItem $item, CarbonImmutable $today): array
    {
        $payment = $allocation->payment;
        $effectiveDate = $payment?->value_date ?? $payment?->booking_date;
        $credit = $item->isPayoutLike();
        $effective = $payment !== null
            && ! in_array($payment->status, ['cancelled', 'canceled'], true)
            && $payment->direction === ($credit ? 'debit' : 'credit')
            && in_array($allocation->allocation_type, self::RENT_ALLOCATION_TYPES, true)
            && $effectiveDate !== null && $effectiveDate->lte($today);

        return [
            'date' => $effectiveDate?->toDateString(),
            'paymentNumber' => (string) ($payment?->number ?? ''),
            'dateBasis' => $payment?->value_date ? 'Wertstellung' : 'Buchung',
            'direction' => (string) ($payment?->direction ?? ''),
            'allocationType' => (string) $allocation->allocation_type,
            'amountCents' => $this->cents($allocation->amount),
            'isVerifiedCash' => $effective,
            'label' => $allocation->allocation_type === 'overpayment' ? 'Überzahlung (nicht OP-Ausgleich)'
                : ($effective ? ($credit ? 'Auszahlung' : 'Einzahlung') : 'Keine belegbare Zahlung'),
        ];
    }

    /** Complete OP audit surface, including credits, deposit rows and cancelled rows. */
    private function itemLedger(Collection $items, array $behavior, CarbonImmutable $today, string $detailScope): array
    {
        $assessments = collect($behavior['rows'])->keyBy('number');
        $summary = [
            'activeCount' => 0, 'cancelledCount' => 0, 'paidCount' => 0,
            'partialCount' => 0, 'openCount' => 0, 'cashMismatchCount' => 0,
        ];
        $rows = [];
        $exceptions = 0;
        $exceptionOutsideWindowCount = 0;
        $visibleExceptions = 0;
        $windowStart = match ($detailScope) {
            'last12' => $today->startOfMonth()->subMonthsNoOverflow(11),
            'last24' => $today->startOfMonth()->subMonthsNoOverflow(23),
            default => null,
        };
        foreach ($items as $item) {
            $cancelled = in_array($item->status, ['cancelled', 'canceled'], true);
            $credit = $item->isPayoutLike();
            $amount = $this->cents($item->amount);
            $open = $this->cents($item->open_amount);
            $movements = $item->allocations->map(fn (PaymentAllocation $allocation): array => $this->paymentMovement($allocation, $item, $today))
                ->sortBy('date')->values()->all();
            $cash = array_sum(array_column(array_filter($movements, static fn (array $movement): bool => $movement['isVerifiedCash']), 'amountCents'));
            $assessment = $assessments->get((string) $item->number);
            $state = $cancelled ? 'Storniert'
                : ($credit ? 'Gutschrift / Auszahlung'
                    : ($item->type === 'retention' ? 'Kautionsreserve (kein Eingang)'
                        : (! $item->due_date ? 'Fälligkeit fehlt'
                            : ($item->due_date->gt($today) ? 'Noch nicht fällig'
                                : match ($assessment['state'] ?? '') {
                                    'on_time' => 'Pünktlich bezahlt',
                                    'late' => 'Verspätet bezahlt',
                                    'unverifiable' => 'Ausgleich nicht belegbar',
                                    default => 'Offen',
                                }))));
            if ($cancelled) {
                $summary['cancelledCount']++;
            } else {
                $summary['activeCount']++;
                $summary[$open === 0 ? 'paidCount' : ($open < $amount ? 'partialCount' : 'openCount')]++;
                if ($amount - $open !== $cash) {
                    $summary['cashMismatchCount']++;
                }
            }

            $isException = $cancelled || $open > 0
                || ! $item->due_date
                || in_array($assessment['state'] ?? '', ['late', 'unverifiable'], true)
                || ($amount - $open !== $cash && $item->type !== 'retention');
            $exceptions += (int) $isException;
            $referenceDate = $item->due_date ?? $item->service_month;
            $inWindow = $windowStart === null || ($referenceDate !== null
                && $referenceDate->betweenIncluded($windowStart, $today));
            $isShown = $detailScope === 'all' || $isException || ($detailScope !== 'exceptions' && $inWindow);
            if (! $isShown) {
                continue;
            }
            $visibleExceptions += (int) $isException;
            if ($isException && $windowStart !== null && ! $inWindow) {
                $exceptionOutsideWindowCount++;
            }

            $sign = $credit ? -1 : 1;
            $rows[] = [
                'id' => (string) $item->id,
                'number' => (string) $item->number,
                'type' => (string) $item->type,
                'costAreaLabel' => OpenItem::costAreaLabel($item->cost_area),
                'serviceMonth' => $item->service_month?->toDateString(),
                'dueDate' => $item->due_date?->toDateString(),
                'state' => $state,
                'cancelled' => $cancelled,
                'direction' => $credit ? 'credit' : 'debit',
                'amountCents' => $sign * $amount,
                'coveredCents' => $sign * ($amount - $open),
                'cashCents' => $sign * $cash,
                'openCents' => $sign * $open,
                'movements' => $movements,
            ];
        }

        return [
            'summary' => $summary,
            'detailScope' => $detailScope,
            'detailScopeLabel' => match ($detailScope) {
                'exceptions' => 'Nur Auffälligkeiten und offene OP',
                'last12' => 'Letzte 12 Monate plus alle Auffälligkeiten',
                'last24' => 'Letzte 24 Monate plus alle Auffälligkeiten',
                default => 'Alle OP-Einzelbelege',
            },
            'windowFrom' => $windowStart?->toDateString(),
            'totalCount' => $summary['activeCount'] + $summary['cancelledCount'],
            'visibleCount' => count($rows),
            'omittedCount' => $summary['activeCount'] + $summary['cancelledCount'] - count($rows),
            'exceptionCount' => $exceptions,
            'visibleExceptionCount' => $visibleExceptions,
            'exceptionOutsideWindowCount' => $exceptionOutsideWindowCount,
            'rows' => $rows,
        ];
    }

    /**
     * Compact 12-month rent/advance status timeline. The lifetime cohort and
     * punctuality calculation are independent of the chosen OP-detail window.
     * Each segment counts obligations, not bank transfers or calendar-month cash.
     */
    private function recurringPaymentInsights(Collection $items, array $behavior, CarbonImmutable $today): array
    {
        $states = collect($behavior['rows'])->keyBy('number');
        $start = $today->startOfMonth()->subMonthsNoOverflow(11);
        $empty = ['dueCount' => 0, 'onTimeCount' => 0, 'lateCount' => 0,
            'openCount' => 0, 'unverifiableCount' => 0, 'dueCents' => 0];
        $months = [];
        for ($month = $start; $month->lte($today); $month = $month->addMonth()) {
            $key = $month->format('Y-m');
            $months[$key] = ['month' => $key, 'label' => $month->format('m/y'), ...$empty];
        }
        $summary = $empty;
        $summary['futureDueCount'] = 0;
        $summary['missingDueCount'] = 0;

        foreach ($items as $item) {
            if (! in_array($item->type, ['rent', 'advance'], true)
                || $item->cost_area === 'deposit'
                || in_array($item->status, ['cancelled', 'canceled'], true)) {
                continue;
            }
            if (! $item->due_date) {
                $summary['missingDueCount']++;
                continue;
            }
            if ($item->due_date->gt($today)) {
                $summary['futureDueCount']++;
                continue;
            }
            $observation = $states->get((string) $item->number);
            if (! $observation) {
                continue;
            }
            $state = in_array($observation['state'], ['on_time', 'late', 'open'], true)
                ? $observation['state'] : 'unverifiable';
            $field = $state === 'on_time' ? 'onTimeCount' : ($state === 'late'
                ? 'lateCount' : ($state === 'open' ? 'openCount' : 'unverifiableCount'));
            $summary['dueCount']++;
            $summary[$field]++;
            $summary['dueCents'] += $this->cents($item->amount);
            $key = $item->due_date->format('Y-m');
            if (isset($months[$key])) {
                $months[$key]['dueCount']++;
                $months[$key][$field]++;
                $months[$key]['dueCents'] += $this->cents($item->amount);
            }
        }
        $summary['onTimeAllDuePercent'] = $summary['dueCount'] > 0
            ? round(100 * $summary['onTimeCount'] / $summary['dueCount'], 1) : null;

        return [
            'basis' => 'recurring_rent_and_advance_due_months',
            'scope' => 'complete_lifetime_with_12_month_trend',
            'trendFrom' => $start->toDateString(),
            'trendThrough' => $today->toDateString(),
            'summary' => $summary,
            'months' => array_values($months),
        ];
    }

    /** Posted ancillary OPs by service year; only linked real money is labelled received/paid out. */
    private function operatingCosts(Collection $items, CarbonImmutable $today): array
    {
        $fields = [
            'advanceDueCents', 'advanceReceivedCents', 'advanceOpenCents',
            'settlementDueCents', 'settlementReceivedCents', 'settlementOpenCents',
            'creditDueCents', 'creditPaidOutCents', 'creditOpenCents',
        ];
        $empty = array_fill_keys($fields, 0);
        $years = [];
        foreach ($items as $item) {
            if (in_array($item->status, ['cancelled', 'canceled'], true)) {
                continue;
            }
            $isAdvance = $item->type === 'advance' && in_array($item->cost_area, ['operating_costs', 'heating_costs', 'operating_and_heating'], true);
            // Only operating/heating settlements belong to the ancillary ledger;
            // other manual credit/settlement cost areas remain visible in the full OP journal.
            $isAncillarySettlement = in_array($item->cost_area, ['settlement', 'operating_costs', 'heating_costs', 'operating_and_heating'], true);
            $isCharge = $item->type === 'settlement' && $isAncillarySettlement;
            $isCredit = $item->type === 'settlement_credit' && $isAncillarySettlement;
            if (! ($isAdvance || $isCharge || $isCredit)) {
                continue;
            }

            // A payment posted the next calendar year still belongs to its original service-year OP.
            $year = ($item->service_month ?? $item->due_date)?->format('Y') ?? 'Ohne Datum';
            $years[$year] ??= ['year' => $year, ...$empty];
            $prefix = $isAdvance ? 'advance' : ($isCharge ? 'settlement' : 'credit');
            $paidCash = $item->allocations->sum(function (PaymentAllocation $allocation) use ($item, $today): int {
                $movement = $this->paymentMovement($allocation, $item, $today);
                return $movement['isVerifiedCash'] ? $movement['amountCents'] : 0;
            });
            $years[$year][$prefix.'DueCents'] += $this->cents($item->amount);
            $years[$year][$prefix.($isCredit ? 'PaidOutCents' : 'ReceivedCents')] += $paidCash;
            $years[$year][$prefix.'OpenCents'] += $this->cents($item->open_amount);
        }
        ksort($years);
        $totals = $empty;
        foreach ($years as $year) {
            foreach ($fields as $field) {
                $totals[$field] += $year[$field];
            }
        }

        return ['rows' => array_values($years), 'totals' => $totals];
    }

    /** @return Collection<int, OpenItem> */
    /** Every existing contract OP, paid or unpaid, including cancelled audit rows. */
    private function accountItems(Contract $contract): Collection
    {
        return OpenItem::query()->where('contract_id', $contract->id)
            ->with([
                'allocations:id,receivable_id,payment_id,amount,allocation_type',
                'allocations.payment:id,number,booking_date,value_date,direction,status',
            ])
            ->orderBy('due_date')->orderBy('number')
            ->get(['id', 'contract_id', 'number', 'type', 'cost_area', 'service_month', 'due_date', 'amount', 'open_amount', 'status']);
    }

    private function openItems(Collection $items, CarbonImmutable $today): array
    {
        $summary = [
            'count' => 0, 'openDebitCents' => 0, 'openCreditCents' => 0, 'netOpenCents' => 0,
            'overdueDebitCents' => 0, 'notYetDueDebitCents' => 0, 'unknownDueDebitCents' => 0, 'depositOpenDebitCents' => 0,
        ];
        $rows = [];
        foreach ($items as $item) {
            $open = $this->cents($item->open_amount);
            if (in_array($item->status, ['cancelled', 'canceled'], true) || $open <= 0) {
                continue;
            }
            $credit = $item->isPayoutLike();
            $overdue = ! $credit && $item->due_date && $item->due_date->lt($today);
            $summary['count']++;
            $summary[$credit ? 'openCreditCents' : 'openDebitCents'] += $open;
            if (! $credit) {
                $summary[! $item->due_date ? 'unknownDueDebitCents' : ($overdue ? 'overdueDebitCents' : 'notYetDueDebitCents')] += $open;
                if ($item->cost_area === 'deposit' || in_array($item->type, ['deposit', 'deposit_installment', 'retention'], true)) {
                    $summary['depositOpenDebitCents'] += $open;
                }
            }
            $rows[] = [
                'number' => (string) $item->number,
                'type' => (string) $item->type,
                'costArea' => (string) $item->cost_area,
                'costAreaLabel' => OpenItem::costAreaLabel($item->cost_area),
                'serviceMonth' => $item->service_month?->toDateString(),
                'dueDate' => $item->due_date?->toDateString(),
                'amountCents' => $this->cents($item->amount),
                'openCents' => $open,
                'direction' => $credit ? 'credit' : 'debit',
                'daysOverdue' => $overdue ? (int) $item->due_date->diffInDays($today) : 0,
            ];
        }
        $summary['netOpenCents'] = $summary['openDebitCents'] - $summary['openCreditCents'];

        return ['asOf' => $today->toDateString(), 'summary' => $summary, 'rows' => $rows];
    }

    private function paymentBehavior(Collection $items, CarbonImmutable $today): array
    {
        $summary = [
            'dueCount' => 0, 'verifiableSettledCount' => 0, 'onTimeCount' => 0, 'lateCount' => 0,
            'openCount' => 0, 'overdueOpenCount' => 0, 'unverifiableCount' => 0,
            'futureDueCount' => 0, 'missingDueCount' => 0,
            'onTimeSharePercent' => null, 'onTimeAllDuePercent' => null, 'medianSettlementDelayDays' => null, 'maxSettlementDelayDays' => null,
        ];
        $rows = [];
        $delays = [];
        foreach ($items as $item) {
            // Credits, refunds and reserve liabilities are visible in the full OP ledger,
            // but are not tenant payment obligations and cannot lower a tenant's score.
            if (in_array($item->status, ['cancelled', 'canceled'], true)
                || $item->isPayoutLike() || $item->type === 'retention') {
                continue;
            }
            if (! $item->due_date) {
                $summary['missingDueCount']++;
                continue;
            }
            if ($item->due_date->gt($today)) {
                $summary['futureDueCount']++;

                continue;
            }
            $row = $this->paymentObservation($item, $today);
            $rows[] = $row;
            $summary['dueCount']++;
            if ($row['openCents'] > 0) {
                $summary['openCount']++;
                $summary['overdueOpenCount'] += $item->due_date->lt($today) ? 1 : 0;
            }
            if ($row['state'] === 'unverifiable') {
                $summary['unverifiableCount']++;
            } elseif ($row['state'] !== 'open') {
                $summary['verifiableSettledCount']++;
                $summary[$row['state'] === 'on_time' ? 'onTimeCount' : 'lateCount']++;
                $delays[] = $row['delayDays'];
            }
        }
        if ($summary['dueCount'] > 0) {
            // Transparency over the complete cohort, even when some settlements lack evidence.
            $summary['onTimeAllDuePercent'] = round(100 * $summary['onTimeCount'] / $summary['dueCount'], 1);
        }
        if ($summary['verifiableSettledCount'] > 0) {
            $summary['onTimeSharePercent'] = round(100 * $summary['onTimeCount'] / $summary['verifiableSettledCount'], 1);
            sort($delays, SORT_NUMERIC);
            $middle = intdiv(count($delays), 2);
            $summary['medianSettlementDelayDays'] = count($delays) % 2 === 1 ? $delays[$middle] : ($delays[$middle - 1] + $delays[$middle]) / 2;
            $summary['maxSettlementDelayDays'] = max($delays);
        }

        return [
            'observedAsOf' => $today->toDateString(), 'dateBasis' => 'value_date_fallback_booking_date',
            'observedThrough' => $today->toDateString(),
            'summary' => $summary, 'rows' => $rows,
        ];
    }

    private function paymentObservation(OpenItem $item, CarbonImmutable $today): array
    {
        $amount = $this->cents($item->amount);
        $open = $this->cents($item->open_amount);
        $allocated = 0;
        $reliable = $amount > 0 && $open >= 0 && $open <= $amount;
        $payments = [];
        foreach ($item->allocations as $allocation) {
            if ($allocation->allocation_type === 'overpayment') {
                continue;
            }
            $payment = $allocation->payment;
            $date = $payment?->value_date ?? $payment?->booking_date;
            $cents = $this->cents($allocation->amount);
            if (! in_array($allocation->allocation_type, self::RENT_ALLOCATION_TYPES, true)
                || $payment?->direction !== 'credit'
                || in_array($payment?->status, ['cancelled', 'canceled'], true)
                || ! $date || $date->gt($today) || $cents <= 0) {
                $reliable = false;

                continue;
            }
            $allocated += $cents;
            $payments[] = ['date' => $date->toDateString(), 'cents' => $cents];
        }
        $reliable = $reliable && $allocated === $amount - $open;
        $settledOn = null;
        $delay = null;
        $state = $reliable ? 'open' : 'unverifiable';

        if ($reliable && $open === 0) {
            usort($payments, static fn (array $left, array $right): int => $left['date'] <=> $right['date']);
            $covered = 0;
            foreach ($payments as $payment) {
                $covered += $payment['cents'];
                if ($covered >= $amount) {
                    $settledOn = $payment['date'];
                    break;
                }
            }
            if ($settledOn !== null) {
                $date = CarbonImmutable::parse($settledOn);
                $delay = (int) $item->due_date->diffInDays($date);
                $state = $date->lte($item->due_date) ? 'on_time' : 'late';
            } else {
                $state = 'unverifiable';
            }
        }

        return [
            'number' => (string) $item->number,
            'dueDate' => $item->due_date?->toDateString(),
            'amountCents' => $amount, 'openCents' => $open, 'allocatedCents' => $allocated,
            'settledOn' => $settledOn, 'delayDays' => $delay, 'state' => $state,
        ];
    }

    private function dunning(Contract $contract): array
    {
        $notices = DunningNotice::query()->where('contract_id', $contract->id)
            ->select(['id', 'number', 'level', 'status', 'issued_on', 'payment_due_on', 'principal_total', 'fee_amount', 'total_due', 'cancelled_at'])
            ->withCount('items')->orderByDesc('issued_on')->orderByDesc('number')->get();
        $rows = $notices->map(fn (DunningNotice $notice): array => [
            'number' => (string) $notice->number,
            'level' => (string) $notice->level,
            'levelLabel' => match ($notice->level) {
                'reminder' => 'Zahlungserinnerung', 'dunning_1' => '1. Mahnung', 'dunning_2' => '2. Mahnung', default => 'Mahnung',
            },
            'status' => (string) $notice->status,
            'statusLabel' => $notice->status === 'cancelled' ? 'Storniert' : 'Nicht storniert',
            'issuedOn' => $notice->issued_on?->toDateString(),
            'paymentDueOn' => $notice->payment_due_on?->toDateString(),
            'principalCents' => $this->cents($notice->getRawOriginal('principal_total')),
            'feeCents' => $this->cents($notice->getRawOriginal('fee_amount')),
            'totalCents' => $this->cents($notice->getRawOriginal('total_due')),
            'itemCount' => (int) $notice->items_count,
            'cancelledAt' => $notice->cancelled_at?->toIso8601String(),
        ])->values()->all();

        return [
            'summary' => [
                'count' => $notices->count(), 'activeCount' => $notices->where('status', 'active')->count(),
                'cancelledCount' => $notices->where('status', 'cancelled')->count(),
                'lastIssuedOn' => collect($rows)->pluck('issuedOn')->filter()->max(),
            ],
            'rows' => $rows,
        ];
    }

    private function isCurrent(?CarbonInterface $from, ?CarbonInterface $to, CarbonImmutable $today): bool
    {
        return (! $from || $from->lte($today)) && (! $to || $to->gte($today));
    }

    private function cents(mixed $value): int
    {
        return BigDecimal::of((string) ($value ?? 0))->multipliedBy(100)->toScale(0, RoundingMode::HalfUp)->toInt();
    }

    private function unitTypeLabel(string $type): string
    {
        return match ($type) {
            'apartment' => 'Wohnung', 'commercial' => 'Gewerbeeinheit', 'garage' => 'Garage',
            'parking_space' => 'Stellplatz', 'storage' => 'Lager', 'cellar' => 'Keller',
            'technical' => 'Technische Einheit', default => 'Sonstige Einheit',
        };
    }
}
