<?php

namespace App\Rest\Actions;

use App\Models\Property;

final class CloneProperty extends CloneConfiguredResource
{
    protected string $cloneModel = Property::class;

    protected string $resourceSlug = 'properties';
}
