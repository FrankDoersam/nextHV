<?php

namespace App\Rest\Resources;

use App\Rest\Text\RelatedContains;
use App\Rest\Ui\ResourceMetadata;
use App\Support\Validation\MutationValidationContext;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;
use Lomkit\Rest\Attributes\WithoutPerimeter;
use Lomkit\Rest\Fields\Field;
use Lomkit\Rest\Http\Resource as RestResource;
use Lomkit\Rest\Mutations\MutationNode;
use Lomkit\Rest\Relations\BelongsTo;
use Lomkit\Rest\Text\TextSearch;

#[WithoutPerimeter] // Single workspace by request. Organisation scoping is deferred.
abstract class Resource extends RestResource
{
    public int $defaultLimit = 25;

    public function mutating(MutationNode $entry, Model $model): void
    {
        MutationValidationContext::enter(request(), $entry, array_map(fn (Field $field): string => $field->name, iterator_to_array($this->definition()->fields(), false)));
    }

    public function mutated(MutationNode $entry, Model $model): void
    {
        MutationValidationContext::leave(request());
    }

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
        return new RelatedContains($this);
    }

    /** Direct belongs-to relations participate in text search; override to restrict this scope. */
    public function searchableRelations(): array
    {
        $relations = [];
        foreach ($this->definition()->relations() as $relation) {
            if ($relation instanceof BelongsTo) {
                $relations[$relation->relation] = $relation->resource();
            }
        }

        return $relations;
    }

    /** @return array{secondaryFields: list<string>, includes?: list<array{relation: string}>} */
    public function uiPicker(): array
    {
        return ['secondaryFields' => ['code']];
    }
}
