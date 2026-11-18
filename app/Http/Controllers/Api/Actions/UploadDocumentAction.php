<?php

namespace App\Http\Controllers\Api\Actions;

use App\Application\Documents\DocumentAttachmentService;
use App\Application\Documents\DocumentMetadataClassifier;
use App\Application\S4ExecutionContext;
use App\Models\Document;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class UploadDocumentAction
{
    public function __construct(private readonly DocumentAttachmentService $documents, private readonly DocumentMetadataClassifier $metadata) {}

    public function __invoke(Request $request): JsonResponse
    {
        // Authorization precedes validation and all document/category queries.
        $user = $request->user();
        abort_unless($user instanceof User && $user->isAdmin() && $user->is_active, 403);

        $values = $request->validate([
            // Both target fields may be absent for the central library; a partial target is invalid.
            'resourceType' => ['nullable', 'required_with:resourceId', Rule::in($this->documents->supportedResourceTypes())],
            'resourceId' => ['nullable', 'required_with:resourceType', 'uuid'],
            'file' => [
                'required',
                'file',
                'max:'.$this->documents->maxFileSizeKb(),
                'mimes:'.$this->documents->allowedExtensionsString(),
            ],
            'title' => ['required', 'string', 'max:180'],
            'description' => ['nullable', 'string', 'max:5000'],
            'categoryId' => ['nullable', 'uuid', 'exists:document_categories,id'],
            'status' => ['nullable', Rule::in(Document::STATUSES)],
            'originalName' => ['nullable', 'string', 'max:255'],
            'uploadRequestId' => ['nullable', 'uuid'],
        ]);

        $document = $this->documents->storeUploadedFile(
            $request->file('file'),
            ($values['resourceType'] ?? null) === 'incoming-invoices' ? $this->metadata->enrich($values, 'incoming-invoices') : $values,
            S4ExecutionContext::fromUser($user, 'web'),
        );

        // Return the authoritative document in the upload response itself.
        // Upload callers no longer need an extra GET for every file in a batch.
        // Keep the same attributes as the existing Document JSON:API schema.
        return response()->json([
            'jsonapi' => ['version' => '1.1'],
            'data' => [
                'type' => 'documents',
                'id' => (string) $document->id,
                'attributes' => [
                    'title' => (string) $document->title,
                    'description' => $document->description,
                    'status' => (string) $document->status,
                    'documentableType' => $document->documentable_type,
                    'documentableId' => $document->documentable_id,
                    'categoryId' => $document->category_id,
                    'categoryLabel' => $document->category?->name,
                    'originalName' => (string) $document->original_name,
                    'mimeType' => (string) $document->mime_type,
                    'isImmutable' => $document->isIssuedDunningNotice(),
                    'sizeBytes' => (int) $document->size_bytes,
                    'uploadedByLabel' => $user->name,
                    'createdAt' => $document->created_at?->toIso8601String(),
                    'updatedAt' => $document->updated_at?->toIso8601String(),
                    'previewUrl' => $document->preview_url,
                    'downloadUrl' => $document->download_url,
                ],
            ],
        ], 201, ['Content-Type' => 'application/vnd.api+json']);
    }
}
