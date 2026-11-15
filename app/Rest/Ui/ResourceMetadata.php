<?php

namespace App\Rest\Ui;

use App\Framework\FeatureRegistry;
use App\Rest\Resources\Resource;
use Illuminate\Database\Eloquent\Relations\BelongsTo as EloquentBelongsTo;
use Illuminate\Support\Str;
use Lomkit\Rest\Fields\Details\FieldDetails;
use Lomkit\Rest\Fields\Enum;
use Lomkit\Rest\Fields\Field;
use Lomkit\Rest\Relations\BelongsTo;

/** Adds presentation hints to native REST details without a second field/rule schema. */
final readonly class ResourceMetadata
{
    public function __construct(private Resource $resource) {}

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        $fields = [];
        $model = $this->resource::newModel();
        foreach ($this->resource->definition()->fields() as $field) {
            $options = $this->options($field);
            $metadata = $field->getMeta()['ui'] ?? [];
            if ($options !== []) {
                $offered = $field instanceof Enum ? array_values(array_filter($options, fn (array $option): bool => in_array($option['value'], $field->offeredValues(), true))) : $options;
                $fields[$field->name] = [
                    'options' => $options,
                    'offeredOptions' => $offered,
                    'default' => array_key_exists('default', $metadata) ? $metadata['default'] : ($model->getAttributes()[$field->name] ?? ($field->isNullable() ? null : ($offered[0]['value'] ?? null))),
                ];
            }
        }

        $relations = [];
        foreach ($this->resource->definition()->relations() as $relation) {
            if (! $relation instanceof BelongsTo) {
                continue;
            }
            $eloquent = $model->{$relation->relation}();
            if (! $eloquent instanceof EloquentBelongsTo) {
                continue;
            }
            $foreignKey = $eloquent->getForeignKeyName();
            $field = $this->resource->definition()->fields()->find($foreignKey);
            if ($field === null) {
                continue;
            }
            $target = $relation->resource();
            $name = $target instanceof Resource ? $target->uiResourceName() : Str::replace('_', '-', $target::newModel()->getTable());
            $picker = $field->getMeta()['ui']['picker'] ?? [];
            $relations[$foreignKey] = [
                'relation' => $relation->relation,
                'responseKey' => Str::snake($relation->relation),
                'resource' => $name,
                'labelField' => $target instanceof Resource ? $target->uiTitleField() : 'id',
                'filters' => $picker['filters'] ?? [],
                'filterFilters' => $field->getMeta()['ui']['filter']['filters'] ?? [],
                'creatable' => $picker['creatable'] ?? false,
                ...array_intersect_key($picker, array_flip(['labelField', 'multiple', 'clearable'])),
            ];
        }

        $features = app(FeatureRegistry::class)->forResource($this->resource);

        return ['version' => 1, 'features' => ['import' => ! empty($features['import']), 'audit' => ! empty($features['audit'])], 'fields' => (object) $fields, 'relations' => (object) $relations, 'picker' => $this->resource->uiPicker(), 'labels' => (object) config('ui.options', [])];
    }

    public static function label(Field $field): string
    {
        $translated = __('validation.attributes.'.$field->name);

        return str_starts_with($translated, 'validation.') ? $field->getLabel() : $translated;
    }

    /** @return list<array{value: string|int, label: string}> */
    private function options(Field $field): array
    {
        $values = $field instanceof Enum ? $field->values() : [];
        if (! $field instanceof Enum) {
            $rules = FieldDetails::of($field, ['rules'])->jsonSerialize()['rules']['all'];
            foreach ($rules as $rule) {
                if (str_starts_with($rule, 'in:')) {
                    $values = str_getcsv(substr($rule, 3), ',', '"', '');
                    break;
                }
            }
        }
        $labels = [...config('ui.options', []), ...($field->getMeta()['ui']['optionLabels'] ?? [])];

        return array_map(fn (string|int $value): array => ['value' => $value, 'label' => $labels[$value] ?? Str::headline((string) $value)], $values);
    }
}
