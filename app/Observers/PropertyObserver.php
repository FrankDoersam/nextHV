<?php

namespace App\Observers;

use App\Models\Property;
use Illuminate\Validation\ValidationException;

class PropertyObserver
{
    public function deleting(Property $property): void
    {
        if ($property->units()->exists()) {
            throw ValidationException::withMessages(['property' => 'Objekte mit Einheiten können nicht gelöscht werden. Bitte archivieren.']);
        }
    }
}
