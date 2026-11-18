<?php

namespace App\Services\Finance;

use App\Models\ContractParty;
use App\Models\OpenItem;
use App\Models\Payment;
use App\Models\PaymentAllocation;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Read-only monthly work queue + guarded batch adapter.
 *
 * The candidate service remains the only ranking engine, while the existing
 * PaymentAllocationService remains the only accounting write boundary.
 */
final class MonthlyPaymentAutoMatchingService
{
    public const PAGE_SIZE = 40;
    private const MAX_BATCH = 40;
    // A monthly one-click run must be bounded, complete or fail closed.
    private const MAX_MONTH_PAYMENT_SCAN = 250;
    private const CONTEXT_HISTORY_LIMIT = 60;
    private const PAYMENT_HISTORY_LIMIT = 30;
    private const OPEN_ITEM_HISTORY_LIMIT = 20;
    private const MAX_PEER_PAYMENTS = 60;

    /** @var array<string, \Illuminate\Support\Collection<int, Payment>> */
    private array $peerPaymentsByIdentityAndPeriod = [];

    public function __construct(
        private readonly PaymentAllocationCandidateService $candidates,
        private readonly PaymentAllocationMatchContextService $context,
        private readonly PaymentAllocationService $allocations,
    ) {}

    /** @return array{rows:array<int,array<string,mixed>>,meta:array<string,mixed>} */
    public function preview(string $month, int $page = 1, string $view = 'all', string $search = ''): array
    {
        // One bounded month assessment owns BOTH the worklist and the Book
        // summary. Do not perform the 250-payment scan again for a second
        // dashboard query on each page load.
        $assessment = $this->assessedMonthlyRows($month);
        $summary = $this->summarizeAssessment($month, $assessment);

        if (! $assessment['limited']) {
            // Search the entire certified bank month, never just the current 40-row page.
            // The approval snapshot still covers ALL eligible payments, even under a search filter.
            $needle = mb_strtolower(trim($search), 'UTF-8');
            $rows = array_values(array_filter($assessment['rows'], static function (array $row) use ($view, $needle): bool {
                if ($view !== 'all' && ($view === 'review' ? $row['state'] === 'ready' : $row['state'] !== 'ready')) {
                    return false;
                }
                if ($needle === '') {
                    return true;
                }
                $haystack = mb_strtolower(implode(' ', array_filter([
                    $row['number'], $row['counterpartyName'], $row['counterpartyIban'],
                    $row['purpose'], $row['targetPeriod'], $row['remaining'], $row['amount'],
                    number_format((float) $row['remaining'], 2, ',', '.'),
                    number_format((float) $row['amount'], 2, ',', '.'),
                    ...array_column($row['linkedContracts'], 'number'),
                ], static fn ($value): bool => $value !== null && $value !== '')), 'UTF-8');

                return str_contains($haystack, $needle);
            }));
            $slice = array_slice($rows, ($page - 1) * self::PAGE_SIZE, self::PAGE_SIZE);

            // Only the 40 visible review cases need the expensive candidate
            // search and human-readable ranking explanations. Automatic
            // certification never depends on the candidate-search window.
            $reviewIds = array_column(array_values(array_filter($slice,
                static fn (array $row): bool => $row['state'] !== 'ready')), 'id');
            if ($reviewIds !== []) {
                $details = Payment::query()->with('bankStatement:id,file_name')
                    ->whereIn('id', $reviewIds)->get()->keyBy('id');
                foreach ($slice as &$row) {
                    if ($row['state'] !== 'ready' && isset($details[$row['id']])) {
                        $detail = $this->project($details[$row['id']], $month, true);
                        // Cross-payment contention was determined over the
                        // full month; never restore a collided automatic row.
                        if ($detail['state'] === 'ready') {
                            $detail['state'] = 'review';
                            $detail['approvalToken'] = null;
                            $detail['automaticAllocations'] = [];
                            $detail['automaticAllocationDetails'] = [];
                            $detail['message'] = $row['message'];
                        }
                        $row = $detail;
                    }
                }
                unset($row);
            }

            // Contract counterparties are looked up in one bounded batch only
            // for visible certified rows, never in the 250-payment assessment.
            $this->attachCertifiedTenantNames($slice, $month);

            return [
                'rows' => $slice,
                'meta' => [
                    'month' => $month, 'page' => $page, 'pageSize' => self::PAGE_SIZE,
                    'hasMore' => count($rows) > $page * self::PAGE_SIZE,
                    'ready' => collect($slice)->where('state', 'ready')->count(),
                    'review' => collect($slice)->where('state', '!=', 'ready')->count(),
                    'totalRemaining' => round(collect($slice)->sum('remaining'), 2),
                    'view' => $view,
                    'summary' => $summary,
                ],
            ];
        }

        // The certified-only workbench must fail closed beyond the monthly limit.
        // Never show partially assessed import pages as if they were approved.
        if ($view === 'ready') {
            return [
                'rows' => [],
                'meta' => [
                    'month' => $month, 'page' => $page, 'pageSize' => self::PAGE_SIZE,
                    'hasMore' => false, 'ready' => 0, 'review' => 0,
                    'totalRemaining' => 0, 'view' => 'ready', 'summary' => $summary,
                ],
            ];
        }

        // Above the hard limit, expose the old bounded bank-import pages
        // instead of silently claiming an incomplete month was fully checked.
        $paymentsQuery = $this->pendingMonthPayments($month);
        if ($search !== '') {
            $like = '%'.$search.'%';
            $numericSearch = str_replace(',', '.', $search);
            $searchAmount = is_numeric($numericSearch) ? (float) $numericSearch : null;
            $paymentsQuery->where(static function ($query) use ($like, $searchAmount): void {
                $query->where('number', 'like', $like)
                    ->orWhere('counterparty_name', 'like', $like)
                    ->orWhere('counterparty_iban', 'like', $like)
                    ->orWhere('purpose', 'like', $like)
                    ->orWhere('booking_text', 'like', $like);
                if ($searchAmount !== null) {
                    $query->orWhere('amount', $searchAmount)
                        ->orWhere('unallocated_amount', $searchAmount);
                }
            });
        }
        $payments = $paymentsQuery
            ->offset(($page - 1) * self::PAGE_SIZE)
            ->limit(self::PAGE_SIZE + 1)->get();
        $hasMore = $payments->count() > self::PAGE_SIZE;
        $rows = $this->invalidateCompetingTargets($payments->take(self::PAGE_SIZE)
            ->map(fn (Payment $payment): array => $this->project($payment, $month))
            ->values()->all());

        return [
            'rows' => $rows,
            'meta' => [
                'month' => $month, 'page' => $page, 'pageSize' => self::PAGE_SIZE,
                'hasMore' => $hasMore,
                'ready' => collect($rows)->where('state', 'ready')->count(),
                'review' => collect($rows)->where('state', '!=', 'ready')->count(),
                'totalRemaining' => round(collect($rows)->sum('remaining'), 2),
                'view' => 'all', 'summary' => $summary,
            ],
        ];
    }

