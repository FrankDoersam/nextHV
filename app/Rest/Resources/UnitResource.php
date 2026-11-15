<?php

namespace App\Rest\Resources;

use App\Domain\Property\Enums\UnitStatus;
use App\Domain\Property\Enums\UnitType;
use App\Models\Unit;
use App\Rest\Actions\CloneUnit;
use App\Rest\Metrics\GroupedCounts;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Lomkit\Rest\Fields\Boolean;
use Lomkit\Rest\Fields\DateTime;
use Lomkit\Rest\Fields\Enum;
use Lomkit\Rest\Fields\ID;
use Lomkit\Rest\Fields\Integer;
use Lomkit\Rest\Fields\Number;
use Lomkit\Rest\Fields\Text;
use Lomkit\Rest\Mutations\Contextual;
use Lomkit\Rest\Mutations\MutationContext;
use Lomkit\Rest\Mutations\MutationNode;
use Lomkit\Rest\Relations\BelongsTo;
use Lomkit\Rest\Relations\HasMany;

class UnitResource extends Resource
{
    public static string $model = Unit::class;

    public function uiPicker(): array
    {
        return ['secondaryFields' => ['property.name', 'property.city', 'code'], 'includes' => [['relation' => 'property']]];
    }

    public function fields(): array
    {
        return [
            ID::make('id'), Integer::make('property_id')->meta(['ui' => ['picker' => ['filters' => [['field' => 'status', 'value' => 'active']]]]])->rules(Rule::exists('properties', 'id')->whereNull('deleted_at')->where('status', 'active'))->creationRules(Contextual::rule(fn (MutationContext $context): array => $context->depth === 0 ? ['required'] : [])),
            Text::make('code')->searchable()->rules('max:40')->creationRules('required')->updateRules('filled'), Text::make('name')->searchable()->filterable(['=', '!=', 'in', 'not in', 'like', 'not like'])->rules('max:160')->creationRules('required')->updateRules('filled'),
            Enum::make('type', UnitType::class), Enum::make('status', UnitStatus::class), Text::make('floor')->nullable()->rules('max:30'),
            Number::make('area')->rules('min:0', 'max:9999999999'), Number::make('rooms')->rules('min:0', 'max:999'),
            Boolean::make('has_balcony'), Boolean::make('barrier_free'), Text::make('notes')->nullable()->rules('max:10000'),
            DateTime::make('created_at')->readonly(), DateTime::make('updated_at')->readonly(),
        ];
    }

    public function relations(): array
    {
        return [BelongsTo::make('property', PropertyResource::class)->onlyOperations(), HasMany::make('contracts', ContractResource::class)->onlyOperations()];
    }

    public function metrics(): array
    {
        return [new GroupedCounts(['type', 'status'])];
    }

    public function actions(): array
    {
        return [CloneUnit::class];
    }

    public function mutating(MutationNode $entry, Model $model): void
    {
        parent::mutating($entry, $model);
        $propertyId = $entry->attributes['property_id'] ?? $model->property_id;
        if ($propertyId && isset($entry->attributes['code']) && Unit::withTrashed()->where('property_id', $propertyId)->where('code', $entry->attributes['code'])->when($model->exists, fn ($q) => $q->whereKeyNot($model->id))->exists()) {
            throw ValidationException::withMessages(['code' => 'Diese Nummer ist im Objekt bereits vergeben.']);
        }
    }
}
