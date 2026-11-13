<?php

namespace App\Observers;

use App\Models\BusinessPartner;
use Illuminate\Validation\ValidationException;

class BusinessPartnerObserver
{
    public function deleting(BusinessPartner $partner): void
    {
        if ($partner->contractParties()->exists()) {
            throw ValidationException::withMessages(['partner' => 'Geschäftspartner mit Vertragsbezug können nicht gelöscht werden.']);
        }
    }
}
