<?php

namespace App\Http\Controllers\Api\Contracts;

use App\Http\Controllers\Controller;
use App\Models\Contract;
use App\Models\ContractDeposit;
use App\Models\ContractDepositInstallment;
use App\Models\OpenItem;
use App\Services\Contracts\ContractDepositInterestCalculator;
use App\Services\Contracts\ContractDepositLedgerService;
use Carbon\CarbonImmutable;
use App\Models\Receivable;
use App\Services\Contracts\ContractDepositService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class ContractDepositController extends Controller
{
    public function show(Contract $contract, ContractDepositService $service): JsonResponse
    {
        $this->authorize('view', $contract);
        $deposit = ContractDeposit::query()
            ->where('contract_id', $contract->id)
            ->first();

        return response()->json($this->payload($deposit, $service), 200, [
            'Cache-Control' => 'private, no-store',
        ]);
    }

    public function update(Request $request, Contract $contract, ContractDepositService $service): JsonResponse
    {
        $this->authorize('update', $contract);
        $values = $request->validate([
            'agreedAmount' => ['required', 'numeric', 'gt:0'],
            'currency' => ['sometimes', 'string', 'size:3'],
            'dueFrom' => ['nullable', 'date'],
            'installmentCount' => ['required', 'integer', 'between:1,12'],
            'custodyType' => ['nullable', 'string', 'max:50'],
            'reference' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:10000'],
            'interestRelevant' => ['required', 'boolean'],
            'interestAmount' => ['nullable', 'numeric', 'min:0'],
            'legacyInterestAmount' => ['nullable', 'numeric', 'min:0'],
            'custodyBankAccountId' => ['nullable', 'uuid', 'exists:business_partner_bank_accounts,id'],
            'segregatedOn' => ['nullable', 'date_format:Y-m-d'],
            'custodyEvidenceReference' => ['nullable', 'string', 'max:255'],
            'securityProvider' => ['nullable', 'string', 'max:255'],
            'securityPolicyNumber' => ['nullable', 'string', 'max:255'],
            'securityReceivedOn' => ['nullable', 'date_format:Y-m-d'],
            'securityValidUntil' => ['nullable', 'date_format:Y-m-d'],
            'securityEvidenceReference' => ['nullable', 'string', 'max:255'],
            'securityReleasedOn' => ['nullable', 'date_format:Y-m-d'],
            'plannedRefundOn' => ['nullable', 'date'],
        ]);

        $deposit = $service->save($contract, $values);

        return response()->json($this->payload($deposit, $service));
    }

    public function generateReceivables(Contract $contract, ContractDeposit $deposit, ContractDepositService $service): JsonResponse
    {
        $this->authorize('update', $contract);
        $this->assertDepositBelongsToContract($contract, $deposit);
        $deposit = $service->generateReceivables($deposit, auth()->id());

        return response()->json($this->payload($deposit, $service));
    }

    public function settle(Request $request, Contract $contract, ContractDeposit $deposit, ContractDepositService $service): JsonResponse
    {
        $this->authorize('update', $contract);
        $this->assertDepositBelongsToContract($contract, $deposit);
        $values = $request->validate([
            'operationId' => ['required', 'uuid'],
            'dueOn' => ['required', 'date'],
            'payoutAmount' => ['required', 'numeric', 'min:0'],
            'retainedAmount' => ['required', 'numeric', 'min:0'],
            'retentionReason' => ['nullable', 'string', 'max:5000'],
            'notes' => ['nullable', 'string', 'max:10000'],
        ]);

        $deposit = $service->createSettlement($deposit, $values, auth()->id());

        return response()->json($this->payload($deposit, $service));
    }

    public function updateSettlement(
        Request $request,
        Contract $contract,
        ContractDeposit $deposit,
        Receivable $settlement,
        ContractDepositService $service,
    ): JsonResponse {
        $this->authorize('update', $contract);
        $this->assertDepositBelongsToContract($contract, $deposit);
        $values = $request->validate([
            'dueOn' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'notes' => ['nullable', 'string', 'max:10000'],
        ]);

        $deposit = $service->updateSettlement($deposit, $settlement, $values, auth()->id());

        return response()->json($this->payload($deposit, $service));
    }

    public function destroyReceivable(
        Contract $contract,
        ContractDeposit $deposit,
        Receivable $receivable,
        ContractDepositService $service,
    ): JsonResponse {
        $this->authorize('delete', $contract);
        $this->assertDepositBelongsToContract($contract, $deposit);

        // Validate and delete under the same locks: another request must not
        // allocate a payment after we check the balance but before deletion.
        DB::transaction(function () use ($contract, $deposit, $receivable): void {
            $installment = ContractDepositInstallment::query()
                ->where('contract_deposit_id', $deposit->id)
                ->where('contract_id', $contract->id)
                ->where('receivable_id', $receivable->id)
                ->lockForUpdate()
                ->first();
            $lockedReceivable = Receivable::query()->lockForUpdate()->findOrFail($receivable->id);

            if (! $installment
                || (string) $lockedReceivable->contract_id !== (string) $contract->id
                || $lockedReceivable->cost_area !== 'deposit'
                || ! in_array($lockedReceivable->type, ['deposit', 'deposit_installment'], true)) {
                throw ValidationException::withMessages([
                    'receivable' => 'Nur eine Kautionsrate dieser Vereinbarung kann hier gelöscht werden.',
                ]);
            }

            $lockedReceivable->loadCount('allocations');
            if ($lockedReceivable->allocations_count > 0) {
                throw ValidationException::withMessages([
                    'receivable' => 'Der offene Posten kann nicht gelöscht werden, weil bereits Zahlungsbuchungen darauf verweisen.',
                ]);
            }

            $installment->update(['receivable_id' => null, 'status' => 'open']);
            $lockedReceivable->delete();
        }, 3);

        $deposit = $service->refresh($deposit);

        return response()->json($this->payload($deposit, $service));
    }

    public function eligibleOpenItems(Request $request, Contract $contract, ContractDeposit $deposit): JsonResponse
    {
        $this->authorize('view', $contract);
        $this->assertDepositBelongsToContract($contract, $deposit);
        $input = $request->validate(['effectiveOn' => ['sometimes', 'date_format:Y-m-d']]);
        $effectiveOn = $input['effectiveOn'] ?? today()->toDateString();

        $rows = OpenItem::query()->where('contract_id', $contract->id)
            ->whereIn('type', ['settlement', 'damages', 'rent', 'advance', 'other'])
            ->where('cost_area', '!=', 'deposit')
            ->whereNotIn('status', ['cancelled', 'canceled'])
            ->whereDate('due_date', '<=', $effectiveOn)
            ->where('open_amount', '>', 0)
            ->orderBy('due_date')->limit(100)
            ->get(['id', 'number', 'description', 'type', 'due_date', 'open_amount']);

        return response()->json(['data' => $rows->map(static fn (OpenItem $row): array => [
            'id' => (string) $row->id,
            'number' => $row->number,
            'description' => $row->description,
            'type' => $row->type,
            'dueOn' => $row->due_date?->toDateString(),
            'openAmount' => (float) $row->open_amount,
        ])->all()], 200, ['Cache-Control' => 'private, no-store']);
    }

    public function addInterestRate(Request $request, Contract $contract, ContractDeposit $deposit, ContractDepositLedgerService $ledger, ContractDepositService $service): JsonResponse
    {
        $this->authorize('update', $contract);
        $this->assertDepositBelongsToContract($contract, $deposit);
        $values = $request->validate([
            'effectiveFrom' => ['required', 'date_format:Y-m-d'],
            'annualRatePercent' => ['required', 'numeric', 'between:0,100'],
            'reference' => ['nullable', 'string', 'max:255'],
        ]);
        return response()->json($this->payload($ledger->addRate($deposit, $values), $service));
    }

    public function recordInterest(Request $request, Contract $contract, ContractDeposit $deposit, ContractDepositLedgerService $ledger, ContractDepositService $service): JsonResponse
    {
        $this->authorize('update', $contract);
        $this->assertDepositBelongsToContract($contract, $deposit);
        $values = $request->validate([
            'operationId' => ['required', 'uuid'],
            'effectiveOn' => ['required', 'date_format:Y-m-d'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'reference' => ['required', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:10000'],
        ]);
        return response()->json($this->payload($ledger->recordInterest($deposit, $values), $service));
    }

    public function applyRetention(Request $request, Contract $contract, ContractDeposit $deposit, ContractDepositLedgerService $ledger, ContractDepositService $service): JsonResponse
    {
        $this->authorize('update', $contract);
        $this->assertDepositBelongsToContract($contract, $deposit);
        $values = $request->validate([
            'operationId' => ['required', 'uuid'],
            'retentionId' => ['required', 'uuid'],
            'targetOpenItemId' => ['required', 'uuid'],
            'effectiveOn' => ['required', 'date_format:Y-m-d'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'notes' => ['nullable', 'string', 'max:10000'],
        ]);
        return response()->json($this->payload($ledger->applyRetention($deposit, $values), $service));
    }

    public function releaseRetention(Request $request, Contract $contract, ContractDeposit $deposit, ContractDepositLedgerService $ledger, ContractDepositService $service): JsonResponse
    {
        $this->authorize('update', $contract);
        $this->assertDepositBelongsToContract($contract, $deposit);
        $values = $request->validate([
            'operationId' => ['required', 'uuid'],
            'retentionId' => ['required', 'uuid'],
            'effectiveOn' => ['required', 'date_format:Y-m-d'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'notes' => ['nullable', 'string', 'max:10000'],
        ]);
        return response()->json($this->payload($ledger->releaseRetention($deposit, $values), $service));
    }

    /** @return array{data:?array<string,mixed>,summary:array<string,float|int>} */
    private function payload(?ContractDeposit $deposit, ContractDepositService $service): array
    {
        if (! $deposit) {
            return [
                'data' => null,
                'summary' => [
                    'agreed' => 0, 'requested' => 0, 'paid' => 0, 'open' => 0, 'available' => 0,
                    'refundCommitted' => 0, 'refundOpen' => 0, 'refunded' => 0, 'retained' => 0,
                    'remainingToAllocate' => 0, 'remainingToRefund' => 0, 'released' => 0, 'offset' => 0,
                ],
            ];
        }

        // A GET (and the response after a mutation) is a read, never a second
        // command. Read the complete current ledger without updating timestamps
        // or issuing two expensive refreshes per response.
        // Rehydrate only the fields needed for this read, replacing potentially
        // large cached payment-allocation collections after a write operation.
        // Counts stay accurate without materializing every allocation history row.
        $deposit->load([
            'installments.receivable' => fn ($query) => $query->withCount('allocations'),
            'receivables' => fn ($query) => $query->withCount('allocations'),
            'custodyBankAccount',
            'events',
            'interestRates',
        ]);
        $summary = $service->readSummaryFromLoaded($deposit);
        $refunds = $deposit->receivables->where('type', 'deposit_refund');
        $refundedOn = $refunds->where('status', 'paid')
            ->max(fn (Receivable $row) => $row->settled_at?->toDateString());
        $retentionReason = $deposit->receivables->where('type', 'retention')
            ->sortByDesc('created_at')->first()?->notes;
        $projection = app(ContractDepositInterestCalculator::class)->calculate($deposit, CarbonImmutable::today());

        // Index event dependencies once, not separately for every settlement.
        $reserveEvents = $deposit->events->whereIn('event_type', ['retention_offset', 'retention_release']);
        $reserveUsedById = $reserveEvents->groupBy('retention_receivable_id')
            ->map(static fn ($events): float => round((float) $events->sum('amount'), 2));
        $protectedSettlementIds = $deposit->events->flatMap(static fn ($event): array => [
            $event->retention_receivable_id,
            $event->target_receivable_id,
        ])->filter()->map(static fn ($id): string => (string) $id)->flip();

        return [
            'data' => [
                'id' => (string) $deposit->id,
                'contractId' => (string) $deposit->contract_id,
                'agreedAmount' => (float) $deposit->agreed_amount,
                'currency' => (string) $deposit->currency,
                'dueFrom' => $deposit->due_from?->toDateString(),
                'installmentCount' => (int) $deposit->installment_count,
                'installmentAmount' => (float) $deposit->installment_amount,
                'status' => (string) $summary['status'],
                'custodyType' => $deposit->custody_type,
                'reference' => $deposit->reference,
                'notes' => $deposit->notes,
                'interestRelevant' => (bool) $deposit->interest_relevant,
                'interestAmount' => (float) $deposit->interest_amount,
                'legacyInterestAmount' => (float) $deposit->legacy_interest_amount,
                'releasedAmount' => $summary['released'],
                'offsetAmount' => $summary['offset'],
                'custodyBankAccountId' => $deposit->custody_bank_account_id,
                'custodyBankAccountLabel' => $deposit->custodyBankAccount
                    ? trim($deposit->custodyBankAccount->account_holder.' · '.$deposit->custodyBankAccount->bank_name) : null,
                'segregatedOn' => $deposit->segregated_on?->toDateString(),
                'custodyEvidenceReference' => $deposit->custody_evidence_reference,
                'securityProvider' => $deposit->security_provider,
                'securityPolicyNumber' => $deposit->security_policy_number,
                'securityReceivedOn' => $deposit->security_received_on?->toDateString(),
                'securityValidUntil' => $deposit->security_valid_until?->toDateString(),
                'securityEvidenceReference' => $deposit->security_evidence_reference,
                'securityReleasedOn' => $deposit->security_released_on?->toDateString(),
                'interestProjection' => $projection,
                'interestRates' => $deposit->interestRates->map(static fn ($rate): array => [
                    'id' => (string) $rate->id,
                    'effectiveFrom' => $rate->effective_from?->toDateString(),
                    'annualRatePercent' => (float) $rate->annual_rate_percent,
                    'reference' => $rate->reference,
                ])->all(),
                'events' => $deposit->events->map(static fn ($event): array => [
                    'id' => (string) $event->id,
                    'type' => $event->event_type,
                    'amount' => (float) $event->amount,
                    'effectiveOn' => $event->effective_on?->toDateString(),
                    'retentionId' => $event->retention_receivable_id,
                    'targetOpenItemId' => $event->target_receivable_id,
                    'reference' => $event->reference,
                    'notes' => $event->notes,
                ])->all(),
                'plannedRefundOn' => $deposit->planned_refund_on?->toDateString(),
                'refundedOn' => $refundedOn,
                'refundedAmount' => $summary['refunded'],
                'retainedAmount' => $summary['retained'],
                'retentionReason' => $retentionReason,
                'installments' => $deposit->installments->map(static function (ContractDepositInstallment $row): array {
                    $receivable = $row->receivable;
                    $allocationCount = (int) ($receivable?->allocations_count ?? 0);

                    return [
                        'id' => (string) $row->id,
                        'installmentNumber' => (int) $row->installment_number,
                        'amount' => (float) $row->amount,
                        'dueDate' => $row->due_date?->toDateString(),
                        'status' => $receivable?->status ?? $row->status,
                        'receivableId' => $receivable?->id ? (string) $receivable->id : null,
                        'receivableNumber' => $receivable?->number,
                        'openAmount' => (float) ($receivable?->open_amount ?? $row->amount),
                        'allocationCount' => $allocationCount,
                        'canEdit' => $allocationCount === 0,
                        'canDelete' => $receivable !== null && $allocationCount === 0,
                    ];
                })->values()->all(),
                'settlements' => $deposit->receivables->map(static function (Receivable $row) use ($reserveUsedById, $protectedSettlementIds): array {
                    $allocationCount = (int) ($row->allocations_count ?? 0);
                    $hasLedgerDependency = $protectedSettlementIds->has((string) $row->id);
                    $reserveUsed = (float) $reserveUsedById->get((string) $row->id, 0);

                    return [
                        'id' => (string) $row->id,
                        'number' => (string) $row->number,
                        'direction' => (string) $row->direction,
                        'type' => (string) $row->type,
                        'description' => (string) $row->description,
                        'dueDate' => $row->due_date?->toDateString(),
                        'amount' => (float) $row->amount,
                        'openAmount' => (float) $row->open_amount,
                        'status' => (string) $row->status,
                        'settledAt' => $row->settled_at?->toDateString(),
                        'notes' => $row->notes,
                        'allocationCount' => $allocationCount,
                        'remainingReserve' => $row->type === 'retention'
                            ? round(max(0, (float) $row->amount - (float) $reserveUsed), 2)
                            : null,
                        'canEdit' => $allocationCount === 0 && ! $hasLedgerDependency,
                        'canDelete' => $allocationCount === 0 && ! $hasLedgerDependency,
                    ];
                })->values()->all(),
            ],
            'summary' => $summary,
        ];
    }

    private function assertDepositBelongsToContract(Contract $contract, ContractDeposit $deposit): void
    {
        abort_unless((string) $deposit->contract_id === (string) $contract->id, 404);
    }
}
