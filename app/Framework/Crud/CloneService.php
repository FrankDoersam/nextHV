<?php

namespace App\Framework\Crud;

use Closure;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

/** Transactional, allowlist-based cloning. Never clones unspecified relationships. */
final class CloneService
{
    public function handle(Model $source, array $attributes, array $relations = []): Model
    {
        $rules = method_exists($source, 'crudRules')
            ? $source::crudRules()
            : CrudRules::make();

        $allowed = $rules->cloneRelations();
        foreach ($relations as $name) {
            if (! is_string($name) || ! array_key_exists($name, $allowed)) {
                throw ValidationException::withMessages([
                    'relations' => 'Diese Relation darf nicht dupliziert werden.',
                ]);
            }
        }

        $selected = array_values(array_unique($relations));

        if ($rules->cloneUniqueFields()) {
            $query = $source->newQuery();
            if (in_array(SoftDeletes::class, class_uses_recursive($source), true)) {
                $query->withTrashed();
            }

            foreach ($rules->cloneUniqueFields() as $attribute) {
                $query->where($attribute, $attributes[$attribute] ?? $source->{$attribute});
            }

            if ($query->exists()) {
                throw ValidationException::withMessages([
                    'fields.code' => 'Diese Nummer ist bereits vergeben.',
                ]);
            }
        }

        return DB::transaction(function () use ($source, $rules, $attributes, $selected, $allowed): Model {
            Gate::authorize('view', $source);
            Gate::authorize('create', $source::class);

            $copy = $source->replicate(['deleted_at']);
            $copy->forceFill([...$rules->cloneOverrides(), ...$attributes]);
            $copy->save();

            foreach ($selected as $name) {
                $originalRelation = $source->{$name}();
                $copyRelation = $copy->{$name}();

                if (! $originalRelation instanceof HasMany || ! $copyRelation instanceof HasMany) {
                    throw ValidationException::withMessages([
                        'relations' => 'Nur ausdrücklich freigegebene HasMany-Relationen können kopiert werden.',
                    ]);
                }

                if ($allowed[$name]['filter'] instanceof Closure) {
                    // Like delete filters, child predicates must not escape the parent relation.
                    $originalRelation->where(fn (\Illuminate\Database\Eloquent\Builder $query) => ($allowed[$name]['filter'])($query));
                }

                $relatedModel = $originalRelation->getRelated()::class;
                Gate::authorize('create', $relatedModel);

                foreach ($originalRelation->get() as $related) {
                    Gate::authorize('view', $related);
                    $child = $related->replicate(['deleted_at']);
                    $child->forceFill($allowed[$name]['overrides']);
                    $copyRelation->save($child);
                }
            }

            return $copy;
        });
    }
}
