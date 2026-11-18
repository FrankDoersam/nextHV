<?php

namespace App\Application\Numbering;

use App\Models\OperatingCostStatement;
use App\Models\Property;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Validation\ValidationException;

final class NumberSequenceRegistry
{
    /** @return array<string, array<string, mixed>> */
    public function all(): array
    {
        return (array) config('numbering.sequences', []);
    }

    /** @return array<string, mixed> */
    public function get(string $key): array
    {
        $definition = $this->all()[$key] ?? null;

        if (! is_array($definition) || empty($definition['model']) || empty($definition['field'])) {
            throw ValidationException::withMessages([
                'key' => "Der Nummernkreis {$key} ist nicht registriert.",
            ]);
        }

        return $definition;
    }

    public function field(string $key): string
    {
        return (string) $this->get($key)['field'];
    }

    public function dateValueFor(Model $model, string $key): mixed
    {
        $attribute = $this->get($key)['date_attribute'] ?? null;

        return $attribute ? $model->getAttribute((string) $attribute) : null;
    }

    /** @return array<string, string> */
    public function contextFor(Model $model, string $key): array
    {
        if ($key === 'operating_cost_statement' && $model instanceof OperatingCostStatement) {
            $propertyNumber = $model->relationLoaded('property')
                ? $model->property?->property_number
                : Property::query()->whereKey($model->property_id)->value('property_number');

            return ['PROPERTY' => $this->sanitizeContextValue((string) ($propertyNumber ?: 'OBJ'))];
        }

        return [];
    }

    /** @return array<string, string> */
    public function sampleContext(string $key): array
    {
        return $key === 'operating_cost_statement'
            ? ['PROPERTY' => 'OBJ-1000']
            : [];
    }

    /** @return array<int, string> */
    public function contextTokens(string $key): array
    {
        return array_values((array) ($this->get($key)['context_tokens'] ?? []));
    }

    public function maxLength(string $key): int
    {
        return max(1, (int) ($this->get($key)['max_length'] ?? 80));
    }

    public function isAvailable(string $key, string $candidate): bool
    {
        $definition = $this->get($key);
        $modelClass = (string) $definition['model'];
        $field = (string) $definition['field'];
        $usesSoftDeletes = in_array(SoftDeletes::class, class_uses_recursive($modelClass), true);
        $query = $usesSoftDeletes ? $modelClass::withTrashed() : $modelClass::query();

        return ! $query->where($field, $candidate)->exists();
    }

    private function sanitizeContextValue(string $value): string
    {
        $value = trim($value);
        $value = preg_replace('/[^A-Za-z0-9._-]+/u', '-', $value) ?? $value;

        return trim($value, '-') ?: 'X';
    }
}
