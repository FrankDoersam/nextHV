<?php

namespace App\Application\Documents;

use App\Application\S4ExecutionContext;
use App\Models\BusinessPartner;
use App\Models\Contract;
use App\Models\Document;
use App\Models\DirectAllocation;
use App\Models\DocumentCategory;
use App\Models\IncomingInvoice;
use App\Models\Meter;
use App\Models\OpenItem;
use App\Models\OrganizationSetting;
use App\Models\Property;
use App\Models\Unit;
use App\Models\UnitFacility;
use App\Models\WasteContainer;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

final class DocumentAttachmentService
{
    private const RESOURCE_MAP = [
        'business-partners' => BusinessPartner::class,
        'contracts' => Contract::class,
        'properties' => Property::class,
        'units' => Unit::class,
        'meters' => Meter::class,
        'unit-facilities' => UnitFacility::class,
        'incoming-invoices' => IncomingInvoice::class,
        'waste-containers' => WasteContainer::class,
        'open-items' => OpenItem::class,
        'direct-allocations' => DirectAllocation::class,
        'organization-settings' => OrganizationSetting::class,
    ];

    private const DOCUMENT_EXTENSIONS = [
        'pdf', 'jpg', 'jpeg', 'png', 'webp', 'tif', 'tiff', 'xml',
        'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'txt', 'rtf', 'odt', 'ods', 'odp',
    ];