    /** Enrich at most 40 visible safe proposals with the actual contractual tenants. */
    private function attachCertifiedTenantNames(array &$rows, string $month): void
    {
        $contractIds = collect($rows)
            ->filter(static fn (array $row): bool => $row['state'] === 'ready')
            ->flatMap(static fn (array $row): array => array_column($row['automaticAllocationDetails'], 'contractId'))
            ->filter()->unique()->values()->all();

        if ($contractIds === []) {
            return;
        }

        // The identity service establishes the active tenant at the value
        // date (fallback: booking date), NOT always the bank booking month.
        // Advance/late value dates can cross a month boundary.
        $referenceDates = collect($rows)->filter(static fn (array $row): bool => $row['state'] === 'ready')
            ->map(static fn (array $row): string => (string) ($row['valueDate'] ?: $row['bookingDate']))
            ->filter()->sort()->values();
        $firstDate = $referenceDates->first() ?? $month.'-01';
        $lastDate = $referenceDates->last() ?? $month.'-01';
        $partiesByContract = ContractParty::query()
            ->with('businessPartnerSummary:id,display_name')
            ->whereIn('contract_id', $contractIds)
            ->whereIn('party_role', ContractParty::TENANT_ROLES)
            ->where(fn ($query) => $query->whereNull('valid_from')->orWhereDate('valid_from', '<=', $lastDate))
            ->where(fn ($query) => $query->whereNull('valid_until')->orWhereDate('valid_until', '>=', $firstDate))
            ->get(['contract_id', 'business_partner_id', 'party_role', 'valid_from', 'valid_until'])
            ->groupBy('contract_id');

        foreach ($rows as &$row) {
            if ($row['state'] !== 'ready') {
                continue;
            }
            $contractId = $row['automaticAllocationDetails'][0]['contractId'] ?? '';
            $referenceDate = $row['valueDate'] ?: $row['bookingDate'];
            $row['tenantNames'] = ($partiesByContract->get($contractId) ?? collect())
                ->filter(static fn (ContractParty $party): bool =>
                    ($party->valid_from === null || $party->valid_from->toDateString() <= $referenceDate)
                    && ($party->valid_until === null || $party->valid_until->toDateString() >= $referenceDate))
                ->pluck('businessPartnerSummary.display_name')->filter()->unique()->values()->all();
        }
        unset($row);
    }

    /**
     * The user opens the *exceptions* of a bank month, not forty arbitrary
     * payment offsets. Only certified safe rows are auto-bookable.
     *
     * @return array{rows:array<int,array<string,mixed>>,pendingCount:int,limited:bool}
     */
    private function assessedMonthlyRows(string $month): array
    {
        $payments = $this->pendingMonthPayments($month)
            ->limit(self::MAX_MONTH_PAYMENT_SCAN + 1)->get();

        if ($payments->count() > self::MAX_MONTH_PAYMENT_SCAN) {
            return [
                'rows' => [],
                'pendingCount' => $this->pendingMonthPayments($month)->count(),
                'limited' => true,
            ];
        }

        $rows = $payments->map(fn (Payment $payment): array => $this->project($payment, $month, false))->all();

        return ['rows' => $this->invalidateCompetingTargets($rows),
            'pendingCount' => count($rows), 'limited' => false];
    }

    /** @param array<int,array<string,mixed>> $rows
     * @return array<int,array<string,mixed>>
     */
    private function invalidateCompetingTargets(array $rows): array
    {
        $usage = [];
        foreach ($rows as $row) {
            if ($row['state'] !== 'ready') continue;
            foreach ($row['automaticAllocations'] as $allocation) {
                $id = $allocation['targetId'];
                $usage[$id] = ($usage[$id] ?? 0) + 1;
            }
        }

        foreach ($rows as &$row) {
            if ($row['state'] !== 'ready') continue;
            foreach ($row['automaticAllocations'] as $allocation) {
                if (($usage[$allocation['targetId']] ?? 0) <= 1) continue;
                $row['state'] = 'review';
                $row['message'] = 'Mehrere Bankeingänge beanspruchen denselben OP. Bitte eine Zuordnung bestätigen.';
                $row['approvalToken'] = null;
                $row['automaticAllocations'] = [];
                $row['automaticAllocationDetails'] = [];
                break;
            }
        }
        unset($row);

        return $rows;
    }

    /**
     * The summary and the Book command use the same *complete* certification.
     * No item drops out merely because it is on a different preview page.
     *
     * @return array{rows:array<int,array<string,mixed>>,pendingCount:int,limited:bool}
     */
    private function safeMonthlyRows(string $month): array
    {
        $assessment = $this->assessedMonthlyRows($month);
        $assessment['rows'] = array_values(array_filter($assessment['rows'],
            static fn (array $row): bool => $row['state'] === 'ready'));

        return $assessment;
    }

    private function pendingMonthPayments(string $month): \Illuminate\Database\Eloquent\Builder
    {
        $from = CarbonImmutable::parse($month.'-01')->startOfMonth();

        return Payment::query()
            ->with('bankStatement:id,file_name')
            ->whereNotNull('bank_statement_id')
            ->where('direction', 'credit')
            ->where('booking_date', '>=', $from->toDateString())
            ->where('booking_date', '<', $from->addMonth()->toDateString())
            ->where('unallocated_amount', '>', 0.001)
            ->orderBy('booking_date')->orderBy('id');
    }

    /** @return array<string,mixed> */
    public function monthSummary(string $month): array
    {
        return $this->summarizeAssessment($month, $this->assessedMonthlyRows($month));
    }

