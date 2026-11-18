<?php

namespace App\Services\Contracts;

use App\Models\Contract;
use App\Models\ContractDeposit;
use App\Models\ContractDepositInstallment;
use App\Models\BusinessPartnerBankAccount;
use App\Models\OpenItem;
use App\Models\Receivable;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ContractDepositService
{
    public function save(Contract $contract, array $values): ContractDeposit
    {
        return DB::transaction(function () use ($contract, $values): ContractDeposit {
            $deposit = ContractDeposit::query()->withTrashed()->where('contract_id', $contract->id)->lockForUpdate()->first();
            if ($deposit?->trashed()) $deposit->restore();
            $deposit ??= new ContractDeposit(['contract_id' => $contract->id]);
            $custody = $values['custodyType'] ?? null;
            if ($custody !== null && ! in_array($custody, ContractDeposit::CUSTODY_TYPES, true)) {
                throw ValidationException::withMessages(['custodyType' => 'Unbekannte Art der Mietsicherheit.']);
            }
            $nonCash = in_array($custody, ContractDeposit::NON_CASH_TYPES, true);
            if ($nonCash && ($deposit->installments()->whereNotNull('receivable_id')->exists()
                || $deposit->receivables()->exists())) {
                throw ValidationException::withMessages(['custodyType' => 'Eine bereits gebuchte Geldkaution kann nicht nachträglich in eine Bürgschaft umgewandelt werden.']);
            }
            $posted = (float) $deposit->events()->where('event_type', 'interest_credit')->sum('amount');
            if (($nonCash || ! ($values['interestRelevant'] ?? false)) && $posted > 0.001) {
                throw ValidationException::withMessages(['interestRelevant' => 'Bereits gebuchte Bankzinsen dürfen nicht nachträglich deaktiviert werden.']);
            }
            if ($contract->contract_type === 'residential_lease') {
                if (($values['dueFrom'] ?? null) && $contract->starts_on
                    && CarbonImmutable::parse($values['dueFrom'])->lt($contract->starts_on)) {
                    throw ValidationException::withMessages(['dueFrom' => 'Die erste Kautionsrate wird frühestens zu Beginn des Mietverhältnisses fällig (§ 551 Abs. 2 BGB).']);
                }
                // Only initial/changed agreements are checked; historic Kautionsakten
                // must remain editable after rent increases without retroactive limits.
                if (! $deposit->exists || abs((float) $deposit->agreed_amount - (float) $values['agreedAmount']) > 0.001) {
                    $initial = $contract->starts_on ? $contract->conditionAt($contract->starts_on) : null;
                    // § 551 uses only the net residential rent, not garage/parking or
                    // operating/heating advances. Never use current, increased rent.
                    $netRent = $initial && $initial->payment_interval === 'monthly'
                        ? (float) $initial->base_rent_amount : 0.0;
                    if ($netRent > 0 && (float) $values['agreedAmount'] > round(3 * $netRent, 2) + 0.001) {
                        throw ValidationException::withMessages(['agreedAmount' => 'Die vereinbarte Wohnraumkaution darf drei anfängliche Nettokaltmieten nicht übersteigen (§ 551 BGB).']);
                    }
                }
            }
            $bankId = $nonCash ? null : ($values['custodyBankAccountId'] ?? null);
            if ($bankId) {
                $bank = BusinessPartnerBankAccount::query()->find($bankId);
                if (! $bank || $bank->purpose !== 'deposit' || $contract->parties()->whereIn('party_role', ['tenant', 'co_tenant'])->where('business_partner_id', $bank->business_partner_id)->exists()) {
                    throw ValidationException::withMessages(['custodyBankAccountId' => 'Bitte ein gesondertes Kautionskonto beim verwahrenden Geschäftspartner auswählen, nicht das Konto eines Mieters.']);
                }
            }
            $legacy = $nonCash ? 0.0 : round((float) ($values['legacyInterestAmount'] ?? $values['interestAmount'] ?? $deposit->legacy_interest_amount ?? 0), 2);
            $deposit->fill([
                'agreed_amount' => $values['agreedAmount'],
                'currency' => $values['currency'] ?? 'EUR',
                'due_from' => $values['dueFrom'] ?? null,
                'installment_count' => $values['installmentCount'] ?? 1,
                'custody_type' => $custody,
                'custody_bank_account_id' => $bankId,
                'segregated_on' => $nonCash ? null : ($values['segregatedOn'] ?? null),
                'custody_evidence_reference' => $nonCash ? null : ($values['custodyEvidenceReference'] ?? null),
                'security_provider' => $nonCash ? ($values['securityProvider'] ?? null) : null,
                'security_policy_number' => $nonCash ? ($values['securityPolicyNumber'] ?? null) : null,
                'security_received_on' => $nonCash ? ($values['securityReceivedOn'] ?? null) : null,
                'security_valid_until' => $nonCash ? ($values['securityValidUntil'] ?? null) : null,
                'security_evidence_reference' => $nonCash ? ($values['securityEvidenceReference'] ?? null) : null,
                'security_released_on' => $nonCash ? ($values['securityReleasedOn'] ?? null) : null,
                'reference' => $values['reference'] ?? null,
                'notes' => $values['notes'] ?? null,
                'interest_relevant' => $nonCash ? false : ($values['interestRelevant'] ?? false),
                'legacy_interest_amount' => $legacy,
                'interest_amount' => $nonCash ? 0 : round($legacy + $posted, 2),
                'planned_refund_on' => $values['plannedRefundOn'] ?? null,
            ]);
            $deposit->installment_amount = round((float) $deposit->agreed_amount / max(1, (int) $deposit->installment_count), 2);
            $deposit->save();
            if ($nonCash) {
                $deposit->installments()->whereNull('receivable_id')->delete();
            } else {
                $this->rebuildInstallments($deposit);
            }
            $deposit->load(['installments.receivable', 'receivables.allocations']);

            $requested = (float) $deposit->installments->sum(fn (ContractDepositInstallment $row) => (float) ($row->receivable?->amount ?? 0));
            $open = (float) $deposit->installments->sum(fn (ContractDepositInstallment $row) => (float) ($row->receivable?->open_amount ?? 0));
            $paid = round($requested - $open, 2);
            $available = round($paid + (float) $deposit->interest_amount, 2);
            $committed = round((float) $deposit->receivables
                ->whereIn('type', ['deposit_refund', 'retention'])
                ->sum('amount'), 2);

            if ($committed > $available + 0.001) {
                throw ValidationException::withMessages([
                    'agreedAmount' => 'Die Vereinbarung kann nicht so geändert werden, dass bereits disponierte Rückzahlungen und Einbehalte die verfügbare Kaution übersteigen.',
                ]);
            }

            return $this->refresh($deposit);
        }, 3);
    }

    public function generateReceivables(ContractDeposit $deposit, ?string $userId): ContractDeposit
    {
        return DB::transaction(function () use ($deposit): ContractDeposit {
            $deposit = ContractDeposit::query()
                ->with(['contract', 'installments.receivable.allocations'])
                ->lockForUpdate()
                ->findOrFail($deposit->id);
            if (! $deposit->isCashSecurity()) {
                throw ValidationException::withMessages(['custodyType' => 'Eine Bürgschaft oder verpfändete Sicherheit erzeugt keine Geldkautionsforderung.']);
            }

            foreach ($deposit->installments as $installment) {
                if ($installment->receivable_id) continue;
                if (! $installment->due_date) {
                    throw ValidationException::withMessages(['dueFrom' => 'Vor der Forderungserzeugung muss ein Fälligkeitsbeginn hinterlegt sein.']);
                }

                $key = "contract-deposit:{$deposit->id}:installment:{$installment->installment_number}";
                $attributes = [
                    'contract_id' => $deposit->contract_id,
                    'type' => $deposit->installment_count > 1 ? 'deposit_installment' : 'deposit',
                    'cost_area' => 'deposit',
                    'description' => $deposit->installment_count > 1 ? "Kaution Rate {$installment->installment_number} von {$deposit->installment_count}" : 'Mietkaution',
                    'service_month' => CarbonImmutable::parse($installment->due_date)->startOfMonth()->toDateString(),
                    'due_date' => $installment->due_date,
                    'amount' => $installment->amount,
                    'open_amount' => $installment->amount,
                    'status' => 'open',
                    'notes' => $deposit->reference ? "Kautionsreferenz: {$deposit->reference}" : null,
                ];
                $receivable = Receivable::withTrashed()->where('idempotency_key', $key)->first();
                if ($receivable) {
                    if ($receivable->trashed()) $receivable->restore();
                    $receivable->fill($attributes);
                    $receivable->save();
                } else {
                    $receivable = Receivable::query()->create(['idempotency_key' => $key, 'number' => $this->nextReceivableNumber('debit')] + $attributes);
                }
                $installment->update(['receivable_id' => $receivable->id, 'status' => 'generated']);
            }

            return $this->refresh($deposit);
        }, 3);
    }

    /** @param array{operationId:string,dueOn:string,payoutAmount:float|int|string,retainedAmount:float|int|string,retentionReason?:string|null,notes?:string|null} $values */
    public function createSettlement(ContractDeposit $deposit, array $values, ?string $userId): ContractDeposit
    {
        return DB::transaction(function () use ($deposit, $values): ContractDeposit {
            $deposit = ContractDeposit::query()
                ->with(['contract', 'installments.receivable.allocations', 'receivables.allocations'])
                ->lockForUpdate()
                ->findOrFail($deposit->id);

            if (! $deposit->isCashSecurity()) {
                throw ValidationException::withMessages(['custodyType' => 'Eine externe Mietsicherheit wird durch Urkundenfreigabe abgewickelt, nicht durch Auszahlung.']);
            }
            $payout = round((float) $values['payoutAmount'], 2);
            $retention = round((float) $values['retainedAmount'], 2);
            if ($payout <= 0 && $retention <= 0) {
                throw ValidationException::withMessages(['payoutAmount' => 'Erfassen Sie eine Auszahlung oder einen Einbehalt größer als 0,00 €.']);
            }
            if ($retention > 0 && blank($values['retentionReason'] ?? null)) {
                throw ValidationException::withMessages(['retentionReason' => 'Bitte begründen Sie den Einbehalt.']);
            }

            $operationId = $values['operationId'];
            $dueOn = CarbonImmutable::parse($values['dueOn'])->toDateString();
            $notes = filled($values['notes'] ?? null) ? trim((string) $values['notes']) : null;
            $prefix = "contract-deposit:{$deposit->id}:settlement:{$operationId}:";
            $existingPayout = $deposit->receivables->first(
                fn (Receivable $item): bool => (string) $item->idempotency_key === $prefix.'payout',
            );
            $existingRetention = $deposit->receivables->first(
                fn (Receivable $item): bool => (string) $item->idempotency_key === $prefix.'retention',
            );

            if ($existingPayout || $existingRetention) {
                // A retry of the SAME business operation is idempotent. A new
                // payload must never silently reuse an already recorded operation.
                $expectedRetentionNote = $retention > 0
                    ? trim((string) $values['retentionReason'].($notes ? "\n{$notes}" : ''))
                    : null;
                if (($payout > 0) !== (bool) $existingPayout
                    || ($retention > 0) !== (bool) $existingRetention
                    || ($existingPayout && (abs((float) $existingPayout->amount - $payout) > 0.001
                        || $existingPayout->due_date?->toDateString() !== $dueOn
                        || (string) ($existingPayout->notes ?? '') !== (string) ($notes ?? '')))
                    || ($existingRetention && (abs((float) $existingRetention->amount - $retention) > 0.001
                        || $existingRetention->due_date?->toDateString() !== $dueOn
                        || (string) ($existingRetention->notes ?? '') !== (string) $expectedRetentionNote))) {
                    throw ValidationException::withMessages([
                        'operationId' => 'Die Vorgangskennung wurde bereits für eine andere Kautionsabwicklung verwendet.',
                    ]);
                }

                return $deposit;
            }

            $summary = $this->summary($deposit);
            if ($payout + $retention > $summary['remainingToAllocate'] + 0.001) {
                throw ValidationException::withMessages([
                    'payoutAmount' => 'Auszahlung und Einbehalt übersteigen den noch nicht disponierten Kautionsbetrag.',
                ]);
            }

            if ($payout > 0) {
                Receivable::query()->firstOrCreate(
                    ['idempotency_key' => "contract-deposit:{$deposit->id}:settlement:{$operationId}:payout"],
                    [
                        'number' => $this->nextReceivableNumber('credit'),
                        'contract_id' => $deposit->contract_id,
                        'type' => 'deposit_refund',
                        'cost_area' => 'deposit',
                        'description' => 'Kautionsrückzahlung',
                        'service_month' => CarbonImmutable::parse($dueOn)->startOfMonth()->toDateString(),
                        'due_date' => $dueOn,
                        'amount' => $payout,
                        'open_amount' => $payout,
                        'status' => 'open',
                        'notes' => $notes,
                    ],
                );
            }

            if ($retention > 0) {
                Receivable::query()->firstOrCreate(
                    ['idempotency_key' => "contract-deposit:{$deposit->id}:settlement:{$operationId}:retention"],
                    [
                        'number' => $this->nextReceivableNumber('debit'),
                        'contract_id' => $deposit->contract_id,
                        'type' => 'retention',
                        'cost_area' => 'deposit',
                        'description' => 'Kautionseinbehalt',
                        'service_month' => CarbonImmutable::parse($dueOn)->startOfMonth()->toDateString(),
                        'due_date' => $dueOn,
                        'amount' => $retention,
                        'open_amount' => 0,
                        'status' => 'paid',
                        'settled_at' => $dueOn,
                        'notes' => trim((string) $values['retentionReason'].($notes ? "\n{$notes}" : '')),
                    ],
                );
            }

            if ($payout > 0 && ! $deposit->planned_refund_on) {
                $deposit->updateQuietly(['planned_refund_on' => $dueOn]);
            }

            return $this->refresh($deposit);
        }, 3);
    }

    /** @param array{dueOn:string,amount:float|int|string,notes?:string|null} $values */
    public function updateSettlement(ContractDeposit $deposit, Receivable $settlement, array $values, ?string $userId): ContractDeposit
    {
        return DB::transaction(function () use ($deposit, $settlement, $values): ContractDeposit {
            $deposit = ContractDeposit::query()
                ->with(['installments.receivable.allocations', 'receivables.allocations'])
                ->lockForUpdate()
                ->findOrFail($deposit->id);
            $settlement = Receivable::query()
                ->withCount('allocations')
                ->lockForUpdate()
                ->findOrFail($settlement->id);

            if ((string) $settlement->contract_id !== (string) $deposit->contract_id
                || $settlement->cost_area !== 'deposit'
                || ! in_array($settlement->type, ['deposit_refund', 'retention'], true)) {
                throw ValidationException::withMessages(['settlement' => 'Diese Kautionsabwicklung gehÃ¶rt nicht zur Vereinbarung.']);
            }
            if ($deposit->events()
                ->where(fn ($query) => $query
                    ->where('retention_receivable_id', $settlement->id)
                    ->orWhere('target_receivable_id', $settlement->id))
                ->exists()) {
                throw ValidationException::withMessages([
                    'settlement' => 'Ein mit einer Kautionsverrechnung oder Freigabe verknüpfter Posten ist unveränderlich.',
                ]);
            }
            if ($settlement->allocations_count > 0) {
                throw ValidationException::withMessages(['settlement' => 'Die Kautionsabwicklung kann nicht bearbeitet werden, weil bereits Zahlungsbuchungen darauf verweisen.']);
            }

            $amount = round((float) $values['amount'], 2);
            if ($amount <= 0) {
                throw ValidationException::withMessages(['amount' => 'Der Betrag muss grÃ¶ÃŸer als 0,00 â‚¬ sein.']);
            }

            $dueOn = CarbonImmutable::parse($values['dueOn'])->toDateString();
            $notes = filled($values['notes'] ?? null) ? trim((string) $values['notes']) : null;
            if ($settlement->type === 'retention' && blank($notes)) {
                throw ValidationException::withMessages(['notes' => 'Bitte begrÃ¼nden Sie den Einbehalt.']);
            }

            $requested = round((float) $deposit->installments->sum(fn (ContractDepositInstallment $row) => (float) ($row->receivable?->amount ?? 0)), 2);
            $open = round((float) $deposit->installments->sum(fn (ContractDepositInstallment $row) => (float) ($row->receivable?->open_amount ?? 0)), 2);
            $available = round($requested - $open + (float) $deposit->interest_amount - (float) $deposit->offset_amount, 2);
            $otherCommitted = round((float) $deposit->receivables
                ->whereIn('type', ['deposit_refund', 'retention'])
                ->where('id', '!=', $settlement->id)
                ->sum('amount'), 2) - (float) $deposit->offset_amount - (float) $deposit->released_amount;

            if ($otherCommitted + $amount > $available + 0.001) {
                throw ValidationException::withMessages(['amount' => 'Die geÃ¤nderte Abwicklung Ã¼bersteigt den verfÃ¼gbaren Kautionsbetrag.']);
            }

            $settlement->fill([
                'service_month' => CarbonImmutable::parse($dueOn)->startOfMonth()->toDateString(),
                'due_date' => $dueOn,
                'amount' => $amount,
                'open_amount' => $settlement->type === 'retention' ? 0 : $amount,
                'status' => $settlement->type === 'retention' ? 'paid' : 'open',
                'settled_at' => $settlement->type === 'retention' ? $dueOn : null,
                'notes' => $notes,
            ]);
            $settlement->save();

            if ($settlement->type === 'deposit_refund' && ! $deposit->planned_refund_on) {
                $deposit->updateQuietly(['planned_refund_on' => $dueOn]);
            }

            return $this->refresh($deposit);
        }, 3);
    }

    public function refresh(ContractDeposit $deposit): ContractDeposit
    {
        $deposit->released_amount = round((float) $deposit->events()
            ->where('event_type', 'retention_release')->sum('amount'), 2);
        $deposit->offset_amount = round((float) $deposit->events()
            ->where('event_type', 'retention_offset')->sum('amount'), 2);
        $deposit->load(['installments.receivable.allocations', 'receivables.allocations']);
        $summary = $this->summaryFromLoadedDeposit($deposit);
        $payouts = $deposit->receivables->where('type', 'deposit_refund');
        $retentions = $deposit->receivables->where('type', 'retention');
        $refundedOn = $payouts->where('status', 'paid')->max(fn (Receivable $row) => $row->settled_at?->toDateString());
        $retentionReason = $retentions->sortByDesc('created_at')->first()?->notes;
        $deposit->updateQuietly([
            'status' => $deposit->isCashSecurity()
                ? $this->statusFromSummary($summary)
                : ($deposit->security_released_on ? 'completed' : ($deposit->security_received_on ? 'secured' : 'draft')),
            'released_amount' => $deposit->released_amount,
            'offset_amount' => $deposit->offset_amount,
            'refunded_amount' => $summary['refunded'],
            'refunded_on' => $refundedOn,
            'retained_amount' => $summary['retained'],
            'retention_reason' => $retentionReason,
        ]);

        return $deposit->fresh(['installments.receivable.allocations', 'receivables.allocations']);
    }

    public function summary(ContractDeposit $deposit): array
    {
        return $this->summaryFromLoadedDeposit($this->refresh($deposit));
    }

    /**
     * Current recorded amounts without refreshing or persisting deposit state.
     * Aggregates cover complete relations; no payment/allocation history is loaded.
     */
    public function readSummary(ContractDeposit $deposit): array
    {
        $demands = OpenItem::query()
            ->where('contract_id', $deposit->contract_id)
            ->whereNotIn('status', ['cancelled', 'canceled'])
            ->whereIn('id', $deposit->installments()->reorder()->select('receivable_id')->whereNotNull('receivable_id'));
        $settlements = $deposit->receivables()->whereNotIn('status', ['cancelled', 'canceled']);
        $payouts = (clone $settlements)->where('type', 'deposit_refund');
        $summary = $this->summarizeAmounts(
            $deposit,
            (clone $demands)->sum('amount'),
            (clone $demands)->sum('open_amount'),
            (clone $payouts)->sum('amount'),
            (clone $payouts)->sum('open_amount'),
            (clone $settlements)->where('type', 'retention')->sum('amount'),
        );

        return [...$summary, 'status' => $deposit->isCashSecurity() ? $this->statusFromSummary($summary) : $deposit->status];
    }

    /**
     * Read-only aggregate for an already eager-loaded contract/deposit.
     * This shares the exact financial arithmetic with readSummary, but avoids
     * per-contract SQL in property-wide controlling projections.
     * The caller MUST load installments.receivable and receivables.
     */
    public function readSummaryFromLoaded(ContractDeposit $deposit): array
    {
        if (! $deposit->relationLoaded('installments') || ! $deposit->relationLoaded('receivables')) {
            throw new \LogicException('Deposit controlling requires eager-loaded installments and receivables.');
        }

        $demands = $deposit->installments
            ->map(function (ContractDepositInstallment $installment) {
                if (! $installment->relationLoaded('receivable')) {
                    throw new \LogicException('Deposit installment receivables must be eager-loaded.');
                }

                return $installment->receivable;
            })
            ->filter(fn ($receivable): bool => $receivable !== null
                && (string) $receivable->contract_id === (string) $deposit->contract_id
                && ! in_array($receivable->status, ['cancelled', 'canceled'], true))
            ->unique('id');
        $settlements = $deposit->receivables
            ->reject(fn ($receivable): bool => in_array($receivable->status, ['cancelled', 'canceled'], true));
        $refunds = $settlements->where('type', 'deposit_refund');
        $summary = $this->summarizeAmounts(
            $deposit,
            $demands->sum('amount'),
            $demands->sum('open_amount'),
            $refunds->sum('amount'),
            $refunds->sum('open_amount'),
            $settlements->where('type', 'retention')->sum('amount'),
        );

        return [...$summary, 'status' => $deposit->isCashSecurity()
            ? $this->statusFromSummary($summary)
            : ($deposit->security_released_on ? 'completed' : ($deposit->security_received_on ? 'secured' : 'draft'))];
    }

    private function summaryFromLoadedDeposit(ContractDeposit $deposit): array
    {
        // Both command refreshes and GET/account projections must exclude the
        // same cancelled receivables. Keep a single monetary calculation to
        // avoid inconsistent refundable balances or statuses.
        $summary = $this->readSummaryFromLoaded($deposit);
        unset($summary['status']);

        return $summary;
    }

    /** Pure calculation shared by command refreshes and read-only account projections. */
    private function summarizeAmounts(ContractDeposit $deposit, mixed $requested, mixed $open, mixed $refundCommitted, mixed $refundOpen, mixed $retained): array
    {
        $cents = static fn (mixed $value): int => BigDecimal::of((string) ($value ?? 0))
            ->multipliedBy(100)->toScale(0, RoundingMode::HalfUp)->toInt();
        $agreed = $cents($deposit->agreed_amount);
        $requested = $cents($requested);
        $open = $cents($open);
        $refundCommitted = $cents($refundCommitted);
        $refundOpen = $cents($refundOpen);
        $offset = $cents($deposit->offset_amount);
        $retained = max(0, $cents($retained) - $cents($deposit->released_amount) - $offset);
        $paid = $requested - $open;
        $available = $paid + $cents($deposit->interest_amount) - $offset;
        $refunded = $refundCommitted - $refundOpen;

        // Preserve the existing deposit API's decimal-euro DTO.
        return [
            'agreed' => $agreed / 100.0,
            'requested' => $requested / 100.0,
            'paid' => $paid / 100.0,
            'open' => $open / 100.0,
            'available' => $available / 100.0,
            'refundCommitted' => $refundCommitted / 100.0,
            'refundOpen' => $refundOpen / 100.0,
            'refunded' => $refunded / 100.0,
            'retained' => $retained / 100.0,
            'offset' => $offset / 100.0,
            'released' => $cents($deposit->released_amount) / 100.0,
            'remainingToAllocate' => max(0, $available - $refundCommitted - $retained) / 100.0,
            'remainingToRefund' => max(0, $available - $refunded - $retained) / 100.0,
        ];
    }

    private function statusFromSummary(array $summary): string
    {
        if ($summary['refundCommitted'] > 0 || $summary['retained'] > 0) {
            return $summary['refundOpen'] > 0 || $summary['remainingToAllocate'] > 0 ? 'partially_refunded' : 'completed';
        }

        return $summary['requested'] <= 0 ? 'draft'
            : ($summary['paid'] <= 0 ? 'requested' : ($summary['paid'] < $summary['agreed'] ? 'partial' : 'paid'));
    }

    private function rebuildInstallments(ContractDeposit $deposit): void
    {
        $count = max(1, (int) $deposit->installment_count);
        $base = floor(((float) $deposit->agreed_amount / $count) * 100) / 100;
        $remaining = round((float) $deposit->agreed_amount - ($base * $count), 2);
        $keep = [];
        for ($number = 1; $number <= $count; $number++) {
            $amount = round($base + ($number === $count ? $remaining : 0), 2);
            $dueDate = $deposit->due_from ? CarbonImmutable::parse($deposit->due_from)->addMonthsNoOverflow($number - 1)->toDateString() : null;
            $row = ContractDepositInstallment::query()->withTrashed()->where('contract_deposit_id', $deposit->id)->where('installment_number', $number)->first();
            if ($row?->trashed()) $row->restore();
            if ($row?->receivable_id && (abs((float) $row->amount - $amount) > 0.001 || $row->due_date?->toDateString() !== $dueDate)) {
                throw ValidationException::withMessages(['installmentCount' => 'Ein bereits erzeugter Kautionsratenplan kann nicht so geändert werden, dass bestehende Forderungen abweichen.']);
            }
            $row ??= new ContractDepositInstallment(['contract_deposit_id' => $deposit->id, 'installment_number' => $number]);
            $row->fill(['contract_id' => $deposit->contract_id, 'amount' => $amount, 'due_date' => $dueDate, 'status' => $row->receivable_id ? $row->status : 'open']);
            $row->save();
            $keep[] = $row->id;
        }
        if ($deposit->installments()->whereNotIn('id', $keep)->whereNotNull('receivable_id')->exists()) {
            throw ValidationException::withMessages(['installmentCount' => 'Die Ratenanzahl kann nicht reduziert werden, solange Forderungen an entfernten Raten hängen.']);
        }
        $deposit->installments()->whereNotIn('id', $keep)->whereNull('receivable_id')->delete();
    }

    private function nextReceivableNumber(string $direction): string
    {
        $prefix = ($direction === 'credit' ? 'AUS-' : 'FO-').now()->format('Ym').'-';
        $last = Receivable::withTrashed()->where('number', 'like', $prefix.'%')->lockForUpdate()->max('number');

        return $prefix.str_pad((string) ($last ? ((int) substr($last, -6)) + 1 : 1), 6, '0', STR_PAD_LEFT);
    }
}
