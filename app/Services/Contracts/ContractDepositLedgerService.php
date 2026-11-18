<?php

namespace App\Services\Contracts;

use App\Models\ContractDeposit;
use App\Models\ContractDepositEvent;
use App\Models\ContractDepositInterestRate;
use App\Models\OpenItem;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class ContractDepositLedgerService
{
    public function __construct(private readonly ContractDepositService $deposits) {}

    /** Configure the bank's dated annual rate; this does not book a credit. */
    public function addRate(ContractDeposit $deposit, array $input): ContractDeposit
    {
        return DB::transaction(function () use ($deposit, $input): ContractDeposit {
            $deposit = ContractDeposit::query()->lockForUpdate()->findOrFail($deposit->id);
            $this->assertInterestEnabled($deposit);
            $date = CarbonImmutable::parse($input['effectiveFrom'])->toDateString();
            $rate = round((float) $input['annualRatePercent'], 5);
            $existing = $deposit->interestRates()->whereDate('effective_from', $date)->first();
            if ($existing) {
                if (abs((float) $existing->annual_rate_percent - $rate) > 0.000001) {
                    throw ValidationException::withMessages(['effectiveFrom' => 'Für dieses Datum ist bereits ein anderer Zinssatz dokumentiert.']);
                }
                return $deposit;
            }

            $deposit->interestRates()->create([
                'effective_from' => $date,
                'annual_rate_percent' => $rate,
                'reference' => $input['reference'] ?? null,
            ]);
            return $deposit;
        }, 3);
    }

    /** Book actual, evidenced interest rather than a theoretical forecast. */
    public function recordInterest(ContractDeposit $deposit, array $input): ContractDeposit
    {
        return DB::transaction(function () use ($deposit, $input): ContractDeposit {
            $deposit = ContractDeposit::query()->lockForUpdate()->findOrFail($deposit->id);
            $this->assertInterestEnabled($deposit);
            $existing = $this->existingEvent($deposit, $input['operationId'], 'interest_credit', $input);
            if ($existing) return $deposit;
            $this->assertPostedDate($input['effectiveOn']);

            if (blank($input['reference'] ?? null)) {
                throw ValidationException::withMessages(['reference' => 'Für gebuchte Zinsen ist eine Bankabrechnung oder Belegreferenz erforderlich.']);
            }

            $deposit->events()->create([
                'operation_id' => $input['operationId'],
                'event_type' => 'interest_credit',
                'amount' => $input['amount'],
                'effective_on' => $input['effectiveOn'],
                'reference' => $input['reference'],
                'notes' => $input['notes'] ?? null,
            ]);
            // The existing finance projections continue to use interest_amount.
            // Historical undated interest is preserved as a distinct opening amount.
            $deposit->interest_amount = round(
                (float) $deposit->legacy_interest_amount
                + (float) $deposit->events()->where('event_type', 'interest_credit')->sum('amount'), 2,
            );
            $deposit->save();
            return $this->deposits->refresh($deposit);
        }, 3);
    }

    /** Apply a previously reserved hold to an EXISTING, due contract open item. */
    public function applyRetention(ContractDeposit $deposit, array $input): ContractDeposit
    {
        return DB::transaction(function () use ($deposit, $input): ContractDeposit {
            $deposit = ContractDeposit::query()->lockForUpdate()->findOrFail($deposit->id);
            if ($this->existingEvent($deposit, $input['operationId'], 'retention_offset', $input)) return $deposit;
            $this->assertPostedDate($input['effectiveOn']);

            $retention = $this->retention($deposit, $input['retentionId']);
            $target = OpenItem::query()->lockForUpdate()->findOrFail($input['targetOpenItemId']);
            if ((string) $target->contract_id !== (string) $deposit->contract_id
                || ! in_array($target->type, ['settlement', 'damages', 'rent', 'advance', 'other'], true)
                || $target->cost_area === 'deposit') {
                throw ValidationException::withMessages(['targetOpenItemId' => 'Nur eine offene, nicht kautionsbezogene Forderung desselben Vertrags darf verrechnet werden.']);
            }

            $amount = round((float) $input['amount'], 2);
            if ($amount > $this->retentionBalance($deposit, $retention) + 0.001) {
                throw ValidationException::withMessages(['amount' => 'Die verbleibende Einbehaltsreserve reicht nicht aus.']);
            }
            if ($amount > (float) $target->open_amount + 0.001) {
                throw ValidationException::withMessages(['amount' => 'Der Verrechnungsbetrag übersteigt den offenen Posten.']);
            }
            if (! $target->due_date || CarbonImmutable::parse($input['effectiveOn'])->lt($target->due_date)) {
                throw ValidationException::withMessages(['effectiveOn' => 'Die Verrechnung darf nicht vor der Fälligkeit des Zielpostens erfolgen.']);
            }

            $target->open_amount = round((float) $target->open_amount - $amount, 2);
            $target->save(); // Canonical OpenItem model derives paid / partial status.
            $deposit->events()->create([
                'operation_id' => $input['operationId'],
                'event_type' => 'retention_offset',
                'amount' => $amount,
                'effective_on' => $input['effectiveOn'],
                'retention_receivable_id' => $retention->id,
                'target_receivable_id' => $target->id,
                'reference' => $target->number,
                'notes' => $input['notes'] ?? null,
            ]);
            return $this->deposits->refresh($deposit);
        }, 3);
    }

    /** Release unused reservation via a normal outgoing open item, not a fake bank payment. */
    public function releaseRetention(ContractDeposit $deposit, array $input): ContractDeposit
    {
        return DB::transaction(function () use ($deposit, $input): ContractDeposit {
            $deposit = ContractDeposit::query()->lockForUpdate()->findOrFail($deposit->id);
            if ($this->existingEvent($deposit, $input['operationId'], 'retention_release', $input)) return $deposit;
            $this->assertPostedDate($input['effectiveOn']);
            $retention = $this->retention($deposit, $input['retentionId']);
            $amount = round((float) $input['amount'], 2);
            if ($amount > $this->retentionBalance($deposit, $retention) + 0.001) {
                throw ValidationException::withMessages(['amount' => 'Die verbleibende Einbehaltsreserve reicht nicht aus.']);
            }

            $due = CarbonImmutable::parse($input['effectiveOn']);
            $refund = OpenItem::query()->create([
                'number' => $this->nextRefundNumber(),
                'idempotency_key' => "contract-deposit:{$deposit->id}:release:{$input['operationId']}",
                'contract_id' => $deposit->contract_id,
                'type' => 'deposit_refund',
                'cost_area' => 'deposit',
                'description' => 'Freigabe Kautionseinbehalt',
                'service_month' => $due->startOfMonth()->toDateString(),
                'due_date' => $due->toDateString(),
                'amount' => $amount,
                'open_amount' => $amount,
                'notes' => $input['notes'] ?? 'Freigabe nicht verbrauchter Kautionsreserve',
            ]);
            $deposit->events()->create([
                'operation_id' => $input['operationId'],
                'event_type' => 'retention_release',
                'amount' => $amount,
                'effective_on' => $due->toDateString(),
                'retention_receivable_id' => $retention->id,
                'target_receivable_id' => $refund->id,
                'reference' => $refund->number,
                'notes' => $input['notes'] ?? null,
            ]);
            return $this->deposits->refresh($deposit);
        }, 3);
    }

    public function retentionBalance(ContractDeposit $deposit, OpenItem $retention): float
    {
        $used = $deposit->events()->where('retention_receivable_id', $retention->id)
            ->whereIn('event_type', ['retention_offset', 'retention_release'])->sum('amount');
        return round(max(0, (float) $retention->amount - (float) $used), 2);
    }

    private function retention(ContractDeposit $deposit, string $id): OpenItem
    {
        $retention = OpenItem::query()->whereKey($id)->lockForUpdate()->firstOrFail();
        if ((string) $retention->contract_id !== (string) $deposit->contract_id || $retention->type !== 'retention') {
            throw ValidationException::withMessages(['retentionId' => 'Der Einbehalt gehört nicht zu dieser Kaution.']);
        }
        return $retention;
    }

    private function existingEvent(ContractDeposit $deposit, string $operation, string $type, array $input): ?ContractDepositEvent
    {
        $event = $deposit->events()->where('operation_id', $operation)->first();
        if (! $event) return null;
        if ($event->event_type !== $type
            || round((float) $event->amount, 2) !== round((float) $input['amount'], 2)
            || $event->effective_on->toDateString() !== CarbonImmutable::parse($input['effectiveOn'])->toDateString()
            || (isset($input['retentionId']) && (string) $event->retention_receivable_id !== (string) $input['retentionId'])
            || (isset($input['targetOpenItemId']) && (string) $event->target_receivable_id !== (string) $input['targetOpenItemId'])
            || (string) ($event->notes ?? '') !== (string) ($input['notes'] ?? '')
            || ($type === 'interest_credit' && (string) ($event->reference ?? '') !== (string) ($input['reference'] ?? ''))) {
            throw ValidationException::withMessages(['operationId' => 'Diese Vorgangskennung gehört zu einer anderen Buchung.']);
        }
        return $event;
    }

    /** Recorded money movements are actual events, not future reservations. */
    private function assertPostedDate(string $effectiveOn): void
    {
        if (CarbonImmutable::parse($effectiveOn)->startOfDay()->gt(CarbonImmutable::today())) {
            throw ValidationException::withMessages([
                'effectiveOn' => 'Kautionsbuchungen können nicht in der Zukunft wirksam werden. Für geplante Auszahlungen bitte den künftigen Fälligkeitstermin in der Kautionsabwicklung erfassen.',
            ]);
        }
    }

    private function assertInterestEnabled(ContractDeposit $deposit): void
    {
        if (! $deposit->isCashSecurity() || ! $deposit->interest_relevant) {
            throw ValidationException::withMessages(['interestRelevant' => 'Eine Zinsbuchung ist nur bei aktivierter Geldkautionsverzinsung möglich.']);
        }
    }

    private function nextRefundNumber(): string
    {
        $prefix = 'AUS-'.now()->format('Ym').'-';
        $last = OpenItem::withTrashed()->where('number', 'like', $prefix.'%')->lockForUpdate()->max('number');
        return $prefix.str_pad((string) ($last ? ((int) substr($last, -6)) + 1 : 1), 6, '0', STR_PAD_LEFT);
    }
}
