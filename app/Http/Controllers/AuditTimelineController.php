<?php

namespace App\Http\Controllers;

use App\Framework\FeatureRegistry;
use App\Models\AuditEvent;
use App\Rest\Ui\ResourceMetadata;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Lomkit\Rest\Facades\Rest;

class AuditTimelineController extends Controller
{
    public function __invoke(Request $request, string $resource, int $id, FeatureRegistry $features): JsonResponse
    {
        $feature = $features->get($resource);
        abort_unless($feature && ! empty($feature['audit']), 404);
        $input = $request->validate(['before' => ['sometimes', 'integer', 'min:1']]);
        $row = Rest::search($feature['resource'])->as($request->user())->payload(['filters' => [['field' => 'id', 'value' => $id]], 'limit' => 10])->page()->first();
        abort_unless($row, 404);
        Gate::authorize('view', $row);
        $definition = new $feature['resource'];
        $metadata = (new ResourceMetadata($definition))->toArray();
        $events = AuditEvent::where('resource', $resource)->where('record_id', $id)->when(isset($input['before']), fn ($query) => $query->where('id', '<', $input['before']))->orderByDesc('id')->limit(21)->get();
        $hasMore = $events->count() > 20;
        $items = $events->take(20)->map(fn (AuditEvent $event): array => [
            'id' => $event->id, 'event' => $event->event, 'actor' => $event->actor_name, 'created_at' => $event->created_at->toIso8601String(),
            'changes' => collect($event->changes)->only($feature['audit'])->map(function (array $change, string $field) use ($definition, $metadata): array {
                $options = ((array) $metadata['fields'])[$field]['options'] ?? [];
                $display = fn ($value) => collect($options)->first(fn ($option) => $option['value'] === $value)['label'] ?? $value;

                return ['label' => ResourceMetadata::label($definition->definition()->fields()->get($field)), ...array_map($display, $change)];
            })->values()->all(),
        ])->values();

        return response()->json(['data' => $items, 'next_cursor' => $hasMore ? $items->last()['id'] : null], 200, ['Cache-Control' => 'private, no-store']);
    }
}
