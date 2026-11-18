<?php

namespace App\Support\Imports;

use ArrayAccess;
use JsonSerializable;

/** @implements ArrayAccess<string, mixed> */
final class ImportResult implements ArrayAccess, JsonSerializable
{
    /**
     * @param array<int, mixed> $importedItems
     * @param array<int, array<string, mixed>> $duplicates
     * @param array<int, array<string, mixed>> $skipped
     * @param array<int, array<string, mixed>> $errors
     * @param array<string, mixed> $meta
     */
    public function __construct(
        public readonly array $importedItems = [],
        public readonly array $duplicates = [],
        public readonly array $skipped = [],
        public readonly array $errors = [],
        public readonly array $meta = [],
    ) {}

    public function importedCount(): int { return count($this->importedItems); }
    public function duplicateCount(): int { return count($this->duplicates); }
    public function skippedCount(): int { return count($this->skipped); }
    public function errorCount(): int { return count($this->errors); }

    /** @return array<string, int> */
    public function summary(): array
    {
        return [
            'imported' => $this->importedCount(),
            'duplicates' => $this->duplicateCount(),
            'skipped' => $this->skippedCount(),
            'errors' => $this->errorCount(),
            'total' => $this->importedCount() + $this->duplicateCount() + $this->skippedCount() + $this->errorCount(),
        ];
    }

    /** @return array<string, mixed> */
    public function jsonSerialize(): array
    {
        return [
            'summary' => $this->summary(),
            'duplicates' => $this->duplicates,
            'skipped' => $this->skipped,
            'errors' => $this->errors,
            'meta' => $this->meta,
        ];
    }

    public function offsetExists(mixed $offset): bool
    {
        return in_array($offset, ['payments', 'items', 'statement', 'summary', 'duplicates', 'skipped', 'errors'], true)
            || array_key_exists((string) $offset, $this->meta);
    }

    public function offsetGet(mixed $offset): mixed
    {
        return match ($offset) {
            'payments', 'items' => $this->importedItems,
            'statement' => $this->meta['statement'] ?? null,
            'summary' => $this->summary(),
            'duplicates' => $this->duplicates,
            'skipped' => $this->skipped,
            'errors' => $this->errors,
            default => $this->meta[(string) $offset] ?? null,
        };
    }

    public function offsetSet(mixed $offset, mixed $value): void
    {
        throw new \LogicException('ImportResult is immutable.');
    }

    public function offsetUnset(mixed $offset): void
    {
        throw new \LogicException('ImportResult is immutable.');
    }
}
