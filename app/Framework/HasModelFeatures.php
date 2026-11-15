<?php

namespace App\Framework;

use App\Observers\AuditObserver;
use Illuminate\Database\Eloquent\Model;

trait HasModelFeatures
{
    public static function bootHasModelFeatures(): void
    {
        foreach (['created', 'updated', 'deleted', 'restored'] as $event) {
            static::registerModelEvent($event, fn (Model $model) => app(AuditObserver::class)->{$event}($model));
        }
    }
}
