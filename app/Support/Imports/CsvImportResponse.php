<?php

namespace App\Support\Imports;

final class CsvImportResponse
{
    /** @param array<string, mixed> $extra */
    public static function meta(ImportResult $result, bool $preview, array $extra = []): array
    {
        return [
            'preview' => $preview,
            'valid' => (int) ($result->meta['valid'] ?? ($preview ? 0 : $result->importedCount())),
            'imported' => $result->importedCount(),
            'duplicates' => $result->duplicateCount(),
            'skipped' => $result->skippedCount(),
            'errors' => $result->errorCount(),
            'total' => (int) ($result->meta['total'] ?? ($result->importedCount() + $result->duplicateCount() + $result->skippedCount() + $result->errorCount())),
            'validRows' => $result->meta['validRows'] ?? [],
            'duplicateRows' => $result->duplicates,
            'skippedRows' => $result->skipped,
            'errorRows' => $result->errors,
            ...$extra,
        ];
    }
}
