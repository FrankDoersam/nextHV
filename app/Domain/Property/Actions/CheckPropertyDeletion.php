<?php

namespace App\Domain\Property\Actions;

use App\Domain\Property\Enums\PropertyStatus;
use App\Models\Property;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

final class CheckPropertyDeletion
{
    /** One batched EXISTS projection, irrespective of the number of selected rows. */
    public function handle(Collection $models): array
    {
        $properties = Property::whereKey($models->map(fn ($model) => $model->getKey())->all())->withExists(['units' => fn ($query) => $query->withTrashed()])->get();

        return $properties->map(function (Property $property): array {
            $reasons = [];
            if ($property->status === PropertyStatus::Active) {
                $reasons[] = 'Das Objekt ist aktiv. Bitte zuerst archivieren.';
            }
            if ($property->units_exists) {
                $reasons[] = 'Es sind Einheiten zugeordnet, einschließlich archivierter Einheiten.';
            }

            return ['id' => $property->id, 'label' => $property->code.' · '.$property->name, 'allowed' => $reasons === [], 'reasons' => $reasons];
        })->all();
    }

    public function assertAllowed(Collection $models): void
    {
        $errors = [];
        foreach ($this->handle($models) as $row) {
            if (! $row['allowed']) {
                $errors['resources.'.$row['id']] = array_map(fn ($reason) => $row['label'].': '.$reason, $row['reasons']);
            }
        }
        if ($errors) {
            throw ValidationException::withMessages($errors);
        }
    }
}
