<?php

namespace App\Services\Documents;

use App\Models\Document;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\HeaderUtils;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

/** Authorization belongs to each caller; all authorized blob delivery uses this service. */
final class DocumentDeliveryService
{
    public const PREVIEWABLE_MIME_TYPES = [
        'application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'text/plain',
    ];

    public function diskFor(Document $document): FilesystemAdapter
    {
        $path = (string) $document->path;
        $diskName = (string) ($document->disk ?: 'local');
        // Reject absolute paths, streams, control characters and traversal before
        // passing database values to any filesystem adapter.
        abort_if($path === '' || preg_match('/[\\\\:\x00-\x1F\x7F]/', $path)
            || str_starts_with($path, '/')
            || in_array('..', explode('/', $path), true)
            || in_array('.', explode('/', $path), true), 404);
        abort_unless(is_array(config('filesystems.disks.'.$diskName)), 404);

        $disk = Storage::disk($diskName);
        if (config('filesystems.disks.'.$diskName.'.driver') === 'local') {
            $root = realpath($disk->path(''));
            $resolved = realpath($disk->path($path));
            abort_if($root === false || $resolved === false || ! is_file($resolved), 404);
            $root = str_replace('\\', '/', $root);
            $resolved = str_replace('\\', '/', $resolved);
            if (PHP_OS_FAMILY === 'Windows') {
                $root = strtolower($root);
                $resolved = strtolower($resolved);
            }
            abort_unless(str_starts_with($resolved, rtrim($root, '/').'/'), 404);
        }

        return $disk;
    }

    /** @return resource */
    public function open(Document $document)
    {
        $disk = $this->diskFor($document);
        abort_unless($disk->exists($document->path), 404);
        try {
            $stream = $disk->readStream($document->path);
        } catch (Throwable $error) {
            report($error);
            abort(503, 'Die Datei ist momentan nicht verfügbar. Bitte versuchen Sie es erneut.');
        }
        abort_unless(is_resource($stream), 404);

        return $stream;
    }

    public function response(Document $document, Request $request, bool $download, array $context): StreamedResponse
    {
        $mimeType = (string) $document->mime_type;
        abort_if(! $download && ! in_array($mimeType, self::PREVIEWABLE_MIME_TYPES, true), 415,
            'Für diesen Dateityp steht keine sichere Vorschau zur Verfügung.');
        $stream = $this->open($document);
        try {
            // Public share links intentionally retain only the successful login
            // timestamp. Normal in-app document access continues to be audited.
            if (($context['source'] ?? null) !== 'share') {
                app(DocumentAccessLogger::class)->record($document, $request, $download ? 'download' : 'preview', $context);
            }
            $name = trim(preg_replace('/[\\\\\/\x00-\x1F\x7F]+/u', '-', (string) $document->original_name) ?: 'Dokument');
            $fallback = str_replace('%', '-', Str::ascii($name)) ?: 'Dokument';
            $headers = self::privateHeaders() + [
                'Content-Type' => preg_match('/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i', $mimeType) ? $mimeType : 'application/octet-stream',
                'Content-Disposition' => HeaderUtils::makeDisposition($download ? 'attachment' : 'inline', $name, $fallback),
            ];
        } catch (Throwable $error) {
            fclose($stream);
            throw $error;
        }

        return response()->stream(static function () use ($stream): void {
            try {
                while (! feof($stream)) {
                    $chunk = fread($stream, 1024 * 1024);
                    if ($chunk === false) throw new \RuntimeException('Document stream could not be read.');
                    echo $chunk;
                    if (connection_aborted()) break;
                }
            } finally {
                if (is_resource($stream)) fclose($stream);
            }
        }, 200, $headers);
    }

    public static function privateHeaders(): array
    {
        return [
            'Cache-Control' => 'private, no-store, max-age=0',
            'Pragma' => 'no-cache',
            'X-Content-Type-Options' => 'nosniff',
            'Referrer-Policy' => 'no-referrer',
            'X-Frame-Options' => 'SAMEORIGIN',
            'Content-Security-Policy' => "default-src 'none'; frame-ancestors 'self'; sandbox",
        ];
    }
}
