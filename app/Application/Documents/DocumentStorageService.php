<?php

namespace App\Application\Documents;

use App\Models\Document;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use InvalidArgumentException;
use RuntimeException;
use Throwable;

/**
 * Owns the physical storage invariant for every S4 document.
 *
 * Business meaning (resource type, category, date, invoice/contract number, ...)
 * belongs in the database. Blob keys are immutable, opaque and derived only from
 * the Document UUID so a document can be reclassified or rebound without moving
 * because of business metadata changes.
 */
final class DocumentStorageService
{
    public const LAYOUT = 'document-id-v1';

    public function disk(): string
    {
        return trim((string) config('documents.storage.disk', 'local')) ?: 'local';
    }

    public function prefix(): string
    {
        $prefix = trim(str_replace('\\', '/', (string) config('documents.storage.prefix', 'documents/blobs')), '/ ');

        return $prefix !== '' ? $prefix : 'documents/blobs';
    }

    public function canonicalPath(Document|string $document, ?string $sourcePath = null, ?string $originalName = null): string
    {
        if ($document instanceof Document) {
            $documentId = (string) $document->getKey();
            $sourcePath ??= (string) $document->path;
            $originalName ??= (string) $document->original_name;
        } else {
            $documentId = trim($document);
        }

        if (! Str::isUuid($documentId)) {
            throw new InvalidArgumentException('Document storage requires a valid document UUID.');
        }

        $documentId = strtolower($documentId);
        // Laravel 13 uses UUIDv7 by default. UUIDv7 prefixes are time-correlated,
        // so raw-prefix sharding would create hot directories. Hash only the ID
        // for balanced technical shards while retaining the UUID as blob name.
        $shard = hash('sha256', $documentId);
        $extension = $this->extension($sourcePath, $originalName);

        return sprintf(
            '%s/%s/%s/%s.%s',
            $this->prefix(),
            substr($shard, 0, 2),
            substr($shard, 2, 2),
            $documentId,
            $extension,
        );
    }

    public function isCanonical(Document $document): bool
    {
        if (! $document->path || ! $document->getKey()) {
            return false;
        }

        return ($document->disk ?: 'local') === $this->disk()
            && $document->path === $this->canonicalPath($document);
    }

    /**
     * Defers filesystem mutation until the surrounding database transaction has
     * committed. This keeps current writers rollback-safe while enforcing one
     * storage layout globally at the Document aggregate boundary.
     */
    public function canonicalizeAfterCommit(Document $document): void
    {
        if (! $document->path || ! $document->getKey()) {
            return;
        }

        DB::afterCommit(function () use ($document): void {
            try {
                $this->canonicalize($document);
            } catch (Throwable $error) {
                // The database still points to the original, valid blob when a
                // normalization fails. Never turn a successful business write
                // into a broken document reference after the DB commit.
                Log::error('Document storage normalization failed.', [
                    'documentId' => (string) $document->getKey(),
                    'disk' => $document->disk,
                    'path' => $document->path,
                    'storageLayout' => self::LAYOUT,
                    'exception' => $error,
                ]);
            }
        });
    }

    /**
     * Normalize one persisted document immediately. Safe to call repeatedly.
     * Returns true only when the physical blob and DB pointer were changed.
     */
    public function canonicalize(Document $document): bool
    {
        $documentId = (string) $document->getKey();
        if (! Str::isUuid($documentId) || ! $document->path) {
            return false;
        }

        // Re-read the current pointer so delayed after-commit callbacks cannot
        // overwrite a newer replacement/rebind operation.
        $current = Document::withTrashed()->find($documentId);
        if (! $current || ! $current->path) {
            return false;
        }

        $sourceDiskName = $current->disk ?: 'local';
        $sourcePath = (string) $current->path;
        $targetDiskName = $this->disk();
        $targetPath = $this->canonicalPath($current, $sourcePath, (string) $current->original_name);

        if ($sourceDiskName === $targetDiskName && $sourcePath === $targetPath) {
            $this->syncInMemoryPointer($document, $targetDiskName, $targetPath);

            return false;
        }

        $sourceDisk = Storage::disk($sourceDiskName);
        $targetDisk = Storage::disk($targetDiskName);

        if (! $sourceDisk->exists($sourcePath)) {
            // Legacy/test records may intentionally point at an external or no
            // longer materialized blob. Keep their pointer untouched.
            return false;
        }

        if ($targetDisk->exists($targetPath)) {
            throw new RuntimeException("Canonical document blob already exists: {$targetPath}");
        }

        $changed = $sourceDiskName === $targetDiskName
            ? $this->moveOnSameDisk($documentId, $sourceDiskName, $sourcePath, $targetPath)
            : $this->moveAcrossDisks($documentId, $sourceDiskName, $sourcePath, $targetDiskName, $targetPath);

        if (! $changed) {
            $document->refresh();

            return false;
        }

        $this->syncInMemoryPointer($document, $targetDiskName, $targetPath);

        return true;
    }

