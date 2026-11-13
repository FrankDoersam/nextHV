<?php

namespace App\Http\Controllers;

use App\Models\IdentityDocument;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class IdentityFileController extends Controller
{
    public function store(Request $request, IdentityDocument $document): JsonResponse
    {
        Gate::authorize('update', $document);
        $request->validate(['file' => ['required', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:10240']]);
        $file = $request->file('file');
        $path = 'identity/'.Str::uuid().'.enc';
        $old = $document->storage_path;
        if (! Storage::disk('local')->put($path, Crypt::encryptString($file->get()))) {
            throw new \RuntimeException('Datei konnte nicht gespeichert werden.');
        }
        try {
            $document->update(['storage_path' => $path, 'mime_type' => $file->getMimeType(), 'size' => $file->getSize()]);
        } catch (\Throwable $e) {
            Storage::disk('local')->delete($path);
            throw $e;
        }
        if ($old) {
            Storage::disk('local')->delete($old);
        }

        return response()->json(['data' => ['id' => $document->id, 'size' => $document->size]]);
    }

    public function show(IdentityDocument $document): Response
    {
        Gate::authorize('view', $document);
        abort_unless($document->storage_path && Storage::disk('local')->exists($document->storage_path), 404);
        $ext = match ($document->mime_type) {
            'application/pdf' => 'pdf','image/png' => 'png',default => 'jpg'
        };

        return response(Crypt::decryptString(Storage::disk('local')->get($document->storage_path)))->header('Content-Type', $document->mime_type)->header('Content-Disposition', 'attachment; filename="document-'.$document->id.'.'.$ext.'"')->header('Cache-Control', 'no-store, private')->header('X-Content-Type-Options', 'nosniff');
    }
}
