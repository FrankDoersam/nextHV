<?php

namespace App\Domain\Property\Actions;

use App\Models\Unit;
use Illuminate\Validation\ValidationException;

final class ValidateUnit
{
    public function handle(Unit $unit): void
    {
        if (! $unit->property()->where('status', 'active')->exists()) {
            throw ValidationException::withMessages(['property_id' => 'Bitte ein aktives Objekt auswählen.']);
        }
        if ($unit->isDirty('property_id') && $unit->exists && $unit->contracts()->exists()) {
            throw ValidationException::withMessages(['property_id' => 'Einheiten mit Verträgen können nicht in ein anderes Objekt verschoben werden.']);
        }
        if (Unit::withTrashed()->where('property_id', $unit->property_id)->where('code', $unit->code)->when($unit->exists, fn ($q) => $q->whereKeyNot($unit->id))->exists()) {
            throw ValidationException::withMessages(['code' => 'Diese Nummer ist im Objekt bereits vergeben.']);
        }
    }
}
