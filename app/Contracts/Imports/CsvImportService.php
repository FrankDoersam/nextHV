<?php

namespace App\Contracts\Imports;

use App\Support\Imports\ImportResult;

interface CsvImportService
{
    /** @param array<string, mixed> $context */
    public function preview(string $csv, array $context = []): ImportResult;

    /** @param array<string, mixed> $context */
    public function importCsv(string $csv, array $context = []): ImportResult;
}
