<?php

namespace App\Domain\Property\Actions;

use App\Models\Property;
use App\Reports\PropertyReport;

/** Collects domain values; the reusable renderer owns print layout and page breaks. */
final class BuildPropertyReport
{
    public function __construct(private CalculateOverview $overview) {}

    public function handle(Property $property): string
    {
        $label = fn (string $value): string => config('ui.options.'.$value, $value);

        return (new PropertyReport)->render([
            'code' => $property->code,
            'name' => $property->name,
            'address' => $property->street.' '.$property->house_number.' · '.$property->postal_code.' '.$property->city,
            'status' => $label($property->status->value),
            'generated_at' => now()->timezone('Europe/Berlin')->format('d.m.Y H:i'),
            'metrics' => $this->overview->handle(Property::whereKey($property->id)),
            'units' => $property->units()->orderBy('code')->cursor()->map(fn ($unit): array => [
                $unit->code, $unit->name, $label($unit->type->value), number_format($unit->area, 2, ',', '.').' m²', $label($unit->status->value),
            ]),
        ]);
    }
}
