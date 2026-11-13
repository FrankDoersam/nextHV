<?php

namespace App\Observers;

use App\Domain\Property\Actions\ValidateUnit;
use App\Models\Unit;
use Illuminate\Validation\ValidationException;

class UnitObserver
{
    public function saving(Unit $unit): void
    {
        app(ValidateUnit::class)->handle($unit);
    }

    public function deleting(Unit $unit): void
    {
        if ($unit->contracts()->withTrashed()->exists()) {
            throw ValidationException::withMessages(['unit' => 'Einheiten mit Vertragshistorie können nicht gelöscht werden.']);
        }
    }
}
