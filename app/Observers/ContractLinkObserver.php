<?php

namespace App\Observers;

use App\Models\ContractLink;
use Illuminate\Validation\ValidationException;

class ContractLinkObserver
{
    public function saving(ContractLink $link): void
    {
        if ($link->contract_id === $link->related_contract_id) {
            throw ValidationException::withMessages(['related_contract_id' => 'Ein Vertrag kann nicht mit sich selbst verknüpft werden.']);
        }
        if (ContractLink::where(fn ($q) => $q->where(fn ($a) => $a->where('contract_id', $link->contract_id)->where('related_contract_id', $link->related_contract_id))->orWhere(fn ($a) => $a->where('contract_id', $link->related_contract_id)->where('related_contract_id', $link->contract_id)))->when($link->exists, fn ($q) => $q->whereKeyNot($link->id))->exists()) {
            throw ValidationException::withMessages(['related_contract_id' => 'Diese Vertragsverknüpfung besteht bereits.']);
        }
    }
}
