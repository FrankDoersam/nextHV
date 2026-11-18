<?php

namespace App\Http\Controllers\Api\Actions;

use App\Models\Document;
use App\Services\Documents\DocumentZipService;
use App\Services\Documents\DocumentAccessLogger;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

final class DownloadDocumentsZipAction
{
    public function __invoke(Request $request, DocumentZipService $archive): StreamedResponse
    {
        abort_unless($request->user()?->isAdmin() && $request->user()?->is_active, 403);
        $validated = $request->validate([
            'documentIds' => ['required', 'array', 'min:1', 'max:100'],
            'documentIds.*' => ['required', 'uuid', 'distinct'],
        ]);

        $ids = $validated['documentIds'];
        $documents = Document::query()->whereIn('id', $ids)->get();

        if ($documents->count() !== count($ids)) {
            throw ValidationException::withMessages([
                'documentIds' => 'Mindestens ein ausgewähltes Dokument ist nicht mehr verfügbar.',
            ]);
        }

        // WHERE IN does not preserve the caller's ordering. Use the verified
        // 100-ID request as the sole order source, also for access logging.
        $positions = array_flip($ids);
        $documents = $documents->sortBy(fn (Document $document): int => $positions[(string) $document->id])->values();

        $response = $archive->download(
            $documents,
            $documents->count() === 1 ? (string) $documents->first()->title : 'Dokumente',
        );
        foreach ($documents as $document) {
            app(DocumentAccessLogger::class)->record($document, $request, 'zip_download', ['source' => 'admin']);
        }

        return $response;
    }
}
