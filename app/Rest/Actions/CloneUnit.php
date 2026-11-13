<?php

namespace App\Rest\Actions;

use App\Models\Unit;

final class CloneUnit extends CloneConfiguredResource
{
    protected string $cloneModel = Unit::class;

    protected string $resourceSlug = 'units';
}
