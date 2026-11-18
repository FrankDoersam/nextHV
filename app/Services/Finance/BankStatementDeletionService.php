<?php

namespace App\Services\Finance;

use App\Models\BankStatement;
use App\Models\Payment;
use App\Models\PaymentAllocation;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class BankStatementDeletionService
{
    public function delete(BankStatement $statement): void
    {
        DB::transaction(function () use ($statement): void {
            $locked = BankStatement::query()->lockForUpdate()->findOrFail($statement->id);
            $payments = Payment::withTrashed()
                ->where('bank_statement_id', $locked->id)
                ->lockForUpdate()
                ->get(['id']);
            $paymentIds = $payments->pluck('id')->all();

            if ($paymentIds !== [] && PaymentAllocation::query()->whereIn('payment_id', $paymentIds)->exists()) {
                throw ValidationException::withMessages([
                    'bankStatement' => 'Der Kontoauszug kann nicht gelöscht werden, weil mindestens eine Zahlung bereits zugeordnet ist. Heben Sie die Zuordnung zuerst auf.',
                ]);
            }

            foreach ($payments as $payment) {
                $payment->forceDelete();
            }

            $locked->forceDelete();
        }, 3);
    }
}