    /** @param array{rows:array<int,array<string,mixed>>,pendingCount:int,limited:bool} $assessment
     * @return array<string,mixed>
     */
    private function summarizeAssessment(string $month, array $assessment): array
    {
        $safe = array_values(array_filter($assessment['rows'],
            static fn (array $row): bool => $row['state'] === 'ready'));

        // The token binds the operator's one-click approval to the precise
        // observed set of certified proposals. A later imported payment,
        // changed OP balance, or reclassified contract invalidates it.
        $certified = array_map(static fn (array $row): array =>
            [$row['id'], $row['approvalToken']], $safe);
        usort($certified, static fn (array $a, array $b): int => strcmp($a[0], $b[0]));
        $approvalSnapshot = $assessment['limited'] ? null : hash('sha256', json_encode([
            $month, $assessment['pendingCount'], $certified,
        ], JSON_THROW_ON_ERROR));

        return [
            'month' => $month,
            'pendingCount' => $assessment['pendingCount'],
            'safeCount' => count($safe),
            'safePaymentIds' => array_column($safe, 'id'),
            'safePlans' => array_map(static fn (array $row): array => [
                'paymentId' => $row['id'],
                'amount' => $row['remaining'],
                'targetIds' => array_column($row['automaticAllocations'], 'targetId'),
            ], $safe),
            'safeAmount' => round(collect($safe)->sum('remaining'), 2),
            'reviewCount' => max(0, $assessment['pendingCount'] - count($safe)),
            'limited' => $assessment['limited'],
            'approvalSnapshot' => $approvalSnapshot,
        ];
    }

    /**
     * On-demand contextual read for exactly one verified linked contract.
     * Never fan out history and contract conditions during a 40-row preview;
     * the established contract-details endpoint owns condition versions.
     *
     * @return array{data:array<int,array<string,mixed>>,meta:array{contractId:string,hasMore:bool,limit:int}}
     */
    public function contractAllocationHistory(Payment $payment, string $contractId, ?string $researchOpenItemId = null): array
    {
        // A guessed candidate is not a confirmed contract relationship.
        // The client must not turn an unrelated payment/contract pair into
        // a cross-account payment history query.
        abort_unless($payment->bank_statement_id !== null && $payment->direction === 'credit', 404);
        $verified = in_array($contractId, $this->context->linkedContractIds($payment), true);
        if (! $verified) {
            // Manual research is permitted only after explicitly selecting a
            // concrete OP belonging to this contract. The selected OP is not
            // evidence that the payer belongs to the contract.
            abort_unless($researchOpenItemId !== null, 404);
            $selected = OpenItem::query()->findOrFail($researchOpenItemId);
            abort_unless($selected->contract_id !== null
                && (string) $selected->contract_id === $contractId, 404);
            \Illuminate\Support\Facades\Gate::authorize('view', $selected->contract);
        }

        $allocations = PaymentAllocation::query()
            ->join('receivables as matching_receivables', 'matching_receivables.id', '=', 'payment_allocations.receivable_id')
            ->join('payments as matching_payments', 'matching_payments.id', '=', 'payment_allocations.payment_id')
            ->where('matching_receivables.contract_id', $contractId)
            ->whereNull('matching_receivables.deleted_at')
            ->whereNull('matching_payments.deleted_at')
            ->where('matching_payments.direction', 'credit')
            ->orderByRaw('COALESCE(matching_payments.value_date, matching_payments.booking_date) DESC')
            ->orderByDesc('matching_payments.id')
            ->orderByDesc('payment_allocations.booked_at')
            ->orderByDesc('payment_allocations.id')
            ->limit(self::CONTEXT_HISTORY_LIMIT + 1)
            ->get([
                'payment_allocations.id', 'payment_allocations.payment_id',
                'payment_allocations.receivable_id', 'payment_allocations.amount',
                'payment_allocations.allocation_type', 'payment_allocations.booked_at',
            ]);

        $hasMore = $allocations->count() > self::CONTEXT_HISTORY_LIMIT;
        $rows = $allocations->take(self::CONTEXT_HISTORY_LIMIT)
            ->load([
                'payment:id,number,booking_date,value_date,counterparty_name,amount,unallocated_amount',
                'openItem:id,contract_id,number,description,service_month',
            ])->map(static function (PaymentAllocation $allocation): array {
                $paymentRow = $allocation->payment;
                $item = $allocation->openItem;

                return [
                    'id' => (string) $allocation->id,
                    'paymentId' => (string) $allocation->payment_id,
                    'paymentNumber' => $paymentRow?->number,
                    'paymentDate' => ($paymentRow?->value_date ?: $paymentRow?->booking_date)?->toDateString(),
                    'paymentAmount' => round((float) ($paymentRow?->amount ?? 0), 2),
                    'counterpartyName' => $paymentRow?->counterparty_name,
                    'openItemId' => (string) $allocation->receivable_id,
                    'openItemNumber' => $item?->number,
                    'openItemDescription' => $item?->description,
                    'serviceMonth' => $item?->service_month?->format('Y-m'),
                    'amount' => round((float) $allocation->amount, 2),
                    'allocationType' => (string) $allocation->allocation_type,
                    'bookedAt' => $allocation->booked_at?->toIso8601String(),
                ];
            })->values()->all();

        return [
            'data' => $rows,
            'meta' => [
                'contractId' => $contractId,
                'source' => $verified ? 'verified' : 'selected_open_item',
                'hasMore' => $hasMore,
                'limit' => self::CONTEXT_HISTORY_LIMIT,
            ],
        ];
    }

    /**
     * On-demand information for a single imported incoming payment: all of
     * its actual allocations, even when the payer cannot be linked to a
     * contract. An invoice allocation can appear as read-only history but
     * can never be created by this OP-only batch action.
     */
    public function paymentAllocationHistory(Payment $payment): array
    {
        abort_unless($payment->bank_statement_id !== null && $payment->direction === 'credit', 404);

        $entries = PaymentAllocation::query()
            ->where('payment_id', $payment->id)
            ->with([
                'openItem:id,number,description,service_month',
                'incomingInvoice:id,number,description',
            ])
            ->orderByDesc('booked_at')->orderByDesc('id')
            ->limit(self::PAYMENT_HISTORY_LIMIT + 1)->get();

        return [
            'data' => $entries->take(self::PAYMENT_HISTORY_LIMIT)
                ->map(static function (PaymentAllocation $entry): array {
                    $target = $entry->receivable_id ? $entry->openItem : $entry->incomingInvoice;
                    return [
                        'id' => (string) $entry->id,
                        'targetType' => $entry->receivable_id ? 'openItem' : 'incomingInvoice',
                        'targetId' => (string) ($entry->receivable_id ?: $entry->incoming_invoice_id),
                        'targetNumber' => $target?->number,
                        'targetDescription' => $target?->description,
                        'serviceMonth' => $entry->openItem?->service_month?->format('Y-m'),
                        'amount' => round((float) $entry->amount, 2),
                        'allocationType' => (string) $entry->allocation_type,
                        'bookedAt' => $entry->booked_at?->toIso8601String(),
                    ];
                })->values()->all(),
            'meta' => [
                'hasMore' => $entries->count() > self::PAYMENT_HISTORY_LIMIT,
                'limit' => self::PAYMENT_HISTORY_LIMIT,
            ],
        ];
    }

