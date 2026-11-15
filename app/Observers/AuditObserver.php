<?php

namespace App\Observers;

use App\Models\AuditEvent;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class AuditObserver
{
    public function created(Model $model): void
    {
        $this->record($model, 'created');
    }

    public function updated(Model $model): void
    {
        $this->record($model, 'updated');
    }

    public function deleted(Model $model): void
    {
        $this->record($model, 'deleted');
    }

    public function restored(Model $model): void
    {
        $this->record($model, 'restored');
    }

    private function record(Model $model, string $event): void
    {
        foreach (config('resource_features', []) as $name => $feature) {
            if (empty($feature['audit']) || $model::class !== $feature['resource']::$model) {
                continue;
            }
            $changes = [];
            foreach ($feature['audit'] as $field) {
                if (in_array($field, $model->getHidden(), true) || ($event === 'updated' && ! $model->wasChanged($field))) {
                    continue;
                }
                $before = in_array($event, ['created', 'restored'], true) ? null : $model->getRawOriginal($field);
                $after = $event === 'deleted' ? null : ($model->getAttributes()[$field] ?? null);
                if ($before === $after) {
                    continue;
                }
                $changes[$field] = ['before' => $this->scalar($before), 'after' => $this->scalar($after)];
            }
            if ($changes === [] && $event === 'updated') {
                return;
            }
            $user = auth()->user();
            AuditEvent::create(['resource' => $name, 'record_id' => $model->getKey(), 'actor_id' => $user?->getAuthIdentifier(), 'actor_name' => Str::limit($user?->name ?? 'System', 150), 'event' => $event, 'changes' => $changes, 'created_at' => now()]);

            return;
        }
    }

    private function scalar(mixed $value): string|int|float|bool|null
    {
        return is_string($value) ? Str::limit($value, 500) : (is_scalar($value) ? $value : null);
    }
}
