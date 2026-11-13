<?php

namespace App\Framework\Crud;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Validation\ValidationException;
use LogicException;

final class CrudRuleExecutor
{
    public function saving(Model $model, CrudRules $rules): void
    {
        if (! $model->exists) {
            foreach ($rules->defaults() as $attribute => $value) {
                if (! array_key_exists($attribute, $model->getAttributes())) {
                    $model->setAttribute($attribute, $value);
                }
            }
        }

        foreach ($rules->forcedValues() as $attribute => $value) {
            $model->setAttribute($attribute, $value);
        }

        if (! $model->exists) {
            return;
        }

        foreach ($rules->createOnlyFields() as $attribute) {
            if ($model->isDirty($attribute)) {
                throw ValidationException::withMessages([
                    $attribute => 'Dieses Feld kann nach dem Erstellen nicht geändert werden.',
                ]);
            }
        }

        foreach ($rules->protectedConditions() as $condition) {
            $protectedChanges = array_filter(
                $condition['attributes'],
                fn (string $attribute): bool => $model->isDirty($attribute)
                    && ! CrudMutationScope::permits($model, $attribute),
            );
            if ($protectedChanges && ($condition['predicate'])($model)) {
                throw ValidationException::withMessages([$condition['field'] => $condition['message']]);
            }
        }
    }

    public function deleting(Model $model, CrudRules $rules): void
    {
        foreach ($rules->deleteRestrictions() as $restriction) {
            $relation = $model->{$restriction['relation']}();
            if (! $relation instanceof Relation) {
                throw new LogicException('CRUD-Löschsperre verweist auf eine ungültige Relation.');
            }

            if ($restriction['withTrashed'] &&
                in_array(SoftDeletes::class, class_uses_recursive($relation->getRelated()), true)) {
                $relation->withTrashed();
            }

            if ($restriction['filter'] instanceof DeleteFilter) {
                // Keep OR filters inside relation constraints: never escape the parent's foreign key.
                $relation->where(fn (\Illuminate\Database\Eloquent\Builder $query) => $restriction['filter']->apply($query));
            }

            if ($relation->exists()) {
                throw ValidationException::withMessages([
                    $restriction['field'] => $restriction['message'],
                ]);
            }
        }

        foreach ($rules->deleteRecordFilters() as $restriction) {
            $matches = $model->newQuery()
                ->whereKey($model->getKey())
                ->where(fn (\Illuminate\Database\Eloquent\Builder $query) => $restriction['filter']->apply($query))
                ->exists();

            if ($matches) {
                throw ValidationException::withMessages([
                    $restriction['field'] => $restriction['message'],
                ]);
            }
        }

        foreach ($rules->deleteConditions() as $condition) {
            if (($condition['predicate'])($model)) {
                throw ValidationException::withMessages([$condition['field'] => $condition['message']]);
            }
        }
    }
}
