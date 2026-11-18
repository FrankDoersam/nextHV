<?php

namespace App\Http\Controllers\Api\Actions;

use App\Models\Document;
use App\Services\Documents\DocumentDeliveryService;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class DocumentContentAction
{
    public function __invoke(Request $request, Document $document, DocumentDeliveryService $delivery): StreamedResponse
    {
        abort_unless($request->user()?->isAdmin() && $request->user()?->is_active, 403);

        return $delivery->response($document, $request, $request->boolean('download'), ['source' => 'admin']);
    }
}
