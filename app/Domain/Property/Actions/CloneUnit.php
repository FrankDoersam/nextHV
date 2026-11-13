<?php

namespace App\Domain\Property\Actions;

use App\Models\Unit;

final class CloneUnit
{
    public function handle(Unit $source, string $code, string $name, ?int $propertyId = null): Unit
    {
        $copy = $source->replicate(['deleted_at']);
        $copy->forceFill(['code' => $code, 'name' => $name, 'property_id' => $propertyId ?? $source->property_id, 'status' => 'ready']);
        $copy->save();

        return $copy;
    }
}
