<?php

namespace App\Observers;

use App\Models\Contract;
use App\Models\ContractParty;
use Illuminate\Validation\ValidationException;

class ContractPartyObserver
{
    public function saving(ContractParty $party): void
    {
        $contract = $party->contract()->lockForUpdate()->first();
        if ($party->exists && $party->isDirty('role') && $party->getRawOriginal('role') === 'tenant' && $party->role !== 'tenant') {
            $this->assertTenantRemains($party, $contract);
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
        $contract = $party->contract()->lockForUpdate()->first();
        if ($party->role === 'tenant') {
            $this->assertTenantRemains($party, $contract);
        }
    }

    private function assertTenantRemains(ContractParty $party, ?Contract $contract): void
    {
        if ($contract?->status === 'active' && ! $contract->parties()->where('role', 'tenant')->whereKeyNot($party->id)->exists()) {
            throw ValidationException::withMessages(['role' => 'Ein aktiver Vertrag benötigt mindestens einen Mieter.']);
        }
    }
}