    private function moveOnSameDisk(string $documentId, string $diskName, string $sourcePath, string $targetPath): bool
    {
        $disk = Storage::disk($diskName);
        if (! $disk->move($sourcePath, $targetPath)) {
            throw new RuntimeException("Document blob could not be moved to canonical path: {$targetPath}");
        }

        try {
            if ($this->updatePointer($documentId, $diskName, $sourcePath, $diskName, $targetPath) !== 1) {
                if ($disk->exists($targetPath)) {
                    $disk->move($targetPath, $sourcePath);
                }

                return false;
            }
        } catch (Throwable $error) {
            if ($disk->exists($targetPath) && ! $disk->exists($sourcePath)) {
                try {
                    $disk->move($targetPath, $sourcePath);
                } catch (Throwable $rollbackError) {
                    Log::critical('Document storage rollback failed after pointer update error.', [
                        'documentId' => $documentId,
                        'disk' => $diskName,
                        'sourcePath' => $sourcePath,
                        'targetPath' => $targetPath,
                        'exception' => $rollbackError,
                    ]);
                }
            }

            throw $error;
        }

        return true;
    }

    private function moveAcrossDisks(
        string $documentId,
        string $sourceDiskName,
        string $sourcePath,
        string $targetDiskName,
        string $targetPath,
    ): bool {
        $sourceDisk = Storage::disk($sourceDiskName);
        $targetDisk = Storage::disk($targetDiskName);
        $stream = $sourceDisk->readStream($sourcePath);

        if ($stream === false) {
            throw new RuntimeException("Document blob could not be opened: {$sourcePath}");
        }

        try {
            // Laravel/Flysystem accepts a stream resource for put(), keeping
            // cross-disk moves memory-safe even for the 50 MB attachment limit.
            if (! $targetDisk->put($targetPath, $stream)) {
                throw new RuntimeException("Document blob could not be written to canonical disk: {$targetPath}");
            }
        } finally {
            if (is_resource($stream)) {
                fclose($stream);
            }
        }

        try {
            if ($this->updatePointer($documentId, $sourceDiskName, $sourcePath, $targetDiskName, $targetPath) !== 1) {
                $targetDisk->delete($targetPath);

                return false;
            }
        } catch (Throwable $error) {
            try {
                $targetDisk->delete($targetPath);
            } catch (Throwable) {
                // Preserve the primary DB error; an unreferenced target copy is
                // safer than losing the referenced source blob.
            }

            throw $error;
        }

        if (! $sourceDisk->delete($sourcePath)) {
            Log::warning('Document source blob remained after cross-disk normalization.', [
                'documentId' => $documentId,
                'sourceDisk' => $sourceDiskName,
                'sourcePath' => $sourcePath,
                'targetDisk' => $targetDiskName,
                'targetPath' => $targetPath,
            ]);
        }

        return true;
    }

    private function updatePointer(
        string $documentId,
        string $sourceDisk,
        string $sourcePath,
        string $targetDisk,
        string $targetPath,
    ): int {
        return Document::withTrashed()
            ->whereKey($documentId)
            ->where(function ($query) use ($sourceDisk): void {
                $query->where('disk', $sourceDisk);
                if ($sourceDisk === 'local') {
                    $query->orWhereNull('disk');
                }
            })
            ->where('path', $sourcePath)
            ->update([
                'disk' => $targetDisk,
                'path' => $targetPath,
            ]);
    }

    private function syncInMemoryPointer(Document $document, string $disk, string $path): void
    {
        $document->setAttribute('disk', $disk);
        $document->setAttribute('path', $path);
        $document->syncOriginalAttributes(['disk', 'path']);
    }

    private function extension(?string $sourcePath, ?string $originalName): string
    {
        foreach ([$sourcePath, $originalName] as $candidate) {
            $extension = strtolower((string) pathinfo((string) $candidate, PATHINFO_EXTENSION));
            if ($extension !== '' && preg_match('/^[a-z0-9]{1,12}$/', $extension) === 1) {
                return $extension;
            }
        }

        return 'bin';
    }
}
