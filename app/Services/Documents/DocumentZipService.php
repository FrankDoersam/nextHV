<?php

namespace App\Services\Documents;

use App\Models\Document;
use Illuminate\Support\Str;
use RuntimeException;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

final class DocumentZipService
{
    private const ZIP_UTF8_DATA_DESCRIPTOR_FLAGS = 0x0808;
    private const ZIP_UINT32_MAX = 0xFFFFFFFF;

    /**
     * @param iterable<int, Document> $documents
     */
    public function download(
        iterable $documents,
        string $name = 'Dokumente',
        string $emptyMessage = 'Für diese Auswahl sind derzeit keine Dateien verfügbar.',
        int $maxDocuments = 100,
    ): StreamedResponse {
        $documents = collect($documents)->values();
        abort_if($maxDocuments < 1 || $maxDocuments > 300 || $documents->count() > $maxDocuments, 422, 'Zu viele Dokumente für dieses ZIP-Archiv. Bitte Auswahl aufteilen.');
        $maximumBytes = max(1, (int) config('documents.archive_max_bytes', 512 * 1024 * 1024));
        abort_if($documents->sum('size_bytes') > $maximumBytes, 422, 'Die Auswahl ist zu groß. Bitte laden Sie kleinere Gruppen herunter.');
        $tempPath = tempnam(sys_get_temp_dir(), 's4-doc-archive-');
        abort_if($tempPath === false, 503, 'Das ZIP-Archiv konnte nicht vorbereitet werden.');

        try {
            $added = $this->writePortableZip($tempPath, $documents);
        } catch (Throwable $exception) {
            @unlink($tempPath);
            report($exception);
            abort(503, 'Das ZIP-Archiv konnte nicht erstellt werden. Bitte laden Sie die Dokumente einzeln herunter oder versuchen Sie es erneut.');
        }

        if ($added === 0) {
            @unlink($tempPath);
            abort(404, $emptyMessage);
        }

        $base = Str::slug($name) ?: 'dokumente';
        // Also clean up when an audit write aborts the request or the response
        // callback is never sent (for example a disconnected client).
        register_shutdown_function(static function () use ($tempPath): void {
            if (is_file($tempPath)) @unlink($tempPath);
        });

        return response()->streamDownload(static function () use ($tempPath): void {
            $stream = fopen($tempPath, 'rb');
            if (! is_resource($stream)) {
                @unlink($tempPath);

                return;
            }

            try {
                while (! feof($stream)) {
                    $chunk = fread($stream, 1024 * 1024);
                    if ($chunk === false) {
                        break;
                    }
                    echo $chunk;
                }
            } finally {
                fclose($stream);
                @unlink($tempPath);
            }
        }, $base.'.zip', DocumentDeliveryService::privateHeaders() + [
            'Content-Type' => 'application/zip',
            'Cache-Control' => 'no-store, private',
            'Pragma' => 'no-cache',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    /**
     * Writes a standards-compatible, uncompressed ZIP without requiring ext-zip.
     * Files are copied in chunks so a large selection never needs to be held in memory.
     *
     * @param iterable<int, Document> $documents
     */
    private function writePortableZip(string $path, iterable $documents): int
    {
        $archive = fopen($path, 'w+b');
        if (! is_resource($archive)) {
            throw new RuntimeException('Temporary ZIP file could not be opened.');
        }

        $entries = [];
        $usedNames = [];

        try {
            foreach ($documents as $index => $document) {
                // Never silently omit missing files from a supposedly complete
                // archive, and apply the same path checks as single downloads.
                $source = app(DocumentDeliveryService::class)->open($document);

                try {
                    $name = $this->uniqueZipName($document->original_name, $usedNames, $index + 1);
                    $nameLength = strlen($name);
                    $localOffset = ftell($archive);
                    if ($localOffset === false || $localOffset > self::ZIP_UINT32_MAX) {
                        throw new RuntimeException('ZIP archive exceeds the portable 4 GB limit.');
                    }
                    [$dosTime, $dosDate] = $this->dosDateTime($document->updated_at?->getTimestamp() ?? time());

                    $this->writeAll($archive, pack(
                        'VvvvvvVVVvv',
                        0x04034B50,
                        20,
                        self::ZIP_UTF8_DATA_DESCRIPTOR_FLAGS,
                        0,
                        $dosTime,
                        $dosDate,
                        0,
                        0,
                        0,
                        $nameLength,
                        0,
                    ));
                    $this->writeAll($archive, $name);

                    $hash = hash_init('crc32b');
                    $size = 0;
                    while (! feof($source)) {
                        $chunk = fread($source, 1024 * 1024);
                        if ($chunk === false) {
                            throw new RuntimeException('A document could not be read.');
                        }
                        if ($chunk === '') {
                            continue;
                        }
                        $size += strlen($chunk);
                        $position = ftell($archive);
                        if ($position === false || $position + strlen($chunk) > max(1, (int) config('documents.archive_max_bytes', 512 * 1024 * 1024))) {
                            throw new RuntimeException('Document archive exceeds the configured size limit.');
                        }
                        if ($size > self::ZIP_UINT32_MAX) {
                            throw new RuntimeException('A document exceeds the portable 4 GB ZIP limit.');
                        }
                        hash_update($hash, $chunk);
                        $this->writeAll($archive, $chunk);
                    }

                    $crc = (int) hexdec(hash_final($hash));
                    $this->writeAll($archive, pack('VVVV', 0x08074B50, $crc, $size, $size));
                    $entries[] = compact('name', 'nameLength', 'localOffset', 'dosTime', 'dosDate', 'crc', 'size');
                } finally {
                    fclose($source);
                }
            }

            $centralOffset = ftell($archive);
            if ($centralOffset === false || $centralOffset > self::ZIP_UINT32_MAX) {
                throw new RuntimeException('ZIP archive exceeds the portable 4 GB limit.');
            }

            foreach ($entries as $entry) {
                $this->writeAll($archive, pack(
                    'VvvvvvvVVVvvvvvVV',
                    0x02014B50,
                    20,
                    20,
                    self::ZIP_UTF8_DATA_DESCRIPTOR_FLAGS,
                    0,
                    $entry['dosTime'],
                    $entry['dosDate'],
                    $entry['crc'],
                    $entry['size'],
                    $entry['size'],
                    $entry['nameLength'],
                    0,
                    0,
                    0,
                    0,
                    0,
                    $entry['localOffset'],
                ));
                $this->writeAll($archive, $entry['name']);
            }

            $centralEnd = ftell($archive);
            if ($centralEnd === false) {
                throw new RuntimeException('ZIP archive position could not be read.');
            }
            $centralSize = $centralEnd - $centralOffset;
            if ($centralEnd > self::ZIP_UINT32_MAX || $centralSize > self::ZIP_UINT32_MAX || count($entries) > 0xFFFF) {
                throw new RuntimeException('ZIP archive exceeds the portable format limits.');
            }

            $this->writeAll($archive, pack(
                'VvvvvVVv',
                0x06054B50,
                0,
                0,
                count($entries),
                count($entries),
                $centralSize,
                $centralOffset,
                0,
            ));
            fflush($archive);
        } finally {
            fclose($archive);
        }

        return count($entries);
    }

    /** @return array{int, int} */
    private function dosDateTime(int $timestamp): array
    {
        $parts = getdate($timestamp);
        $year = max(1980, min(2107, (int) $parts['year']));
        $date = (($year - 1980) << 9) | ((int) $parts['mon'] << 5) | (int) $parts['mday'];
        $time = ((int) $parts['hours'] << 11) | ((int) $parts['minutes'] << 5) | intdiv((int) $parts['seconds'], 2);

        return [$time, $date];
    }

    /** @param resource $stream */
    private function writeAll($stream, string $contents): void
    {
        $length = strlen($contents);
        $offset = 0;
        while ($offset < $length) {
            $written = fwrite($stream, substr($contents, $offset));
            if ($written === false || $written === 0) {
                throw new RuntimeException('ZIP archive could not be written.');
            }
            $offset += $written;
        }
    }

    /** @param array<string, bool> $used */
    private function uniqueZipName(string $originalName, array &$used, int $index): string
    {
        $safe = trim(preg_replace('/[\\\\\/\x00-\x1F\x7F]+/u', '-', $originalName) ?: 'Dokument-'.$index);
        $safe = Str::limit($safe, 180, '');
        $candidate = $safe;
        $counter = 2;
        while (isset($used[mb_strtolower($candidate)])) {
            $extension = pathinfo($safe, PATHINFO_EXTENSION);
            $stem = pathinfo($safe, PATHINFO_FILENAME) ?: 'Dokument-'.$index;
            $candidate = $stem.'-'.$counter.($extension !== '' ? '.'.$extension : '');
            $counter++;
        }
        $used[mb_strtolower($candidate)] = true;

        return $candidate;
    }
}
