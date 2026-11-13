<?php

namespace App\Domain\Contract\Actions;

use App\Models\Contract;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class ActivateContract
{
    public function handle(Contract $contract): Contract
    {
        return DB::transaction(function () use ($contract): Contract {
            $contract = Contract::whereKey($contract->id)->lockForUpdate()->firstOrFail();
            if ($contract->status !== 'draft') {
                throw ValidationException::withMessages(['contract' => 'Nur Entwürfe können aktiviert werden.']);
            }
            if (! $contract->parties()->where('role', 'tenant')->exists()) {
                throw ValidationException::withMessages(['parties' => 'Mindestens einen Mieter zuordnen.']);
            }
            if (! $contract->conditions()->whereDate('effective_from', $contract->starts_on)->exists()) {
                throw ValidationException::withMessages(['conditions' => 'Eine Kondition ab Vertragsbeginn wird benötigt.']);
            }
            $contract->update(['status' => 'active']);

            return $contract;
        });
    }
}
