<?php

namespace App\Observers;

use App\Domain\Property\Actions\ValidateUnit;
use App\Models\Unit;

class UnitObserver
{
    public function saving(Unit $unit): void
    {
        app(ValidateUnit::class)->handle($unit);
    }

}
