<?php

namespace App\Framework\Crud;

use Closure;
use Illuminate\Database\Eloquent\Model;

/**
 * Domain-only exception for a specific model instance and specific fields.
 * Always restored in finally; never grant an API caller a generic bypass.
 */
final class CrudMutationScope
{
    private static array $allowances = [];

    public static function allow(Model $model, array $fields, Closure $callback): mixed
    {
        $key = spl_object_id($model);
        $previous = self::$allowances[$key] ?? [];
        self::$allowances[$key] = array_values(array_unique([...$previous, ...$fields]));

        try {
            return $callback();
        } finally {
            if ($previous) {
                self::$allowances[$key] = $previous;
            } else {
                unset(self::$allowances[$key]);
            }
        }
    }

    public static function permits(Model $model, string $field): bool
    {
        return in_array($field, self::$allowances[spl_object_id($model)] ?? [], true);
    }
}
