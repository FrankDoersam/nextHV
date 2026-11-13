<?php

namespace App\Framework\Crud;

use Illuminate\Database\Eloquent\Model;

trait HasCrudRules
{
    protected static function bootHasCrudRules(): void
    {
        static::saving(function (Model $model): void {
            app(CrudRuleExecutor::class)->saving($model, $model::crudRules());
        });

        static::deleting(function (Model $model): void {
            app(CrudRuleExecutor::class)->deleting($model, $model::crudRules());
        });
    }

    public static function crudRules(): CrudRules
    {
        return CrudRules::make();
    }
}
