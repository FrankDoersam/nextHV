<?php

namespace App\Http\Controllers\Api\Actions;

use App\Application\Documents\DocumentPdfThumbnailService;
use App\Models\Document;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

final class DocumentThumbnailAction
{
    public function __invoke(Request $request, Document $document, DocumentPdfThumbnailService $previews): StreamedResponse
    {
        abort_unless($request->user()?->isAdmin() && $request->user()?->is_active, 403);
        abort_unless(strtolower((string) $document->mime_type) === 'application/pdf', 404);

        $disk = Storage::disk($document->disk ?: 'local');
        $path = $previews->path($document);
        abort_unless($disk->exists($path), 404);

        return $disk->response($path, null, [
            'Content-Type' => 'image/jpeg',
            'Cache-Control' => 'private, max-age=86400',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
