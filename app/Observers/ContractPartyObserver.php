<?php

namespace App\Observers;

use App\Models\ContractParty;
use Illuminate\Validation\ValidationException;

class ContractPartyObserver
{
    public function saving(ContractParty $party): void
    {
        $contract = $party->contract()->lockForUpdate()->first();
        if ($contract?->status !== 'draft') {
            throw ValidationException::withMessages(['contract_id' => 'Beteiligte können nur im Vertragsentwurf geändert werden.']);
        }
        if (ContractParty::where('contract_id', $party->contract_id)->where('business_partner_id', $party->business_partner_id)->where('role', $party->role)->when($party->exists, fn ($q) => $q->whereKeyNot($party->id))->exists()) {
            throw ValidationException::withMessages(['business_partner_id' => 'Dieser Beteiligte ist bereits zugeordnet.']);
        }
        if ($party->is_primary && ContractParty::where('contract_id', $party->contract_id)->where('role', $party->role)->where('is_primary', true)->when($party->exists, fn ($q) => $q->whereKeyNot($party->id))->exists()) {
            throw ValidationException::withMessages(['is_primary' => 'Pro Rolle kann nur ein Hauptansprechpartner bestimmt werden.']);
        }
    }

    public function saved(ContractParty $party): void
    {
        $party->businessPartner->roles()->firstOrCreate(['role' => $party->role]);
    }

    public function deleting(ContractParty $party): void
    {
        if ($party->contract->status !== 'draft') {
            throw ValidationException::withMessages(['party' => 'Beteiligte aktivierter Verträge bleiben erhalten.']);
        }
    }
}
