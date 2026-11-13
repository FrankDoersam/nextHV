<?php

namespace App\Domain\Property\Actions;

use App\Framework\Crud\CloneService;
use App\Models\Unit;

final class CloneUnit
{
    public function handle(Unit $source, string $code, string $name, ?int $propertyId = null): Unit
    {
        /** @var Unit $copy */
        $copy = app(CloneService::class)->handle(
            $source,
            ['code' => $code, 'name' => $name, 'property_id' => $propertyId ?? $source->property_id],
        );

        return $copy;
    }
}
