<?php

namespace App\Observers;

use App\Domain\Contract\Actions\ValidateContract;
use App\Models\Contract;
use Illuminate\Validation\ValidationException;

class ContractObserver
{
    public function saving(Contract $contract): void
    {
        app(ValidateContract::class)->handle($contract);
    }

    public function deleting(Contract $contract): void
    {
        if ($contract->status !== 'draft') {
            throw ValidationException::withMessages(['contract' => 'Aktive oder historische Verträge bleiben erhalten. Vertrag beenden statt löschen.']);
        }
    }
}
