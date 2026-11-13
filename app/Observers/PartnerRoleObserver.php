<?php

namespace App\Observers;

use App\Models\PartnerRole;
use Illuminate\Validation\ValidationException;

class PartnerRoleObserver
{
    public function saving(PartnerRole $role): void
    {
        $role->businessPartner()->lockForUpdate()->firstOrFail();
        if ($role->exists && $role->isDirty(['business_partner_id', 'role']) && $role->businessPartner->contractParties()->where('role', $role->getOriginal('role'))->exists()) {
            throw ValidationException::withMessages(['role' => 'Eine verwendete Rolle kann nicht geändert werden.']);
        }
        if (PartnerRole::where('business_partner_id', $role->business_partner_id)
            ->where('role', $role->role)
            ->when($role->exists, fn ($query) => $query->whereKeyNot($role->id))->exists()) {
            throw ValidationException::withMessages(['role' => 'Diese Rolle ist dem Geschäftspartner bereits zugeordnet.']);
        }
    }

    public function deleting(PartnerRole $role): void
    {
        if ($role->businessPartner->contractParties()->where('role', $role->role)->exists()) {
            throw ValidationException::withMessages(['role' => 'Diese Rolle wird in einer Vertragsbeteiligung verwendet.']);
        }
    }
}