    /**
     * Read-only OP evidence across booking months. Never expose an unrelated
     * contract via a guessed candidate ID: require a verified tenant link
     * or an actual allocation of the inspected payment to this OP.
     */
    public function openItemAllocationHistory(Payment $payment, OpenItem $openItem, bool $manualResearch = false): array
    {
        abort_unless($payment->bank_statement_id !== null && $payment->direction === 'credit', 404);

        $linked = $openItem->contract_id !== null
            && in_array((string) $openItem->contract_id, $this->context->linkedContractIds($payment), true);
        $alreadyAllocated = PaymentAllocation::query()
            ->where('payment_id', $payment->id)->where('receivable_id', $openItem->id)->exists();
        abort_unless($linked || $alreadyAllocated || ($manualResearch && $openItem->contract_id !== null), 404);

        if ($openItem->contract_id !== null) {
            \Illuminate\Support\Facades\Gate::authorize('view', $openItem->contract);
        }

        $entries = PaymentAllocation::query()
            ->where('receivable_id', $openItem->id)
            ->whereHas('payment', static fn ($query) => $query->where('direction', 'credit'))
            ->with('payment:id,number,booking_date,value_date,amount')
            ->orderByDesc('booked_at')->orderByDesc('id')
            ->limit(self::OPEN_ITEM_HISTORY_LIMIT + 1)->get();

        return [
            'openItem' => [
                'id' => (string) $openItem->id,
                'number' => $openItem->number,
                'description' => $openItem->description,
                'serviceMonth' => $openItem->service_month?->format('Y-m'),
                'dueDate' => $openItem->due_date?->toDateString(),
                'amount' => round((float) $openItem->amount, 2),
                'openAmount' => round((float) $openItem->open_amount, 2),
                'status' => $openItem->status,
                'contractNumber' => $openItem->contract?->contract_number,
            ],
            'data' => $entries->take(self::OPEN_ITEM_HISTORY_LIMIT)
                ->map(static function (PaymentAllocation $entry): array {
                    $bank = $entry->payment;
                    return [
                        'id' => (string) $entry->id,
                        'paymentId' => (string) $entry->payment_id,
                        'paymentNumber' => $bank?->number,
                        'paymentDate' => ($bank?->value_date ?: $bank?->booking_date)?->toDateString(),
                        'paymentAmount' => round((float) ($bank?->amount ?? 0), 2),
                        'amount' => round((float) $entry->amount, 2),
                        'allocationType' => (string) $entry->allocation_type,
                        'bookedAt' => $entry->booked_at?->toIso8601String(),
                    ];
                })->values()->all(),
            'meta' => [
                'hasMore' => $entries->count() > self::OPEN_ITEM_HISTORY_LIMIT,
                'limit' => self::OPEN_ITEM_HISTORY_LIMIT,
            ],
        ];
    }

