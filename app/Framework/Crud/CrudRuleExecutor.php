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
            if ($model->isDirty($condition['attributes']) && ($condition['predicate'])($model)) {
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

            if ($relation->exists()) {
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
