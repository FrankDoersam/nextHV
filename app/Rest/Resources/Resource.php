<?php

namespace App\Rest\Resources;

use App\Rest\Ui\ResourceMetadata;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Lomkit\Rest\Attributes\WithoutPerimeter;
use Lomkit\Rest\Confirmation\Confirmation;
use Lomkit\Rest\Http\Resource as RestResource;
use Lomkit\Rest\Text\Contains;
use Lomkit\Rest\Text\TextSearch;

#[WithoutPerimeter] // Single workspace by request. Organisation scoping is deferred.
abstract class Resource extends RestResource
{
    public int $defaultLimit = 25;

    public function detailsMeta(): array
    {
        return [...parent::detailsMeta(), 'ui' => (new ResourceMetadata($this))->toArray()];
    }

    /** Override only when a resource uses a non-conventional URI. */
    public function uiResourceName(): string
    {
        return Str::replace('_', '-', static::newModel()->getTable());
    }

    /** The picker title is declared once for forms and relation filters. */
    public function uiTitleField(): string
    {
        foreach (['name', 'display_name', 'title', 'code', 'reason', 'id'] as $name) {
            if ($this->definition()->fields()->has($name)) {
                return $name;
            }
        }

        return 'id';
    }

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
