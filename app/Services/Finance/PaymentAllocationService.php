<?php

namespace App\Services\Finance;

use App\Models\ContractDeposit;
use App\Models\IncomingInvoice;
use App\Models\OpenItem;
use App\Models\Payment;
use App\Models\PaymentAllocation;
use App\Services\Contracts\ContractDepositService;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PaymentAllocationService
{
    public function __construct(
        private readonly ContractDepositService $depositService,
    ) {}

    /** @param array<int, array{targetType:string,targetId:string,amount:float|int|string,allocationType?:string,discountAmount?:float|int|string,notes?:string|null}> $allocations */
    public function allocate(Payment $payment, array $allocations, ?string $userId = null): Payment
    {
        if ($allocations === []) {
            throw ValidationException::withMessages(['allocations' => 'Mindestens eine Zuordnung ist erforderlich.']);
        }

        return DB::transaction(function () use ($payment, $allocations, $userId): Payment {
            $payment = Payment::query()->lockForUpdate()->findOrFail($payment->id);
            $remaining = round((float) $payment->unallocated_amount, 2);

            foreach ($allocations as $index => $allocation) {
                $amount = round((float) ($allocation['amount'] ?? 0), 2);
                if ($amount <= 0) {
                    throw ValidationException::withMessages(["allocations.{$index}.amount" => 'Der Zuordnungsbetrag muss größer als 0,00 € sein.']);
                }
                if ($amount > $remaining + 0.001) {
                    throw ValidationException::withMessages(["allocations.{$index}.amount" => 'Der Betrag übersteigt den noch nicht zugeordneten Zahlungsbetrag.']);
                }

                $targetType = (string) ($allocation['targetType'] ?? '');
                $allocationType = (string) ($allocation['allocationType'] ?? 'regular');

                if ($targetType === 'openItem') {
                    $target = OpenItem::query()->lockForUpdate()->findOrFail($allocation['targetId']);
                    $payoutLike = $target->isPayoutLike();
                    $requiredDirection = $payoutLike ? 'debit' : 'credit';
                    if ($payment->direction !== $requiredDirection) {
                        throw ValidationException::withMessages([
                            'payment' => $payoutLike
                                ? 'Ein Auszahlungsposten kann nur mit einer ausgehenden Zahlung ausgeglichen werden.'
                                : 'Ein Einzahlungsposten kann nur mit einer eingehenden Zahlung ausgeglichen werden.',
                        ]);
                    }

                    $open = round((float) $target->open_amount, 2);
                    $overpayment = $allocationType === 'overpayment';
                    if ($overpayment && $payoutLike) {
                        throw ValidationException::withMessages(["allocations.{$index}.allocationType" => 'Auf Auszahlungsposten können keine Überzahlungen gebucht werden.']);
                    }
                    if ($overpayment && $open > 0.001) {
                        throw ValidationException::withMessages(["allocations.{$index}.allocationType" => 'Eine Überzahlung darf nur auf einen bereits vollständig ausgeglichenen offenen Posten gebucht werden.']);
                    }
                    if (! $overpayment && $amount > $open + 0.001) {
                        throw ValidationException::withMessages(["allocations.{$index}.amount" => 'Der Betrag übersteigt den offenen Betrag. Nutze für einen überschießenden Eingang eine separate Überzahlungsbuchung.']);
                    }

                    PaymentAllocation::query()->create([
                        'payment_id' => $payment->id,
                        'receivable_id' => $target->id,
                        'amount' => $amount,
                        'allocation_type' => $overpayment ? 'overpayment' : ($amount >= $open - 0.001 ? 'settlement' : 'partial'),
                        'booked_at' => now(),
                        'booked_by' => $userId,
                        'reference' => null,
                        'notes' => $allocation['notes'] ?? null,
                    ]);

                    if (! $overpayment) {
                        $this->refreshOpenItem($target, $amount);
                        $this->refreshDepositIfNeeded($target);
                    }
                } elseif ($targetType === 'incomingInvoice') {
                    $target = IncomingInvoice::query()->lockForUpdate()->findOrFail($allocation['targetId']);
                    if ($target->document_type === 'supplier_credit') {
                        throw ValidationException::withMessages(['payment' => 'Separat erfasste Lieferantengutschriften werden nicht automatisch mit Bankzahlungen verrechnet.']);
                    }
                    if ($target->document_type === 'credit') {
                        if ($payment->direction !== 'credit') {
                            throw ValidationException::withMessages(['payment' => 'Eine Lieferantenerstattung muss eine eingehende Zahlung sein.']);
                        }
                        $original = IncomingInvoice::query()->lockForUpdate()->findOrFail($target->original_invoice_id);
                        $totalCredits = round((float) $original->credits()->sum('gross_amount'), 2);
                        $refunded = round((float) $original->credits()->sum('paid_amount'), 2);
                        $refundDue = round(max(0, (float) $original->paid_amount + $totalCredits - (float) $original->gross_amount - $refunded), 2);
                        $remainingOnCredit = round((float) $target->gross_amount - (float) $target->paid_amount, 2);
                        if ($amount > $refundDue + 0.001 || $amount > $remainingOnCredit + 0.001) {
                            throw ValidationException::withMessages(["allocations.{$index}.amount" => 'Der Erstattungsbetrag übersteigt den nach Verrechnung noch offenen Lieferantenanspruch.']);
                        }
                        if ($allocationType === 'overpayment' || (float) ($allocation['discountAmount'] ?? 0) > 0) {
                            throw ValidationException::withMessages(["allocations.{$index}.allocationType" => 'Lieferantenerstattungen erlauben weder Skonto noch Überzahlungen.']);
                        }
                        PaymentAllocation::query()->create([
                            'payment_id' => $payment->id,
                            'incoming_invoice_id' => $target->id,
                            'amount' => $amount,
                            'allocation_type' => 'supplier_refund',
                            'booked_at' => now(),
                            'booked_by' => $userId,
                            'reference' => $original->number,
                            'notes' => $allocation['notes'] ?? null,
                        ]);
                        $target->paid_amount = round((float) $target->paid_amount + $amount, 2);
                        $target->save();
                        $remaining = round($remaining - $amount, 2);
                        continue;
                    }
                    if ($payment->direction !== 'debit') {
                        throw ValidationException::withMessages(['payment' => 'Eingehende Zahlungen können keiner Eingangsrechnung zugeordnet werden.']);
                    }

                    $open = round((float) $target->open_amount, 2);
                    $discount = round((float) ($allocation['discountAmount'] ?? 0), 2);
                    if ($discount < 0) {
                        throw ValidationException::withMessages(["allocations.{$index}.discountAmount" => 'Der Skontobetrag darf nicht negativ sein.']);
                    }
                    if ($amount + $discount > $open + 0.001) {
                        throw ValidationException::withMessages(["allocations.{$index}.amount" => 'Zahlbetrag und Skonto übersteigen den offenen Rechnungsbetrag.']);
                    }
                    if ($discount > 0 && (! $target->discount_until || now()->startOfDay()->gt($target->discount_until))) {
                        throw ValidationException::withMessages(["allocations.{$index}.discountAmount" => 'Die Skontofrist ist abgelaufen.']);
                    }
                    if ($discount > round((float) $target->discount_amount, 2) + 0.001) {
                        throw ValidationException::withMessages(["allocations.{$index}.discountAmount" => 'Der Skontobetrag übersteigt den zulässigen Rechnungsrabatt.']);
                    }

                    PaymentAllocation::query()->create([
                        'payment_id' => $payment->id,
                        'incoming_invoice_id' => $target->id,
                        'amount' => $amount,
                        'allocation_type' => $discount > 0 ? 'discount_settlement' : ($amount >= $open - 0.001 ? 'settlement' : 'partial'),
                        'booked_at' => now(),
                        'booked_by' => $userId,
                        'reference' => null,
                        'notes' => $discount > 0
                            ? trim(($allocation['notes'] ?? '')."\nSkonto: ".number_format($discount, 2, ',', '.').' €')
                            : ($allocation['notes'] ?? null),
                    ]);
                    $this->refreshInvoice($target, $amount, $discount);
                } else {
                    throw ValidationException::withMessages(["allocations.{$index}.targetType" => 'Unbekannter Zuordnungstyp.']);
                }

                $remaining = round($remaining - $amount, 2);
            }

            $this->refreshPayment($payment, $remaining);

            return $payment->fresh(['bankStatement', 'allocations.receivable.contract.parties.businessPartner', 'allocations.receivable.contract.mainUnit.property', 'allocations.incomingInvoice.supplier', 'allocations.incomingInvoice.property']);
        }, 3);
    }

    public function remove(PaymentAllocation $allocation): Payment
    {
        return DB::transaction(function () use ($allocation): Payment {
            $allocation = PaymentAllocation::query()
                ->with(['payment', 'receivable', 'incomingInvoice'])
                ->lockForUpdate()
                ->findOrFail($allocation->id);

            $payment = Payment::query()->lockForUpdate()->findOrFail($allocation->payment_id);
            $this->reverseAllocation($allocation);
            $allocation->delete();
            $this->refreshPayment($payment, round((float) $payment->unallocated_amount + (float) $allocation->amount, 2));

            return $payment->fresh(['bankStatement', 'allocations.receivable.contract.parties.businessPartner', 'allocations.receivable.contract.mainUnit.property', 'allocations.incomingInvoice.supplier', 'allocations.incomingInvoice.property']);
        }, 3);
    }

    public function removeAll(Payment $payment): Payment
    {
        return DB::transaction(function () use ($payment): Payment {
            $payment = Payment::query()->lockForUpdate()->findOrFail($payment->id);
            $allocations = PaymentAllocation::query()
                ->where('payment_id', $payment->id)
                ->with(['receivable', 'incomingInvoice'])
                ->lockForUpdate()
                ->get();

            foreach ($allocations as $allocation) {
                $this->reverseAllocation($allocation);
                $allocation->delete();
            }

            $this->refreshPayment($payment, (float) $payment->amount);

            return $payment->fresh(['bankStatement', 'allocations.receivable.contract.parties.businessPartner', 'allocations.receivable.contract.mainUnit.property', 'allocations.incomingInvoice.supplier', 'allocations.incomingInvoice.property']);
        }, 3);
    }

    private function reverseAllocation(PaymentAllocation $allocation): void
    {
        $amount = round((float) $allocation->amount, 2);

        if ($allocation->receivable_id) {
            $openItem = OpenItem::query()->lockForUpdate()->findOrFail($allocation->receivable_id);
            if ($allocation->allocation_type !== 'overpayment') {
                $openItem->open_amount = min((float) $openItem->amount, round((float) $openItem->open_amount + $amount, 2));
                $openItem->save();
                $this->refreshDepositIfNeeded($openItem);
            }

            return;
        }

        if ($allocation->incoming_invoice_id) {
            $invoice = IncomingInvoice::query()->lockForUpdate()->findOrFail($allocation->incoming_invoice_id);
            if ($invoice->document_type === 'credit' && $allocation->allocation_type === 'supplier_refund') {
                $invoice->paid_amount = max(0, round((float) $invoice->paid_amount - $amount, 2));
                $invoice->save();
                return;
            }
            $discount = $this->discountAmountFromNotes($allocation->notes);
            $invoice->paid_amount = max(0, round((float) $invoice->paid_amount - $amount, 2));
            $invoice->open_amount = max(0, round((float) $invoice->gross_amount - (float) $invoice->credits()->sum('gross_amount') - (float) $invoice->paid_amount, 2));
            $invoice->payment_status = (float) $invoice->open_amount <= 0.001 ? 'paid' : ((float) $invoice->open_amount < (float) $invoice->gross_amount ? 'partial' : 'open');
            $invoice->save();
        }
    }

    private function refreshOpenItem(OpenItem $openItem, float $amount): void
    {
        $open = max(0, round((float) $openItem->open_amount - $amount, 2));
        $openItem->update([
            'open_amount' => $open,
            'status' => $open <= 0.001 ? 'paid' : 'partial',
            'settled_at' => $open <= 0.001 ? now()->toDateString() : null,
        ]);
    }

    private function refreshInvoice(IncomingInvoice $invoice, float $amount, float $discount): void
    {
        $paid = round((float) $invoice->paid_amount + $amount, 2);
        $open = max(0, round((float) $invoice->open_amount - $amount - $discount, 2));
        $invoice->update([
            'paid_amount' => $paid,
            'open_amount' => $open,
            'payment_status' => $open <= 0.001 ? 'paid' : 'partial',
        ]);
    }

    private function refreshPayment(Payment $payment, float $remaining): void
    {
        $remaining = round(max(0, min((float) $payment->amount, $remaining)), 2);
        $payment->unallocated_amount = $remaining;
        $payment->status = $remaining <= 0.001 ? 'assigned' : ($remaining < (float) $payment->amount ? 'partial' : 'unassigned');
        $payment->save();
    }

    private function refreshDepositIfNeeded(OpenItem $target): void
    {
        if (! in_array($target->type, ['deposit', 'deposit_installment', 'deposit_refund', 'retention'], true) || ! $target->contract_id) {
            return;
        }

        $deposit = ContractDeposit::query()->where('contract_id', $target->contract_id)->first();
        if ($deposit) {
            $this->depositService->refresh($deposit);
        }
    }

    private function discountAmountFromNotes(?string $notes): float
    {
        if (! $notes || ! preg_match('/Skonto:\s*([0-9.]+,[0-9]{2})\s*€/u', $notes, $match)) {
            return 0.0;
        }

        return round((float) str_replace(['.', ','], ['', '.'], $match[1]), 2);
    }
}