    private const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'tif', 'tiff'];

    public function __construct(private readonly DocumentStorageService $storage) {}

    public function supportedResourceTypes(): array
    {
        return array_keys(self::RESOURCE_MAP);
    }

    public function allowedExtensions(bool $imageOnly = false): array
    {
        return $imageOnly ? self::IMAGE_EXTENSIONS : self::DOCUMENT_EXTENSIONS;
    }

    public function allowedExtensionsString(bool $imageOnly = false): string
    {
        return implode(',', $this->allowedExtensions($imageOnly));
    }

    public function maxFileSizeKb(): int
    {
        return max(1, (int) config('documents.attachment_max_kb', config('mcp.attachment_max_kb', 51200)));
    }

    public function assertUploadedFile(UploadedFile $file, bool $imageOnly = false, ?int $maxBytes = null): void
    {
        $this->validatedUploadedMime($file, $imageOnly, $maxBytes);
    }

    /**
     * Analyze an uploaded file once and return the canonical MIME for both the
     * validated descriptor and the persisted Document. This avoids repeating
     * PHP fileinfo calls on the same bytes during multi-upload.
     */
    private function validatedUploadedMime(UploadedFile $file, bool $imageOnly = false, ?int $maxBytes = null): string
    {
        $mime = strtolower((string) ($file->getMimeType() ?: 'application/octet-stream'));
        $this->assertFileDescriptor(
            $file->getClientOriginalName(),
            $mime,
            (int) $file->getSize(),
            $imageOnly,
            $maxBytes,
        );

        // All producers (web, MCP and contextual) must agree on what is being
        // stored. Extension allowlisting alone cannot stop a JPEG disguised
        // as .pdf, and preview/download clients trust the stored MIME value.
        // Office containers are intentionally not strict here: providers may
        // identify an OOXML document as application/zip.
        $extension = strtolower($file->getClientOriginalExtension());
        $pdfMimes = ['application/pdf', 'application/x-pdf'];
        $imageMimes = match ($extension) {
            'jpg', 'jpeg' => ['image/jpeg', 'image/pjpeg'],
            'png' => ['image/png'],
            'webp' => ['image/webp'],
            'tif', 'tiff' => ['image/tiff', 'image/x-tiff'],
            default => null,
        };

        if (($extension === 'pdf' && ! in_array($mime, $pdfMimes, true))
            || ($extension !== 'pdf' && in_array($mime, $pdfMimes, true))
            || ($imageMimes !== null && ! in_array($mime, $imageMimes, true))
            || (str_starts_with($mime, 'image/') && $imageMimes === null)) {
            throw ValidationException::withMessages([
                'file' => 'Die Dateiendung stimmt nicht mit dem erkannten PDF- oder Bildformat überein.',
            ]);
        }

        // Direct service/MCP callers bypass the HTTP "mimes" validator. Do
        // not allow a script, HTML page or executable renamed as .txt/.docx.
        // This is a content-type policy, not an antivirus/macro scanner.
        $activeMimes = [
            'text/html', 'application/xhtml+xml',
            'text/x-php', 'application/x-php', 'application/x-httpd-php',
            'text/javascript', 'application/javascript', 'application/x-javascript',
            'application/x-sh', 'text/x-shellscript', 'application/x-bat',
            'application/x-msdownload', 'application/x-dosexec',
            'application/x-executable', 'application/x-msdos-program',
            'application/java-archive',
        ];
        if (in_array($mime, $activeMimes, true)) {
            throw ValidationException::withMessages([
                'file' => 'Aktive Skripte und ausführbare Dateien dürfen nicht als Dokument abgelegt werden.',
            ]);
        }

        // Persist a MIME supported by the existing document viewer, rather
        // than retaining a platform-specific alias which would break preview.
        return match ($mime) {
            'application/x-pdf' => 'application/pdf',
            'image/pjpeg' => 'image/jpeg',
            'image/x-tiff' => 'image/tiff',
            default => $mime,
        };
    }

    public function assertStoredDocument(Document $document, bool $imageOnly = false, ?int $maxBytes = null): void
    {
        $this->assertFileDescriptor(
            (string) $document->original_name,
            (string) $document->mime_type,
            (int) $document->size_bytes,
            $imageOnly,
            $maxBytes,
        );
    }

    public function inspect(array $payload, ?string $fixedResourceType = null, bool $requireDocument = false, bool $allowLibrary = false): array
    {
        $source = is_array($payload['sourceAttachment'] ?? null) ? $payload['sourceAttachment'] : [];
        $resourceType = $fixedResourceType
            ?? trim((string) ($payload['resourceType'] ?? data_get($payload, 'target.resource', '')));
        $resourceId = trim((string) ($payload['resourceId'] ?? data_get($payload, 'target.id', $payload['id'] ?? '')));
        $title = trim((string) ($payload['title'] ?? ''));
        if ($title === '') {
            $title = trim((string) ($source['fileName'] ?? '')) ?: 'Dokument';
        }
        $description = trim((string) ($payload['description'] ?? '')) ?: null;
        $categoryId = trim((string) ($payload['categoryId'] ?? '')) ?: null;
        $status = trim((string) ($payload['status'] ?? '')) ?: 'received';
        $originalName = trim((string) ($payload['originalName'] ?? '')) ?: null;
        $documentId = trim((string) ($payload['documentId'] ?? '')) ?: null;
        $errors = [];
        // Documents uploaded to the central library have no business owner yet.
        // Callers must opt in; an incomplete target must never become an unassigned upload.
        $isLibrary = $allowLibrary && $resourceType === '' && $resourceId === '';

        if (! $isLibrary && ! array_key_exists($resourceType, self::RESOURCE_MAP)) {
            $errors['resourceType'][] = 'Diese Ressource unterstützt keine Dokumentablage.';
        }
        if (! $isLibrary && ! Str::isUuid($resourceId)) {
            $errors['resourceId'][] = 'Die Ziel-ID muss eine gültige S4-UUID sein.';
        }
        if (mb_strlen($title) > 255) {
            $errors['title'][] = 'Der Dokumenttitel darf höchstens 255 Zeichen lang sein.';
        }
        if ($description !== null && mb_strlen($description) > 5000) {
            $errors['description'][] = 'Die Dokumentbeschreibung darf höchstens 5.000 Zeichen lang sein.';
        }

        if ($categoryId !== null) {
            $category = Str::isUuid($categoryId) ? DocumentCategory::query()->find($categoryId) : null;
            if (! $category) {
                $errors['categoryId'][] = 'Die Dokumentkategorie wurde nicht gefunden.';
            } elseif (! $category->is_active) {
                $errors['categoryId'][] = 'Die Dokumentkategorie ist deaktiviert.';
            } elseif (! $isLibrary && is_array($category->resource_types)
                && $category->resource_types !== []
                && ! in_array($resourceType, $category->resource_types, true)) {
                $errors['categoryId'][] = 'Die Dokumentkategorie ist für diese Ressource nicht freigegeben.';
            }
        }

        if (! in_array($status, Document::STATUSES, true)) {
            $errors['status'][] = 'Der Dokumentstatus ist ungültig.';
        }

        $document = null;
        if ($requireDocument) {
            $document = $documentId ? Document::query()->find($documentId) : null;
            if (! $document) {
                $errors['documentId'][] = 'Die zu bindende Originaldatei wurde nicht gefunden.';
            } else {
                try {
                    $this->assertStoredDocument($document);
                } catch (ValidationException $error) {
                    foreach ($error->errors() as $field => $messages) {
                        foreach ($messages as $message) {
                            $errors[$field][] = $message;
                        }
                    }
                }
            }
        } elseif (($source['fileName'] ?? null) || ($source['sizeBytes'] ?? null)) {
            try {
                $this->assertFileDescriptor(
                    (string) ($source['fileName'] ?? 'Dokument'),
                    (string) ($source['mimeType'] ?? 'application/octet-stream'),
                    (int) ($source['sizeBytes'] ?? 0),
                );
            } catch (ValidationException $error) {
                foreach ($error->errors() as $field => $messages) {
                    foreach ($messages as $message) {
                        $errors[$field][] = $message;
                    }
                }
            }
        }

        $target = null;
        if (! $isLibrary && ! isset($errors['resourceType']) && ! isset($errors['resourceId'])) {
            $target = $this->findTarget($resourceType, $resourceId);
            if (! $target) {
                $errors['resourceId'][] = 'Das Ziel der Dokumentablage wurde nicht gefunden oder ist gelöscht.';
            }
        }

        $source['required'] = true;

        return [
            'normalized' => array_filter([
                'resourceType' => $resourceType,
                'resourceId' => $resourceId,
                'title' => $title,
                'description' => $description,
                'categoryId' => $categoryId,
                'status' => $status,
                'originalName' => $originalName,
                'documentId' => $documentId,
                'sourceAttachment' => $source,
            ], static fn (mixed $value): bool => $value !== null),
            'target' => $target ? $this->descriptor($resourceType, $target) : null,
            'errors' => $errors,
        ];
    }

    public function attachExisting(Document $document, array $payload, S4ExecutionContext $context, ?string $fixedResourceType = null): Document
    {
        if (data_get($document->metadata, 'purpose') === OrganizationLogoService::PURPOSE) {
            throw ValidationException::withMessages([
                'documentId' => 'Ein Vermieterlogo kann keinem anderen Datensatz zugeordnet werden. Laden Sie die Datei dafür erneut hoch.',
            ]);
        }

        $this->assertStoredDocument($document);
        $inspection = $this->inspect([
            ...$payload,
            // Validate the effective category, including an existing assignment,
            // before a library document can be moved into a resource context.
            'categoryId' => $payload['categoryId'] ?? $document->category_id,
            'documentId' => (string) $document->id,
            'sourceAttachment' => [
                'required' => true,
                'fileName' => $document->original_name,
                'mimeType' => $document->mime_type,
                'sizeBytes' => $document->size_bytes,
                'sha256' => $document->sha256,
            ],
        ], $fixedResourceType, true);
        if ($inspection['errors'] !== []) {
            throw ValidationException::withMessages($inspection['errors']);
        }

        $values = $inspection['normalized'];
        $target = $this->findTarget($values['resourceType'], $values['resourceId']);
        if (! $target) {
            throw ValidationException::withMessages(['resourceId' => 'Das Ziel der Dokumentablage wurde nicht gefunden oder ist gelöscht.']);
        }

        $metadata = is_array($document->metadata) ? $document->metadata : [];
        unset($metadata['location']);
        $targetInfo = $this->descriptor($values['resourceType'], $target);
        $document->forceFill([
            'documentable_type' => $target->getMorphClass(),
            'documentable_id' => $target->getKey(),
            'category_id' => $values['categoryId'] ?? $document->category_id,
            'title' => Str::limit($values['title'], 255, ''),
            'description' => $values['description'] ?? null,
            'status' => $values['status'] ?? 'received',
            'uploaded_by' => $document->uploaded_by ?: $context->actor->id,
            'metadata' => [
                ...$metadata,
                'source' => $context->channel === 'mcp' ? 'chatgpt-mcp' : $context->channel,
                'actorUserId' => (string) $context->actor->id,
                'targetResourceType' => $values['resourceType'],
                'targetResourceId' => (string) $target->getKey(),
                'targetLabel' => $targetInfo['label'],
                ...$this->resourceMetadata($values['resourceType'], $target),
            ],
        ])->save();

        return $document->fresh();
    }

    public function storeUploadedFile(UploadedFile $file, array $payload, S4ExecutionContext $context): Document
    {
        $mimeType = $this->validatedUploadedMime($file);

        $source = [
            'required' => true,
            'fileName' => $file->getClientOriginalName(),
            'mimeType' => $mimeType,
            'sizeBytes' => $file->getSize(),
        ];
        $inspection = $this->inspect([...$payload, 'sourceAttachment' => $source], allowLibrary: true);
        if ($inspection['errors'] !== []) {
            throw ValidationException::withMessages($inspection['errors']);
        }

        $values = $inspection['normalized'];
        $originalName = $this->normalizeUploadOriginalName(
            (string) ($values['originalName'] ?? $file->getClientOriginalName()),
            $file->getClientOriginalName(),
        );
        $values['originalName'] = $originalName;
        $uploadRequestId = trim((string) ($payload['uploadRequestId'] ?? '')) ?: null;
        if ($uploadRequestId !== null && ! Str::isUuid($uploadRequestId)) {
            throw ValidationException::withMessages(['uploadRequestId' => 'Die Upload-Kennung muss eine UUID sein.']);
        }
        $existing = $this->existingUpload($uploadRequestId, $file, $values, $context);
        if ($existing) {
            return $existing;
        }
        $library = $values['resourceType'] === '' && $values['resourceId'] === '';
        $target = $library ? null : $this->findTarget($values['resourceType'], $values['resourceId']);
        if (! $library && ! $target) {
            throw ValidationException::withMessages(['resourceId' => 'Das Ziel der Dokumentablage wurde nicht gefunden oder ist gelöscht.']);
        }

        $documentId = (string) Str::uuid();
        $disk = $this->storage->disk();
        // Physical storage extension comes from the validated uploaded blob,
        // NOT the editable download name. Renaming never relocates or converts
        // the file and cannot make a PDF look like an executable.
        $canonicalPath = $this->storage->canonicalPath($documentId, null, $file->getClientOriginalName());
        $path = $file->storeAs(dirname($canonicalPath), basename($canonicalPath), ['disk' => $disk]);
        if (! $path) {
            throw ValidationException::withMessages(['file' => 'Das Dokument konnte nicht gespeichert werden.']);
        }

        try {
            $targetInfo = $target ? $this->descriptor($values['resourceType'], $target) : null;
            $document = new Document([
                'documentable_type' => $target?->getMorphClass(),
                'documentable_id' => $target?->getKey(),
                'category_id' => $values['categoryId'] ?? null,
                'title' => Str::limit($values['title'], 255, ''),
                'description' => $values['description'] ?? null,
                'status' => $values['status'] ?? 'received',
                'disk' => $disk,
                'path' => $path,
                'original_name' => $originalName,
                'mime_type' => $mimeType,
                'size_bytes' => $file->getSize(),
                'sha256' => hash_file('sha256', $file->getRealPath()),
                'uploaded_by' => $context->actor->id,
                'upload_request_id' => $uploadRequestId,
                'metadata' => [
                    'source' => $context->channel,
                    'actorUserId' => (string) $context->actor->id,
                    'uploadedOriginalName' => $file->getClientOriginalName(),
                    ...($target ? [
                        'targetResourceType' => $values['resourceType'],
                        'targetResourceId' => (string) $target->getKey(),
                        'targetLabel' => $targetInfo['label'],
                        ...$this->resourceMetadata($values['resourceType'], $target),
                    ] : ['location' => 'library']),
                ],
            ]);
            $document->setAttribute($document->getKeyName(), $documentId);
            // A unique uploadRequestId can lose a race to another request.
            // Rolling back an inner transaction/savepoint keeps PostgreSQL
            // connections usable for the idempotent winner lookup below.
            // The blob still lives under this request's distinct UUID and is
            // cleaned up if the insert fails.
            DB::transaction(static function () use ($document): void {
                $document->save();
            });

            return $document;
        } catch (Throwable $error) {
            Storage::disk($disk)->delete($path);
            // A concurrent retry can win the unique token insert. In that
            // case return the authoritative document, never a second blob.
            if ($uploadRequestId !== null && $error instanceof \Illuminate\Database\QueryException) {
                $existing = $this->existingUpload($uploadRequestId, $file, $values, $context);
                if ($existing) {
                    return $existing;
                }
            }
            throw $error;
        }
    }

    /**
     * The download name is metadata; the uploaded binary, its detected MIME
     * and its storage extension remain authoritative. All web and MCP upload
     * producers use this same service boundary.
     */
    private function normalizeUploadOriginalName(string $requested, string $sourceName): string
    {
        $sourceExtension = strtolower((string) pathinfo($sourceName, PATHINFO_EXTENSION));
        if ($sourceExtension === '' || ! in_array($sourceExtension, self::DOCUMENT_EXTENSIONS, true)) {
            throw ValidationException::withMessages(['file' => 'Die Originaldatei hat keinen freigegebenen Dateityp.']);
        }

        $name = trim($requested);
        if ($name === '' || preg_match('/[\\\\\/\x00-\x1F\x7F]/u', $name)) {
            throw ValidationException::withMessages([
                'originalName' => 'Bitte einen Dateinamen ohne Pfad- oder Steuerzeichen angeben.',
            ]);
        }

        // Preserve a portable, non-deceptive download name. The title may
        // contain free-form text, but the filename is used in ZIP exports and
        // HTTP Content-Disposition on different operating systems.
        if (! mb_check_encoding($name, 'UTF-8')
            || preg_match('/[<>:"|?*]/u', $name)
            || preg_match('/[\x{202A}-\x{202E}\x{2066}-\x{2069}]/u', $name)) {
            throw ValidationException::withMessages([
                'originalName' => 'Der Dateiname enthält nicht unterstützte Zeichen.',
            ]);
        }

        $requestedExtension = strtolower((string) pathinfo($name, PATHINFO_EXTENSION));
        if ($requestedExtension === '') {
            $name .= '.'.$sourceExtension;
        } elseif ($requestedExtension !== $sourceExtension) {
            throw ValidationException::withMessages([
                'originalName' => 'Die Dateiendung muss .'.$sourceExtension.' bleiben. Sie können den Namen davor ändern.',
            ]);
        }

        $stem = substr($name, 0, -strlen($sourceExtension) - 1);
        $previousExtension = strtolower((string) pathinfo($stem, PATHINFO_EXTENSION));
        if (trim($stem, '. ') === '' || str_ends_with($stem, '.')
            || preg_match('/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i', $stem)
            || in_array($previousExtension, self::DOCUMENT_EXTENSIONS, true)
            || in_array($previousExtension, ['exe', 'com', 'bat', 'cmd', 'msi', 'dll', 'ps1', 'sh', 'php', 'py', 'jar', 'scr', 'pif', 'cpl', 'vbs', 'vbe', 'hta', 'lnk', 'reg', 'msp', 'apk'], true)) {
            throw ValidationException::withMessages([
                'originalName' => 'Bitte einen Dateinamen ohne weitere Dateiendung oder reservierte Systemnamen angeben.',
            ]);
        }

        if (mb_strlen($name) > 255) {
            throw ValidationException::withMessages([
                'originalName' => 'Der Dateiname darf einschließlich Endung höchstens 255 Zeichen enthalten.',
            ]);
        }

        return $name;
    }

    private function existingUpload(?string $requestId, UploadedFile $file, array $values, S4ExecutionContext $context): ?Document
    {
        if ($requestId === null) {
            return null;
        }

        $existing = Document::withTrashed()->where('upload_request_id', $requestId)->first();
        if (! $existing) {
            return null;
        }
        $sameTarget = $values['resourceType'] === ''
            ? $existing->getRawOriginal('documentable_type') === null && $existing->getRawOriginal('documentable_id') === null
            : data_get($existing->metadata, 'targetResourceType') === $values['resourceType']
                && (string) $existing->documentable_id === $values['resourceId'];
        if ($existing->trashed()
            || (string) $existing->uploaded_by !== (string) $context->actor->id
            || ! $sameTarget
            || ! hash_equals((string) $existing->sha256, (string) hash_file('sha256', $file->getRealPath()))) {
            throw ValidationException::withMessages([
                'uploadRequestId' => 'Diese Upload-Kennung gehört bereits zu einer anderen oder gelöschten Datei.',
            ]);
        }

        // A token is a single immutable upload command, not a shortcut for
        // overwriting metadata on a document which might already be saved.
        // Reject edited replays rather than silently claiming new names were
        // persisted or creating a second copy of an uncertain upload.
        if ((string) $existing->title !== (string) $values['title']
            || (string) $existing->original_name !== (string) $values['originalName']
            || ($existing->description ?? null) !== ($values['description'] ?? null)
            || (string) $existing->status !== (string) ($values['status'] ?? 'received')
            || (string) ($existing->category_id ?? '') !== (string) ($values['categoryId'] ?? '')) {
            throw ValidationException::withMessages([
                'uploadRequestId' => 'Die Datei wurde möglicherweise bereits mit anderen Angaben gespeichert. Bitte die Dokumentenliste aktualisieren und den gespeicherten Eintrag bearbeiten.',
            ]);
        }

        return $existing;
    }

    public function target(string $resourceType, string $resourceId): array
    {
        $target = $this->findTarget($resourceType, $resourceId);
        if (! $target) {
            throw ValidationException::withMessages(['resourceId' => 'Das Ziel der Dokumentablage wurde nicht gefunden oder ist gelöscht.']);
        }

        return $this->descriptor($resourceType, $target);
    }

    private function assertFileDescriptor(
        string $fileName,
        string $mimeType,
        int $sizeBytes,
        bool $imageOnly = false,
        ?int $maxBytes = null,
    ): void {
        $extension = strtolower((string) pathinfo($fileName, PATHINFO_EXTENSION));
        $allowed = $this->allowedExtensions($imageOnly);
        $max = $maxBytes ?? ($this->maxFileSizeKb() * 1024);
        $errors = [];

        if ($extension === '' || ! in_array($extension, $allowed, true)) {
            $errors['file'][] = $imageOnly
                ? 'Als Nachweis ist eine unterstützte Bilddatei erforderlich.'
                : 'Dieser Dateityp ist für die S4-Dokumentablage nicht freigegeben.';
        }
        if ($sizeBytes > $max) {
            $errors['file'][] = 'Die Datei überschreitet die maximal zulässige Größe.';
        }
        if ($sizeBytes < 0) {
            $errors['file'][] = 'Die Dateigröße ist ungültig.';
        }
        if ($imageOnly && $mimeType !== '' && $mimeType !== 'application/octet-stream' && ! str_starts_with($mimeType, 'image/')) {
            $errors['file'][] = 'Als Nachweis ist eine Bilddatei erforderlich.';
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }
    }

    private function findTarget(string $resourceType, string $resourceId): ?Model
    {
        $model = self::RESOURCE_MAP[$resourceType] ?? null;
        if (! $model || ! Str::isUuid($resourceId)) {
            return null;
        }

        $query = $model::query();
        if ($resourceType === 'organization-settings') {
            $query->where('section', 'organization')->where('key', 'communication');
        }

        return $query->find($resourceId);
    }

    private function descriptor(string $resourceType, Model $target): array
    {
        return DocumentSourceProjection::targetDescriptor($resourceType, $target);
    }

    private function resourceMetadata(string $resourceType, Model $target): array
    {
        return match ($resourceType) {
            'business-partners' => [
                'businessPartnerId' => (string) $target->getKey(),
                'businessPartnerNumber' => $target->partner_number,
            ],
            'contracts' => [
                'contractId' => (string) $target->getKey(),
                'contractNumber' => $target->contract_number,
                'propertyLabel' => $target->property_label ?: null,
            ],
            'properties' => [
                'propertyId' => (string) $target->getKey(),
                'propertyNumber' => $target->property_number,
            ],
            'units' => [
                'unitId' => (string) $target->getKey(),
                'unitNumber' => $target->unit_number,
            ],
            'meters' => [
                'meterId' => (string) $target->getKey(),
                'meterNumber' => $target->meter_number,
            ],
            'unit-facilities' => [
                'unitFacilityId' => (string) $target->getKey(),
                'facilityLabel' => $target->label,
                'serialNumber' => $target->serial_number,
                'unitId' => (string) $target->unit_id,
            ],
            'incoming-invoices' => [
                'incomingInvoiceId' => (string) $target->getKey(),
                'incomingInvoiceNumber' => $target->number,
                'incomingInvoiceDocumentType' => $target->document_type,
                'incomingInvoiceOriginalId' => $target->original_invoice_id,
            ],
            'waste-containers' => [
                'wasteContainerId' => (string) $target->getKey(),
                'wasteContainerNumber' => $target->container_number,
            ],
            'open-items' => [
                'openItemId' => (string) $target->getKey(),
                'openItemNumber' => $target->number,
            ],
            'organization-settings' => [
                'organizationSettingId' => (string) $target->getKey(),
                'organizationSettingKey' => $target->key,
            ],
            default => [],
        };
    }
}
