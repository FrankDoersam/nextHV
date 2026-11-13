<?php

namespace App\Rest\Resources;

use Illuminate\Support\Collection;
use Lomkit\Rest\Attributes\WithoutPerimeter;
use Lomkit\Rest\Confirmation\Confirmation;
use Lomkit\Rest\Http\Resource as RestResource;
use Lomkit\Rest\Text\Contains;
use Lomkit\Rest\Text\TextSearch;

#[WithoutPerimeter] // Single workspace by request. Organisation scoping is deferred.
abstract class Resource extends RestResource
{
    public int $defaultLimit = 25;

    public function limits(): array
    {
        return [10, 25, 50, 100];
    }

    public function versioned(): bool
    {
        return true;
    }

    public function text(): ?TextSearch
    {
        return Contains::make();
    }

    public function destroyConfirmation(Collection $models): ?Confirmation
    {
        return Confirmation::make($models->count().' Datensätze wirklich löschen?');
    }
}
