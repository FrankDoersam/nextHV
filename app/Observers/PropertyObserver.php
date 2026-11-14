<?php

namespace App\Observers;

use App\Domain\Property\Enums\PropertyStatus;
use App\Models\Property;
use Illuminate\Validation\ValidationException;

class PropertyObserver
{
    public function deleting(Property $property): void
    {
        $errors = [];
        if ($property->status === PropertyStatus::Active) {
            $errors['status'] = 'Das Objekt ist aktiv. Bitte zuerst archivieren.';
        }
        if ($property->units()->withTrashed()->exists()) {
            $errors['units'] = 'Es sind Einheiten zugeordnet, einschließlich archivierter Einheiten.';
        }
        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }
    }
}
