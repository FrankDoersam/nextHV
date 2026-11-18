<?php

namespace App\Application\Documents;

use App\Application\S4ExecutionContext;
use App\Models\Document;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;

final class IncomingInvoiceOriginalDocumentService
{
    public const REQUEST_ATTRIBUTE = 's4_mcp_incoming_invoice_original';

    public function __construct(
        private readonly DocumentAttachmentService $documents,
        private readonly DocumentMetadataClassifier $metadata,
    ) {}

    public function store(array $transport, array $invoicePayload, array $invoiceResult, User $user, ?string $clientName = null): Document
    {
        $path = trim((string) ($transport['path'] ?? ''));
        $fileName = trim((string) ($transport['fileName'] ?? ''));
        $mimeType = trim((string) ($transport['mimeType'] ?? '')) ?: 'application/octet-stream';

        if ($path === '' || ! is_file($path) || $fileName === '') {
            throw ValidationException::withMessages([
                'sourceFile' => 'Der direkte Originalbeleg der Eingangsrechnung ist nicht mehr verfügbar.',
            ]);
        }

        $file = new UploadedFile($path, $fileName, $mimeType, null, true);
        $source = [
            'required' => true,
            'fileName' => $fileName,
            'mimeType' => $mimeType,
            'sizeBytes' => (int) ($transport['sizeBytes'] ?? filesize($path)),
            'sha256' => trim((string) ($transport['sha256'] ?? '')) ?: hash_file('sha256', $path),
            'origin' => trim((string) ($transport['origin'] ?? 'chat_upload')) ?: 'chat_upload',
        ];

        $payload = $this->metadata->invoiceDocumentPayload($invoicePayload, $invoiceResult, $source);

        return $this->documents->storeUploadedFile(
            $file,
            $payload,
            S4ExecutionContext::fromUser($user, 'mcp', $clientName),
        );
    }

    public function descriptor(Document $document): array
    {
        return [
            'id' => (string) $document->id,
            'title' => $document->title,
            'categoryId' => $document->category_id ? (string) $document->category_id : null,
            'fileName' => $document->original_name,
            'mimeType' => $document->mime_type,
            'sizeBytes' => (int) $document->size_bytes,
            'sha256' => $document->sha256,
            'previewUrl' => $document->preview_url,
            'downloadUrl' => $document->download_url,
        ];
    }
}
