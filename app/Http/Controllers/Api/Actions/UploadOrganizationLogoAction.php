<?php

namespace App\Http\Controllers\Api\Actions;

use App\Application\Documents\OrganizationLogoService;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

final class UploadOrganizationLogoAction
{
    public function __invoke(Request $request, OrganizationLogoService $logos): JsonResponse
    {
        $actor = $request->user();
        abort_unless($actor instanceof User && $actor->isAdmin(), 403);
        try {
            $request->validate([
                'file' => ['required', 'file', 'max:2048', 'mimetypes:image/png,image/jpeg'],
            ], [
                'file.required' => 'Bitte wählen Sie eine PNG- oder JPEG-Datei aus.',
                'file.file' => 'Die Logodatei konnte nicht vollständig hochgeladen werden.',
                'file.max' => 'Das Logo darf höchstens 2 MiB groß sein.',
                'file.mimetypes' => 'Für das Logo sind ausschließlich PNG- und JPEG-Bilder erlaubt.',
            ]);
            $document = $logos->upload($request->file('file'), $actor);
        } catch (ValidationException $error) {
            // Multipart clients request application/json. Keep their validation
            // failures compatible with the shared JsonApiError form boundary.
            $errors = [];
            foreach ($error->errors() as $messages) {
                foreach ($messages as $message) {
                    $errors[] = [
                        'status' => '422',
                        'title' => 'Das Logo konnte nicht übernommen werden.',
                        'detail' => $message,
                        'source' => ['pointer' => '/data/attributes/values/logoDocumentId'],
                    ];
                }
            }

            return response()->json([
                'jsonapi' => ['version' => '1.1'],
                'errors' => $errors,
            ], 422, ['Content-Type' => 'application/vnd.api+json']);
        }

        return response()->json(['data' => $logos->descriptor($document)], 201);
    }
}
