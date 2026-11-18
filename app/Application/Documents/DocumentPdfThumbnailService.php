<?php

namespace App\Application\Documents;

use App\Models\Document;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * Private, best-effort first-page thumbnail cache for the canonical Document.
 *
 * Never derives storage location from titles/categories, never modifies the
 * original PDF and never makes the derivative publicly accessible.
 */
final class DocumentPdfThumbnailService
{
    public function __construct(private readonly DocumentStorageService $storage) {}

    public function path(Document $document): string
    {
        $id = strtolower((string) $document->getKey());
        $shard = hash('sha256', $id);

        return sprintf(
            '%s/previews/%s/%s/%s.jpg',
            $this->storage->prefix(),
            substr($shard, 0, 2),
            substr($shard, 2, 2),
            $id,
        );
    }

    public function generate(string $documentId): bool
    {
        if (! config('documents.previews.pdf_enabled', false) || ! extension_loaded('imagick')) {
            return false;
        }

        $document = Document::query()->find($documentId);
        if (! $document || strtolower((string) $document->mime_type) !== 'application/pdf') {
            return false;
        }

        $maxBytes = max(1, (int) config('documents.previews.max_pdf_bytes', 12 * 1024 * 1024));
        if ((int) $document->size_bytes > $maxBytes || (int) $document->size_bytes <= 0) {
            return false;
        }

        $disk = Storage::disk($document->disk ?: $this->storage->disk());
        $destination = $this->path($document);
        if ($disk->exists($destination) || ! $disk->exists((string) $document->path)) {
            return false;
        }

        $source = $disk->readStream((string) $document->path);
        if (! is_resource($source)) {
            return false;
        }

        $temporaryPath = tempnam(sys_get_temp_dir(), 's4-pdf-thumb-');
        if (! $temporaryPath) {
            fclose($source);

            return false;
        }

        try {
            $output = fopen($temporaryPath, 'wb');
            if (! is_resource($output)) {
                return false;
            }

            try {
                $copied = stream_copy_to_stream($source, $output, $maxBytes + 1);
            } finally {
                fclose($source);
                fclose($output);
            }

            if ($copied === false || $copied > $maxBytes) {
                return false;
            }

            // PDF rasterization requires Imagick + an enabled, sandboxed
            // Ghostscript PDF delegate. It is intentionally opt-in in config.
            $image = new \Imagick();
            try {
                $image->setResolution(80, 80);
                $image->readImage('pdf:'.$temporaryPath.'[0]');
                $image->setImageBackgroundColor('white');
                $image->setImageAlphaChannel(\Imagick::ALPHACHANNEL_REMOVE);
                $image->thumbnailImage(420, 560, true);
                $image->setImageFormat('jpeg');
                $image->setImageCompressionQuality(78);
                $jpeg = $image->getImageBlob();
            } finally {
                $image->clear();
                $image->destroy();
            }

            if ($jpeg === '' || strlen($jpeg) > 1024 * 1024) {
                return false;
            }

            return (bool) $disk->put($destination, $jpeg, ['visibility' => 'private']);
        } catch (Throwable $error) {
            // An unsupported/hostile PDF or missing Ghostscript policy must not
            // break document ingestion; the browser has a pdf.js fallback.
            Log::warning('PDF thumbnail generation skipped.', [
                'documentId' => $documentId,
                'exception' => $error->getMessage(),
            ]);

            return false;
        } finally {
            if (is_resource($source)) {
                fclose($source);
            }
            @unlink($temporaryPath);
        }
    }
}