    /**
     * Book server-approved automatic proposals and user-reviewed manual fixes
     * together. The existing accounting service owns every actual allocation.
     * All allocations commit or roll back in one deterministic transaction.
     *
     * @param array<int,array{paymentId:string,approvalToken:string}> $items
     * @param array<int,array{paymentId:string,expectedRemaining:float,allocations:array<int,array<string,mixed>>}> $manualItems
     * @return array{booked:int,amount:float,paymentIds:array<int,string>}
     */
    public function book(
        string $month,
        array $items,
        ?string $userId,
        array $manualItems = [],
        bool $includeAllSafe = false,
        array $excludedPaymentIds = [],
        ?string $expectedApprovalSnapshot = null,
    ): array {
        $total = count($items) + count($manualItems);
        if ((! $includeAllSafe && ($total < 1 || $total > self::MAX_BATCH))
            || ($includeAllSafe && ($items !== [] || count($manualItems) > self::MAX_BATCH))) {
            throw ValidationException::withMessages(['items' => 'Bitte maximal 40 manuelle oder einzeln bestätigte Zahlungen auswählen.']);
        }

        $ids = array_merge(array_column($items, 'paymentId'), array_column($manualItems, 'paymentId'));
        if (count(array_unique($ids)) !== count($ids)) {
            throw ValidationException::withMessages(['items' => 'Eine Zahlung darf nur einmal in der Sammelbuchung vorkommen.']);
        }

        $commands = array_merge(
            array_map(static fn (array $item): array => $item + ['kind' => 'automatic'], $items),
            array_map(static fn (array $item): array => $item + ['kind' => 'manual'], $manualItems),
        );
        return DB::transaction(function () use ($month, $commands, $userId, $includeAllSafe, $excludedPaymentIds, $manualItems, $expectedApprovalSnapshot): array {
            if ($includeAllSafe) {
                // Lock the complete bounded pending bank month *before*
                // evaluating the certification snapshot. This prevents a
                // concurrent edit of an existing receipt from sliding between
                // the assessment and its eventual per-payment posting locks.
                // The final allocator still independently locks payment/OP
                // balances, and the snapshot still rejects changed months.
                $lockedIds = $this->pendingMonthPayments($month)
                    ->limit(self::MAX_MONTH_PAYMENT_SCAN + 1)
                    ->lockForUpdate()->pluck('id');
                if ($lockedIds->count() > self::MAX_MONTH_PAYMENT_SCAN) {
                    throw ValidationException::withMessages([
                        'items' => 'Mehr als 250 offene Bankeingänge im Monat. Bitte zuerst die normalen Zahlungen bearbeiten.',
                    ]);
                }
                $monthRows = $this->safeMonthlyRows($month);
                if ($monthRows['limited']) {
                    throw ValidationException::withMessages(['items' => 'Mehr als 250 offene Bankeingänge im Monat. Bitte die angezeigten Importseiten einzeln buchen.']);
                }
                $currentSnapshot = $this->summarizeAssessment($month, [
                    'rows' => $monthRows['rows'],
                    'pendingCount' => $monthRows['pendingCount'],
                    'limited' => false,
                ])['approvalSnapshot'];
                if (! is_string($expectedApprovalSnapshot)
                    || ! hash_equals($currentSnapshot, $expectedApprovalSnapshot)) {
                    throw ValidationException::withMessages(['items' => 'Die geprüften Bankeingänge oder OP-Vorschläge haben sich geändert. Bitte den Monat neu abgleichen.']);
                }

                // A safe-month approval may adjust the *amount* of a certified
                // receivable but must never turn a forged manual command into
                // arbitrary OP selection. Legacy explicit/manual commands
                // (includeAllSafe=false) retain their separate workflow.
                $certifiedByPayment = collect($monthRows['rows'])->keyBy('id');
                $manualIds = array_column($manualItems, 'paymentId');
                foreach ($manualItems as $manual) {
                    $paymentId = (string) $manual['paymentId'];
                    $certified = $certifiedByPayment->get($paymentId);
                    if ($certified === null || in_array($paymentId, $excludedPaymentIds, true)) {
                        throw ValidationException::withMessages([
                            'manualItems' => 'Anpassungen sind nur für freigegebene, nicht abgewählte automatische Zahlungen zulässig.',
                        ]);
                    }

                    $safeTargets = collect($certified['automaticAllocations'])->keyBy('targetId');
                    $seenTargets = [];
                    foreach ($manual['allocations'] as $allocation) {
                        $targetId = (string) $allocation['targetId'];
                        $original = $safeTargets->get($targetId);
                        $requestedCents = (int) round((float) $allocation['amount'] * 100);
                        $certifiedCents = (int) round((float) ($original['amount'] ?? 0) * 100);

                        if ($original === null
                            || $allocation['targetType'] !== 'openItem'
                            || isset($seenTargets[$targetId])
                            || ($allocation['allocationType'] ?? 'regular') !== 'regular'
                            || (float) ($allocation['discountAmount'] ?? 0) > 0
                            || $requestedCents < 1
                            || $requestedCents > $certifiedCents
                            || abs((float) $allocation['amount'] * 100 - $requestedCents) > 0.0001) {
                            throw ValidationException::withMessages([
                                'manualItems' => 'Hier dürfen nur die zertifizierten OPs einmalig mit unverändertem oder reduziertem Centbetrag übernommen werden.',
                            ]);
                        }
                        $seenTargets[$targetId] = true;
                    }
                }

                foreach ($monthRows['rows'] as $row) {
                    if (in_array($row['id'], $excludedPaymentIds, true)
                        || in_array($row['id'], $manualIds, true)) {
                        continue;
                    }
                    $commands[] = [
                        'kind' => 'automatic',
                        'paymentId' => $row['id'],
                        'approvalToken' => $row['approvalToken'],
                    ];
                }
            }

            if ($commands === []) {
                throw ValidationException::withMessages(['items' => 'Es gibt keine freigegebenen sicheren Zuordnungen. Bitte zuerst Prüffälle zuordnen.']);
            }

            usort($commands, static fn (array $a, array $b): int => strcmp($a['paymentId'], $b['paymentId']));
            $booked = [];
            $sum = 0.0;

            foreach ($commands as $command) {
                $payment = Payment::query()->lockForUpdate()->findOrFail($command['paymentId']);
                if ($payment->bank_statement_id === null
                    || $payment->direction !== 'credit'
                    || $payment->booking_date?->format('Y-m') !== $month
                    || (float) $payment->unallocated_amount <= 0.001) {
                    throw ValidationException::withMessages(['items' => 'Mindestens eine Zahlung wurde seit der Prüfung bereits bearbeitet. Bitte neu prüfen.']);
                }

                $remaining = round((float) $payment->unallocated_amount, 2);
                // The month certification populated the context's per-payment
                // cache. Never reuse that earlier evidence after locking a
                // potentially updated bank receipt for a final command.
                $this->context->forgetPayment((string) $payment->id);
                $this->peerPaymentsByIdentityAndPeriod = [];
                if ($command['kind'] === 'manual') {
                    if (abs($remaining - round((float) $command['expectedRemaining'], 2)) > 0.001) {
                        throw ValidationException::withMessages(['manualItems' => 'Der Zahlungsrest wurde nach der manuellen Prüfung verändert. Bitte erneut prüfen.']);
                    }
                    if ($includeAllSafe) {
                        $certified = $certifiedByPayment->get((string) $payment->id);
                        $fresh = $this->project($payment, $month, false);
                        if ($certified === null || $fresh['state'] !== 'ready'
                            || ! is_string($fresh['approvalToken'])
                            || ! hash_equals($certified['approvalToken'], $fresh['approvalToken'])) {
                            throw ValidationException::withMessages([
                                'manualItems' => 'Die sichere Zahlungsidentität, der Vertrag oder OP haben sich geändert. Bitte den Abgleich neu laden.',
                            ]);
                        }
                    }
                    $allocations = $command['allocations'];
                    // This OP-only workbench must never post supplier refunds,
                    // outgoing payments or incoming invoices, including via a forged API request.
                    foreach ($allocations as $allocation) {
                        if ($allocation['targetType'] !== 'openItem') {
                            throw ValidationException::withMessages(['manualItems' => 'Hier können ausschließlich Zahlungseingänge offenen Forderungen (OP) zugeordnet werden.']);
                        }
                    }
                    $amount = round(collect($allocations)->sum(static fn (array $allocation): float => (float) $allocation['amount']), 2);
                } else {
                    $projection = $this->project($payment, $month, false);
                    if ($projection['state'] !== 'ready'
                        || ! is_string($projection['approvalToken'])
                        || ! hash_equals($projection['approvalToken'], $command['approvalToken'])) {
                        throw ValidationException::withMessages(['items' => 'Der vorgeschlagene OP oder Zahlungsrest hat sich geändert. Bitte die Treffer neu prüfen.']);
                    }
                    $allocations = $projection['automaticAllocations'];
                    $amount = $remaining;
                }

                // A snapshot or token read alone cannot protect metadata
                // from a concurrent edit in repeatable-read databases. Guard
                // both the whole-month command AND legacy explicit automatic
                // token commands with fresh, locked certified OP data.
                if ($includeAllSafe) {
                    $certified = $certifiedByPayment->get((string) $payment->id);
                    $this->assertCertifiedOpenItemsUnchanged($certified['automaticAllocationDetails'] ?? []);
                } elseif ($command['kind'] === 'automatic') {
                    $this->assertCertifiedOpenItemsUnchanged($projection['automaticAllocationDetails'] ?? []);
                }

                // Direction, open balance, overpayment split and invoice discount
                // are checked under locks by the canonical allocation service.
                $this->allocations->allocate($payment, $allocations, $userId);
                $booked[] = (string) $payment->id;
                $sum += $amount;
            }

            return ['booked' => count($booked), 'amount' => round($sum, 2), 'paymentIds' => $booked];
        }, 3);
    }

