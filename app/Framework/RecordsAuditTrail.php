<?php

namespace App\Framework;

use App\Contracts\Framework\HasAuditTrail;
use App\Observers\AuditObserver;
use Illuminate\Database\Eloquent\Model;
use LogicException;

trait RecordsAuditTrail
{
    public static function bootRecordsAuditTrail(): void
    {
        if (! is_subclass_of(static::class, HasAuditTrail::class)) {
            throw new LogicException('RecordsAuditTrail requires HasAuditTrail.');
        }
        foreach (['created', 'updated', 'deleted', 'restored'] as $event) {
            static::registerModelEvent($event, fn (Model $model) => app(AuditObserver::class)->{$event}($model));
        }
    }
}
