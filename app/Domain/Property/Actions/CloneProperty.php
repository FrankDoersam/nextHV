<?php

namespace App\Domain\Property\Actions;

use App\Models\Property;
use Illuminate\Support\Facades\DB;

final class CloneProperty
{
    public function handle(Property $source, string $code, string $name, bool $withUnits): Property
    {
        return DB::transaction(function () use ($source, $code, $name, $withUnits) {
            $copy = $source->replicate(['deleted_at']);
            $copy->forceFill(['code' => $code, 'name' => $name, 'status' => 'active', 'next_inspection_on' => null]);
            $copy->save();
            if ($withUnits) {
                foreach ($source->units as $unit) {
                    app(CloneUnit::class)->handle($unit, $unit->code, $unit->name, $copy->id);
                }
            }

            return $copy;
        });
    }
}
