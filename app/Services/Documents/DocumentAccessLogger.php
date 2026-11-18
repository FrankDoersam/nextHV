<?php

namespace App\Services\Documents;

use App\Models\Document;
use App\Models\DocumentAccessEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

final class DocumentAccessLogger
{
    public function record(Document $document, Request $request, string $event, array $context): void
    {
        $ip = (string) $request->ip();
        DocumentAccessEvent::query()->create([
            'document_id' => $document->id,
            'user_id' => $context['source'] === 'share' ? null : $request->user()?->id,
            'contract_id' => $context['contractId'] ?? null,
            'document_share_id' => $context['shareId'] ?? null,
            'source' => $context['source'],
            'event_type' => $event,
            'ip_hash' => $ip !== '' ? hash_hmac('sha256', $ip, (string) config('app.key')) : null,
            'user_agent' => Str::limit((string) $request->userAgent(), 500, ''),
            'occurred_at' => now(),
        ]);
    }
}