    /**
     * The approval token covers readable OP metadata. Lock those targets when
     * booking so a concurrent edit cannot bypass the previously reviewed
     * number, contract, period, due date or amount in repeatable-read isolation.
     *
     * @param array<int,array<string,mixed>> $details
     */
    private function assertCertifiedOpenItemsUnchanged(array $details): void
    {
        if ($details === []) {
            throw ValidationException::withMessages([
                'items' => 'Zertifizierte OP-Buchungsdaten fehlen. Bitte den Abgleich neu laden.',
            ]);
        }

        $current = OpenItem::query()->whereIn('id', array_column($details, 'targetId'))
            ->orderBy('id')->lockForUpdate()
            ->get(['id', 'contract_id', 'number', 'description', 'type', 'cost_area', 'status', 'service_month', 'due_date', 'amount', 'open_amount'])
            ->keyBy('id');

        if ($current->count() !== count($details)) {
            throw ValidationException::withMessages([
                'items' => 'Mindestens ein freigegebener OP wurde zwischenzeitlich verändert. Bitte neu prüfen.',
            ]);
        }

        foreach ($details as $detail) {
            $op = $current->get($detail['targetId']);
            if ($op === null
                || (string) $op->contract_id !== (string) $detail['contractId']
                || (string) $op->number !== (string) $detail['number']
                || (string) $op->description !== (string) $detail['description']
                || (string) $op->type !== (string) $detail['type']
                || (string) ($op->cost_area ?? '') !== (string) ($detail['costArea'] ?? '')
                || (string) $op->status !== (string) $detail['status']
                || ! in_array($op->type, ['rent', 'advance'], true)
                || ! in_array($op->cost_area, ['base_rent', 'operating_costs', 'heating_costs', 'operating_and_heating', 'garage', 'parking'], true)
                || ! in_array($op->status, ['open', 'partial'], true)
                || $op->service_month?->format('Y-m') !== $detail['serviceMonth']
                || $op->due_date?->toDateString() !== $detail['dueDate']
                || (int) round((float) $op->amount * 100) !== (int) round((float) $detail['originalAmount'] * 100)
                || (int) round((float) $op->open_amount * 100) !== (int) round((float) $detail['openAmount'] * 100)) {
                throw ValidationException::withMessages([
                    'items' => 'OP-Art, Status, Betrag, Mietvertrag, Leistungsmonat oder Fälligkeit haben sich geändert. Bitte erneut prüfen.',
                ]);
            }
        }
    }

