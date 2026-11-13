<?php

namespace App\Domain\Property\Actions;

use App\Models\Property;
use App\Models\Unit;
use Illuminate\Support\Str;

final class CloneDefaults
{
    public function handle(Property|Unit $source): array
    {
        $code = mb_substr($source->code, 0, 25).'-K'.Str::upper(Str::random(6));

        return ['code' => $code, 'name' => mb_substr($source->name, 0, 150).' · Kopie', ...($source instanceof Property ? ['with_units' => true] : [])];
    }
}
