<?php

namespace App\Observers;

use App\Domain\Property\Actions\CheckPropertyDeletion;
use App\Models\Property;
use Illuminate\Database\Eloquent\Collection;

class PropertyObserver
{
    public function deleting(Property $property): void
    {
        app(CheckPropertyDeletion::class)->assertAllowed(new Collection([$property]));
    }
}