    /**
     * A valid preview token must never silently approve a newly competing
     * payment from a different import page or an adjacent booking month.
     * Bound the peer scan, and fail closed when an identity has excessive
     * unresolved entries. Matching context remains the authority for OP month.
     *
     * @param array<string,mixed> $context
     */
    private function hasCompetingPendingPayment(Payment $payment, array $context): bool
    {
        if (count($context['contractIds']) !== 1) {
            return true;
        }

        $iban = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $payment->counterparty_iban) ?? '');
        $name = trim((string) $payment->counterparty_name);
        if ($iban === '' && $name === '') {
            return true;
        }

        $targetMonth = CarbonImmutable::parse($context['targetPeriod'].'-01')->startOfMonth();
        $key = implode('|', [$context['targetPeriod'], (string) $context['contractIds'][0], $iban, $name]);
        if (! array_key_exists($key, $this->peerPaymentsByIdentityAndPeriod)) {
            $peers = Payment::query()
                ->where('direction', 'credit')
                ->where('unallocated_amount', '>', 0.001)
                ->where('booking_date', '>=', $targetMonth->subMonths(2)->toDateString())
                ->where('booking_date', '<', $targetMonth->addMonths(3)->toDateString())
                ->where(function ($query) use ($iban, $name): void {
                    if ($iban !== '') {
                        $query->whereRaw("UPPER(REPLACE(REPLACE(counterparty_iban, ' ', ''), '-', '')) = ?", [$iban]);
                    }
                    if ($name !== '') {
                        $iban !== '' ? $query->orWhere('counterparty_name', $name)
                            : $query->where('counterparty_name', $name);
                    }
                })
                ->orderBy('id')
                ->limit(self::MAX_PEER_PAYMENTS + 1)
                ->get();

            $this->peerPaymentsByIdentityAndPeriod[$key] = $peers;
        }

        $peers = $this->peerPaymentsByIdentityAndPeriod[$key];
        if ($peers->count() > self::MAX_PEER_PAYMENTS) {
            return true;
        }

        foreach ($peers as $other) {
            if ((string) $other->id === (string) $payment->id) {
                continue;
            }
            $otherContext = $this->context->context($other, true);
            if ($otherContext['targetPeriod'] === $context['targetPeriod']
                && in_array($context['contractIds'][0], $otherContext['contractIds'], true)) {
                return true;
            }
        }

        return false;
    }

    /** @return array<string,mixed> */
    private function project(Payment $payment, string $month, bool $includeCandidates = true): array
    {
        $remaining = round((float) $payment->unallocated_amount, 2);
        $context = $this->context->context($payment, true);
        $suggestions = $includeCandidates
            ? $this->candidates->candidates($payment, 'suggestions', '')['data']
                ->where('type', 'open-items')->values()
            : collect();

        // Include the full bounded candidate set so split payments display every
        // identifiable OP line in the review sheet (up to 20 safe OPs).
        $matches = $suggestions->take(20)->map(static function (array $candidate): array {
            $data = $candidate['attributes'] ?? [];
            return [
                'targetType' => $candidate['type'] === 'open-items' ? 'openItem' : 'incomingInvoice',
                'targetId' => (string) $candidate['id'],
                'number' => (string) ($data['number'] ?? ''),
                'description' => (string) ($data['description'] ?? ''),
                'partner' => (string) ($data['businessPartnerLabel'] ?? $data['supplierLabel'] ?? ''),
                'contract' => (string) ($data['contractNumber'] ?? ''),
                'contractId' => $candidate['type'] === 'open-items' ? (string) ($data['contractId'] ?? '') : null,
                'openAmount' => round((float) ($data['openAmount'] ?? 0), 2),
                'suggestedAmount' => round((float) ($data['recommendationAmount'] ?? 0), 2),
                'overpaymentAmount' => round((float) ($data['recommendationOverpaymentAmount'] ?? 0), 2),
                'reason' => (string) ($data['recommendationReason'] ?? $data['paymentMatchContext'] ?? ''),
            ];
        })->values()->all();

        $state = $payment->direction === 'debit' ? 'outgoing' : 'unmatched';
        $message = $payment->direction === 'debit'
            ? 'Ausgangszahlung: Rechnung oder Auszahlungsposten manuell bestätigen.'
            : 'Keine ausreichend eindeutige Zuordnung gefunden.';
        $automatic = [];
        $automaticDetails = [];
        $overpayment = 0.0;

        if ($payment->direction === 'credit' && $context['contractIds'] !== []) {
            $targetPeriod = $context['targetPeriod'];
            $openItems = OpenItem::query()
                ->whereIn('contract_id', $context['contractIds'])
                ->whereDate('service_month', $targetPeriod.'-01')
                ->whereIn('status', ['open', 'partial'])
                ->where('open_amount', '>', 0)
                ->whereNotIn('type', OpenItem::PAYOUT_TYPES)
                ->with('contract:id,contract_number')
                // The accounting preview follows meaningful due-date/OP
                // order instead of unpredictable UUID order; the same
                // deterministic order is used in the booking token.
                ->orderBy('due_date')->orderBy('number')->orderBy('id')->limit(21)
                ->get(['id', 'contract_id', 'number', 'description', 'type', 'cost_area', 'status', 'service_month', 'due_date', 'amount', 'open_amount']);

            $targetSum = round($openItems->sum(fn (OpenItem $op): float => (float) $op->open_amount), 2);
            $paidOverpayment = collect($matches)->sum(static fn (array $row): float => (float) $row['overpaymentAmount']);
            $overpayment = $targetSum > 0 ? max(0.0, round($remaining - $targetSum, 2))
                : ($paidOverpayment > 0.001 ? $remaining : 0.0);
            $state = $openItems->isEmpty()
                ? ($paidOverpayment > 0.001 ? 'overpayment' : 'missing_op')
                : ($remaining > $targetSum + 0.001 ? 'overpayment'
                : ($remaining < $targetSum - 0.001 ? 'partial' : 'review'));

            $message = match ($state) {
                'missing_op' => 'Zum erkannten Vertrag und Zielmonat fehlt ein offener Posten.',
                'overpayment' => $openItems->isEmpty()
                    ? 'Passender OP ist bereits ausgeglichen. Erneuten Eingang als Überzahlung prüfen.'
                    : 'Zahlung übersteigt die erkannten OPs. Überzahlung ausdrücklich prüfen.',
                'partial' => 'Zahlung deckt die OPs nur teilweise. Aufteilung prüfen.',
                default => 'Treffer vorhanden. Identität, Zeitraum und Beträge prüfen.',
            };

            // Only independent, strong historical or explicit-period evidence
            // may enter the one-click batch. Booking-month fallbacks never do.
            // A day-of-month pattern is a manual suggestion, never a certificate.
            // Different leases of the same payer are financially distinct;
            // nonrecurring items such as deposits/settlements require explicit
            // confirmation even when their aggregate amount happens to match.
            $singleContract = count($context['contractIds']) === 1;
            // A mistyped deposit/settlement with type=rent is still not a safe
            // recurring claim. Both the OP type and its accounting cost area
            // must identify regular rent, utilities or an associated parking lease.
            $recurringCostAreas = ['base_rent', 'operating_costs', 'heating_costs', 'operating_and_heating', 'garage', 'parking'];
            $recurring = $openItems->filter(static fn (OpenItem $op): bool =>
                in_array($op->type, ['rent', 'advance'], true)
                && in_array($op->cost_area, $recurringCostAreas, true))->values();
            $onlyRecurringRent = $recurring->count() === $openItems->count();
            $paymentText = Str::ascii(mb_strtolower(implode(' ', array_filter([
                $payment->purpose, $payment->booking_text,
            ])), 'UTF-8'));
            // Never treat a bank entry expressly naming a deposit or a one-off
            // settlement as a recurring rent payment just because its amount
            // happens to equal this month's rent.
            $oneOffReference = preg_match('/kaution|deposit|abrechnung|nachzahlung|ruckzahlung|rueckzahlung|erstattung|sonderzahlung|schaden|storno|fehlbuchung|umbuchung|(?:keine?|nicht|ohne)\\s+(?:laufende\\s+)?miete/u', $paymentText) === 1;
            $explicitRecurringReference = preg_match('/miete|nebenkosten|betriebskosten|heizkosten|rent/u', $paymentText) === 1;
            // A generic bank reference like "Rechnung 2026-10" is not proof
            // that the date is a rent service month. The month in bank text
            // becomes automatic evidence only with an explicit rent-related
            // description or the exact confirmed contract number.
            $linkedContractNumber = $singleContract
                ? (string) ($context['linkedContracts'][0]['number'] ?? '') : '';
            $contractReference = Str::ascii(mb_strtolower($linkedContractNumber, 'UTF-8'));
            // A contract number must be a whole token, never a substring
            // inside a longer bank reference. A purely numeric number needs
            // an explicit contract label so a coincidentally equal account/
            // transfer reference cannot authorize a rent booking.
            $contractMentioned = $contractReference !== ''
                && preg_match('/(?<![a-z0-9])'.preg_quote($contractReference, '/').'(?![a-z0-9])/u', $paymentText) === 1;
            $explicitContractReference = $contractMentioned
                && (preg_match('/[a-z]/', $contractReference) === 1
                    || preg_match('/\\b(?:mietvertrag|vertrag|mv)\\b/u', $paymentText) === 1);
            $trustedPeriod = $context['targetPeriodSource'] === 'confirmed_history'
                || ($context['targetPeriodSource'] === 'payment_text'
                    && ($explicitRecurringReference || $explicitContractReference));
            // A normal monthly rent can coexist with a separate deposit or
            // settlement OP. If the bank text says "Miete" and the payment
            // exactly covers ALL recurring OPs, leave one-off OPs untouched.
            $rentOnlyAmongOtherDebts = ! $onlyRecurringRent && ! $oneOffReference
                && $explicitRecurringReference && $recurring->isNotEmpty()
                && abs($remaining - round($recurring->sum(fn (OpenItem $op): float => (float) $op->open_amount), 2)) <= 0.001;
            $autoTargets = $rentOnlyAmongOtherDebts ? $recurring : $openItems;
            // A bounded *ranking* search can omit a valid OP with an unusually
            // early/late due date. The direct contract+service-month OP read,
            // not a candidate-window hit, establishes the accounting target.
            // A receipt that has already been partly allocated must never
            // be auto-certified again: an operator may have deliberately
            // reduced its previous booking and left a rest for manual review.
            // Do not confuse this with a partially settled OP, which can
            // still be a valid automatic target for a fresh bank receipt.
            $untouchedPayment = abs($remaining - round((float) $payment->amount, 2)) <= 0.001;
            if ($untouchedPayment && in_array($context['identitySource'], ['iban', 'confirmed_history'], true)
                && $trustedPeriod && $singleContract && ! $oneOffReference
                && ($onlyRecurringRent || $rentOnlyAmongOtherDebts)
                && $autoTargets->isNotEmpty() && $autoTargets->count() <= 20
                && abs($remaining - round($autoTargets->sum(fn (OpenItem $op): float => (float) $op->open_amount), 2)) <= 0.001) {
                if ($this->hasCompetingPendingPayment($payment, $context)) {
                    $state = 'review';
                    $message = 'Weitere ungeklärte Zahlungen desselben Mieters beanspruchen möglicherweise dieselben OPs. Bitte den Verlauf vergleichen.';
                } else {
                    $automatic = $autoTargets->map(static fn (OpenItem $op): array => [
                        'targetType' => 'openItem',
                        'targetId' => (string) $op->id,
                        'amount' => round((float) $op->open_amount, 2),
                    ])->all();
                    // The review surface receives the *same* certified OPs as
                    // the allocator, with the original due dates and nominal amounts.
                    // No extra candidate/history request or N+1 lookup is necessary.
                    $automaticDetails = $autoTargets->map(static fn (OpenItem $op): array => [
                        'targetId' => (string) $op->id,
                        'number' => (string) $op->number,
                        'description' => (string) $op->description,
                        'type' => (string) $op->type,
                        'costArea' => $op->cost_area,
                        'status' => (string) $op->status,
                        'contractId' => (string) $op->contract_id,
                        'contractNumber' => (string) ($op->contract?->contract_number ?? ''),
                        'serviceMonth' => $op->service_month?->format('Y-m'),
                        'dueDate' => $op->due_date?->toDateString(),
                        'originalAmount' => round((float) $op->amount, 2),
                        'openAmount' => round((float) $op->open_amount, 2),
                        'amount' => round((float) $op->open_amount, 2),
                    ])->values()->all();
                    $state = 'ready';
                    $evidence = $context['identitySource'] === 'confirmed_history'
                        ? 'Bestätigte Zahlungshistorie' : 'Hinterlegte Mieter-IBAN';
                    $message = $evidence.', Zielmonat und '.count($automatic).' OP(s) mit exakt passendem Gesamtbetrag.';

                    // The preview must render EVERY OP that the command will
                    // actually book, even if the ranking service returned it in
                    // positions 21–25 outside the first display candidates.
                    foreach ($autoTargets as $op) {
                        if (collect($matches)->contains(static fn (array $candidate): bool => $candidate['targetType'] === 'openItem'
                            && $candidate['targetId'] === (string) $op->id)) {
                            continue;
                        }
                        $matches[] = [
                            'targetType' => 'openItem',
                            'targetId' => (string) $op->id,
                            'number' => (string) $op->number,
                            'description' => (string) $op->description,
                            'partner' => '',
                            'contract' => (string) ($op->contract?->contract_number ?? ''),
                            'contractId' => (string) $op->contract_id,
                            'openAmount' => round((float) $op->open_amount, 2),
                            'suggestedAmount' => round((float) $op->open_amount, 2),
                            'overpaymentAmount' => 0.0,
                            'reason' => 'Eindeutige OP-Zuordnung für den Buchungslauf.',
                        ];
                    }
                }
            } elseif ($context['identitySource'] === 'conflicting_history') {
                $message = 'Diese Bank-IBAN wurde bereits für einen anderen Mietvertrag gebucht. Bitte den Vertrag prüfen. '.$message;
            } elseif ($openItems->isNotEmpty() && ! $singleContract) {
                // Keep a true overpayment/partial-payment state; the additional
                // ambiguity explains why automatic posting remains forbidden.
                $message = 'Mehrere aktive Mietverträge gehören zum Zahler. Bitte den passenden Vertrag bestätigen. '.$message;
            } elseif ($openItems->isNotEmpty() && ! $onlyRecurringRent) {
                $message = 'Im Zielmonat bestehen auch Kautions-, Abrechnungs- oder sonstige OPs. Bitte manuell prüfen. '.$message;
            }
        } elseif ($payment->direction === 'credit' && $matches !== []) {
            $state = 'review';
            $message = 'Kandidaten gefunden, aber keine bestätigte Vertragsidentität.';
        }

        if ($payment->direction === 'credit'
            && abs($remaining - round((float) $payment->amount, 2)) > 0.001) {
            // Any already posted share remains untouched. Preserve the
            // original manual-case classification (e.g. overpayment/partial),
            // but never upgrade the remaining receipt to an automatic plan.
            $automatic = [];
            $automaticDetails = [];
            $message = 'Zahlung ist bereits teilweise zugeordnet. Verbleibenden Betrag bitte manuell prüfen. '.$message;
        }

        // Approval means the operator has reviewed both sides of the booking:
        // the precise bank receipt and every resulting OP entry. A changed
        // payer, purpose, booking date, original amount, lease reference or
        // imported statement must invalidate the existing month snapshot.
        $approvalToken = $state === 'ready' ? hash('sha256', json_encode([
            $month, (string) $payment->id,
            $payment->booking_date?->toDateString(),
            $payment->value_date?->toDateString(),
            (string) $payment->bank_statement_id,
            (string) $payment->number,
            (string) $payment->counterparty_name,
            (string) $payment->counterparty_iban,
            (string) $payment->purpose,
            (string) $payment->booking_text,
            round((float) $payment->amount, 2), $remaining,
            $context['identitySource'], $context['linkedContracts'],
            $context['targetPeriod'], $context['targetPeriodSource'],
            $automatic, $automaticDetails,
        ], JSON_THROW_ON_ERROR)) : null;

        return [
            'id' => (string) $payment->id,
            'number' => $payment->number,
            'bookingDate' => $payment->booking_date?->toDateString(),
            'valueDate' => $payment->value_date?->toDateString(),
            'counterpartyName' => $payment->counterparty_name,
            'counterpartyIban' => $payment->counterparty_iban,
            'purpose' => $payment->purpose ?: $payment->booking_text,
            'statementFileName' => $payment->bankStatement?->file_name,
            'bankStatementId' => (string) $payment->bank_statement_id,
            'direction' => $payment->direction,
            'amount' => round((float) $payment->amount, 2),
            'remaining' => $remaining,
            'targetPeriod' => $context['targetPeriod'],
            'targetPeriodSource' => $context['targetPeriodSource'],
            'identitySource' => $context['identitySource'],
            'linkedContracts' => $context['linkedContracts'],
            'state' => $state,
            'message' => $message,
            'overpayment' => $overpayment,
            'candidates' => $matches,
            'automaticAllocations' => $automatic,
            'automaticAllocationDetails' => $automaticDetails,
            'approvalToken' => $approvalToken,
        ];
    }
}
