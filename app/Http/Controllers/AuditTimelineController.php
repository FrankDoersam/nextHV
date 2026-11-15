<?php

namespace App\Http\Controllers;

use App\Models\AuditEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use Lomkit\Rest\Facades\Rest;

class AuditTimelineController extends Controller
{
    public function __invoke(Request $request, string $resource, int $id): JsonResponse
    {
        $feature = config('resource_features.'.$resource);
        abort_unless($feature && ! empty($feature['audit']), 404);
        $input = $request->validate(['before' => ['sometimes', 'integer', 'min:1']]);
        $row = Rest::search($feature['resource'])->as($request->user())->payload(['filters' => [['field' => 'id', 'value' => $id]], 'limit' => 10])->page()->first();
        abort_unless($row, 404);
        Gate::authorize('view', $row);
        $events = AuditEvent::where('resource', $resource)->where('record_id', $id)->when(isset($input['before']), fn ($query) => $query->where('id', '<', $input['before']))->orderByDesc('id')->limit(21)->get();
        $hasMore = $events->count() > 20;
        $items = $events->take(20)->map(fn (AuditEvent $event): array => [
            'id' => $event->id, 'event' => $event->event, 'actor' => $event->actor_name, 'created_at' => $event->created_at->toIso8601String(),
            'changes' => collect($event->changes)->only($feature['audit'])->map(fn (array $change, string $field): array => ['label' => trans('validation.attributes.'.$field) !== 'validation.attributes.'.$field ? trans('validation.attributes.'.$field) : Str::headline($field), ...array_map(fn ($value) => is_string($value) ? (config('ui.options')[$value] ?? $value) : $value, $change)])->values()->all(),
        ])->values();

        return response()->json(['data' => $items, 'next_cursor' => $hasMore ? $items->last()['id'] : null], 200, ['Cache-Control' => 'private, no-store']);
    }
}
