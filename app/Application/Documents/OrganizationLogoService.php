<?php

namespace App\Application\Documents;

use App\Application\S4ExecutionContext;
use App\Models\Document;
use App\Models\OrganizationSetting;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Stages immutable document blobs for the current issuer profile.
 *
 * Uploading never changes the active logo reference. The ordinary, validated
 * organization-settings save activates a staged logo together with the form.
 */
final class OrganizationLogoService
{
    public const PURPOSE = 'organization-logo';
    public const MAX_BYTES = 2 * 1024 * 1024;
    public const MAX_DIMENSION = 2048;

    public function __construct(private readonly DocumentAttachmentService $documents) {}

    public function upload(UploadedFile $file, User $actor): Document
    {
        abort_unless($actor->isAdmin() && $actor->is_active, 403);

        if (! $file->isValid()) {
            throw ValidationException::withMessages(['file' => 'Die Logodatei konnte nicht vollständig hochgeladen werden.']);
        }
        if ((int) $file->getSize() < 1 || (int) $file->getSize() > self::MAX_BYTES) {
            throw ValidationException::withMessages(['file' => 'Das Logo darf höchstens 2 MiB groß sein.']);
        }

        $source = @file_get_contents($file->getRealPath());
        if (! is_string($source)) {
            throw ValidationException::withMessages(['file' => 'Die Logodatei konnte nicht gelesen werden.']);
        }

        [$bytes, $mimeType, $width, $height] = $this->normalizeRaster($source);
        $name = pathinfo(str_replace(["\0", '/', '\\'], '-', $file->getClientOriginalName()), PATHINFO_FILENAME);
        $name = Str::limit(trim($name) ?: 'Logo', 240, '').($mimeType === 'image/png' ? '.png' : '.jpg');
        $temporary = tempnam(sys_get_temp_dir(), 's4-logo-');
        if ($temporary === false) {
            throw ValidationException::withMessages(['file' => 'Das Logo konnte nicht verarbeitet werden. Bitte versuchen Sie es erneut.']);
        }

        $document = null;
        try {
            if (file_put_contents($temporary, $bytes) !== strlen($bytes)) {
                throw ValidationException::withMessages(['file' => 'Das Logo konnte nicht verarbeitet werden. Bitte versuchen Sie es erneut.']);
            }
            $normalized = new UploadedFile($temporary, $name, $mimeType, null, true);

            return DB::transaction(function () use ($normalized, $actor, $width, $height, &$document): Document {
                // A first upload needs a durable owner, even before the first
                // completed profile save. Defaults have the same visible values
                // as an absent setting; existing values are never overwritten.
                $setting = OrganizationSetting::query()->firstOrCreate(
                    ['section' => 'organization', 'key' => 'communication'],
                    ['payload' => OrganizationSetting::DEFAULTS['communication']],
                );

                $document = $this->documents->storeUploadedFile($normalized, [
                    'resourceType' => 'organization-settings',
                    'resourceId' => (string) $setting->id,
                    'title' => 'Logo für Dokumente',
                    'status' => 'received',
                ], S4ExecutionContext::fromUser($actor, 'web'));
                $document->forceFill([
                    'metadata' => [
                        ...(is_array($document->metadata) ? $document->metadata : []),
                        'purpose' => self::PURPOSE,
                        'imageWidth' => $width,
                        'imageHeight' => $height,
                    ],
                ])->save();

                return $document->fresh();
            });
        } catch (Throwable $error) {
            // AttachmentService handles failures before it returns. If a later
            // metadata/transaction write fails, remove only this new blob.
            if ($document?->path) {
                Storage::disk($document->disk ?: 'local')->delete($document->path);
            }
            throw $error;
        } finally {
            @unlink($temporary);
        }
    }

    /**
     * A logo reference must belong to this communication profile and have been
     * processed by this upload boundary. General attachments cannot become logos.
     */
    public function validateReference(?string $id, ?OrganizationSetting $setting = null): ?Document
    {
        $id = trim((string) $id);
        if ($id === '') {
            return null;
        }

        $setting ??= OrganizationSetting::query()
            ->where('section', 'organization')->where('key', 'communication')->first();
        $document = Str::isUuid($id) ? Document::query()->find($id) : null;

        if (! $setting
            || $setting->section !== 'organization'
            || $setting->key !== 'communication'
            || ! $document
            || $document->documentable_type !== $setting->getMorphClass()
            || $document->documentable_id !== (string) $setting->id
            || data_get($document->metadata, 'purpose') !== self::PURPOSE
            || ! in_array($document->mime_type, ['image/png', 'image/jpeg'], true)
            || $document->size_bytes < 1
            || $document->size_bytes > self::MAX_BYTES
            || ! is_string($document->sha256)
            || preg_match('/^[a-f0-9]{64}$/', $document->sha256) !== 1
            || ! is_string($document->path)
            || $document->path === '') {
            throw $this->invalidReference();
        }

        return $document;
    }

