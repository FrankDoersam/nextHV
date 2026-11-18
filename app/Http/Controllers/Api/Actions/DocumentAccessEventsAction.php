<?php

namespace App\Http\Controllers\Api\Actions;

use App\Models\Document;
use App\Models\DocumentAccessEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class DocumentAccessEventsAction
{
    public function __invoke(Request $request, Document $document): JsonResponse
    {
        abort_unless($request->user()?->isAdmin() && $request->user()?->is_active, 403);
        $events = DocumentAccessEvent::query()->where('document_id', $document->id)
            ->with(['user:id,name', 'share:id,name'])->orderByDesc('occurred_at')->orderByDesc('id')
            ->paginate(50);

        return response()->json([
            'jsonapi' => ['version' => '1.0'],
            'data' => collect($events->items())->map(fn (DocumentAccessEvent $event) => [
                'type' => 'document-access-events', 'id' => (string) $event->id,
                'attributes' => [
                    'eventType' => $event->event_type,
                    'source' => $event->source,
                    'actorLabel' => $event->source === 'share' ? ($event->share?->name ?? 'Dokumentfreigabe') : ($event->user?->name ?? 'Gelöschter Benutzer'),
                    'occurredAt' => $event->occurred_at?->toIso8601String(),
                ],
            ])->values(),
            'meta' => ['total' => $events->total(), 'currentPage' => $events->currentPage(), 'lastPage' => $events->lastPage()],
        ], 200, ['Content-Type' => 'application/vnd.api+json', 'Cache-Control' => 'private, no-store']);
    }
}
