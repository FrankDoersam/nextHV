<?php

namespace App\Domain\Property\Actions;

use App\Framework\Crud\CloneService;
use App\Models\Property;

final class CloneProperty
{
    public function handle(Property $source, string $code, string $name, bool $withUnits): Property
    {
        /** @var Property $copy */
        $copy = app(CloneService::class)->handle(
            $source,
            ['code' => $code, 'name' => $name],
            $withUnits ? ['units'] : [],
        );

        return $copy;
    }
}