    /** Return verified internal bytes, never a browser-controlled URL or path. */
    public function readValidatedImage(Document $document): string
    {
        $document = $this->validateReference((string) $document->id);
        if (! $document) {
            throw $this->invalidReference();
        }
        try {
            $bytes = Storage::disk($document->disk ?: 'local')->get($document->path);
        } catch (Throwable) {
            throw $this->invalidReference();
        }

        if (! is_string($bytes)
            || strlen($bytes) !== $document->size_bytes
            || ! is_string($document->sha256)
            || ! hash_equals($document->sha256, hash('sha256', $bytes))) {
            throw $this->invalidReference();
        }

        try {
            [$mimeType] = $this->inspectRaster($bytes);
        } catch (ValidationException) {
            throw $this->invalidReference();
        }
        if ($mimeType !== $document->mime_type) {
            throw $this->invalidReference();
        }

        return $bytes;
    }

    /** @return array{id:string,name:string,mimeType:string,sizeBytes:int,previewUrl:string} */
    public function descriptor(Document $document): array
    {
        return [
            'id' => (string) $document->id,
            'name' => $document->original_name,
            'mimeType' => $document->mime_type,
            'sizeBytes' => (int) $document->size_bytes,
            'previewUrl' => $document->preview_url,
        ];
    }

    /** @return array{string,string,int,int} */
    private function normalizeRaster(string $bytes): array
    {
        [$mimeType, $width, $height] = $this->inspectRaster($bytes);
        if (! function_exists('imagecreatefromstring')
            || ! function_exists('imagepng')
            || ! function_exists('imagejpeg')) {
            throw ValidationException::withMessages([
                'file' => 'Die Bildverarbeitung ist derzeit nicht verfügbar. Bitte wenden Sie sich an die Administration.',
            ]);
        }

        $image = @imagecreatefromstring($bytes);
        if ($image === false) {
            throw ValidationException::withMessages(['file' => 'Bitte laden Sie eine vollständig lesbare PNG- oder JPEG-Datei hoch.']);
        }

        // Decode and encode pixels only: EXIF, comments and other uploaded
        // metadata never enter document storage or subsequently generated PDFs.
        ob_start();
        try {
            if ($mimeType === 'image/png') {
                imagealphablending($image, false);
                imagesavealpha($image, true);
                $encoded = imagepng($image, null, 9);
            } else {
                $encoded = imagejpeg($image, null, 90);
            }
            $normalized = ob_get_contents();
        } finally {
            ob_end_clean();
            imagedestroy($image);
        }

        if (! $encoded || ! is_string($normalized) || $normalized === '' || strlen($normalized) > self::MAX_BYTES) {
            throw ValidationException::withMessages([
                'file' => 'Das verarbeitete Logo muss kleiner als 2 MiB sein. Bitte verwenden Sie eine kleinere Bilddatei.',
            ]);
        }

        return [$normalized, $mimeType, $width, $height];
    }

    /** @return array{string,int,int} */
    private function inspectRaster(string $bytes): array
    {
        if ($bytes === '' || strlen($bytes) > self::MAX_BYTES) {
            throw ValidationException::withMessages(['file' => 'Das Logo darf höchstens 2 MiB groß sein.']);
        }

        $image = @getimagesizefromstring($bytes);
        if ($image === false || ! in_array($image[2] ?? null, [IMAGETYPE_PNG, IMAGETYPE_JPEG], true)) {
            throw ValidationException::withMessages(['file' => 'Für das Logo sind ausschließlich PNG- und JPEG-Bilder erlaubt.']);
        }

        [$width, $height] = $image;
        if ($width < 1 || $height < 1 || $width > self::MAX_DIMENSION || $height > self::MAX_DIMENSION) {
            throw ValidationException::withMessages(['file' => 'Das Logo darf höchstens 2048 × 2048 Pixel groß sein.']);
        }

        return [$image[2] === IMAGETYPE_PNG ? 'image/png' : 'image/jpeg', $width, $height];
    }

    private function invalidReference(): ValidationException
    {
        return ValidationException::withMessages([
            'values.logoDocumentId' => 'Das ausgewählte Logo ist nicht verfügbar oder gehört nicht zu diesen Vermieterdaten. Bitte wählen Sie die Datei erneut aus.',
        ]);
    }
}
