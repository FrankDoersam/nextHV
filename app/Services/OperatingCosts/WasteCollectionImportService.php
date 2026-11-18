<?php

namespace App\Services\OperatingCosts;

use App\Contracts\Imports\CsvImportService;
use App\Models\WasteCollection;
use App\Models\WasteContainer;
use App\Support\Imports\ImportResult;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Throwable;

final class WasteCollectionImportService implements CsvImportService
{
    private const MAX_ROWS = 5000;

    public function preview(string $csv, array $context = []): ImportResult
    {
        return $this->process($this->validatedRows($csv), true);
    }

    public function importCsv(string $csv, array $context = []): ImportResult
    {
        $rows = $this->validatedRows($csv);
        $preview = $this->process($rows, true);

        if ($preview->errorCount() > 0) {
            return $preview;
        }

        return DB::transaction(fn (): ImportResult => $this->process($rows, false), 3);
    }

    /** @return array<int, array{sourceRow:int,containerNumber:string,collectionDate:string,columnCount:int}> */
    private function validatedRows(string $csv): array
    {
        $rows = $this->parseCsv($csv);
        if ($rows === []) {
            throw ValidationException::withMessages(['csv' => 'Die CSV-Datei enthält keine importierbaren Datenzeilen.']);
        }
        if (count($rows) > self::MAX_ROWS) {
            throw ValidationException::withMessages(['csv' => 'Pro Import können höchstens 5.000 Leerungen verarbeitet werden.']);
        }

        return $rows;
    }

    /**
     * @param array<int, array{sourceRow:int,containerNumber:string,collectionDate:string,columnCount:int}> $rows
     */
    private function process(array $rows, bool $preview): ImportResult
    {
        $containersByNumber = $this->containersByNumber($rows, ! $preview);
        $containerIds = $containersByNumber
            ->flatten(1)
            ->pluck('id')
            ->filter()
            ->unique()
            ->values()
            ->all();

        $existingKeys = WasteCollection::query()
            ->when($containerIds !== [], fn (Builder $query) => $query->whereIn('waste_container_id', $containerIds), fn (Builder $query) => $query->whereKey([]))
            ->where('collection_type', 'regular')
            ->get(['waste_container_id', 'collection_date', 'collection_type'])
            ->mapWithKeys(fn (WasteCollection $collection): array => [
                $this->duplicateKey(
                    (string) $collection->waste_container_id,
                    $collection->collection_date?->toDateString() ?? '',
                    $collection->collection_type,
                ) => true,
            ])
            ->all();

        $seenImportKeys = [];
        $created = [];
        $validRows = [];
        $duplicates = [];
        $errors = [];
        $affectedContainerIds = [];

        foreach (array_values($rows) as $index => $row) {
            $normalized = [
                'sourceRow' => $row['sourceRow'],
                'containerNumber' => trim($row['containerNumber']),
                'collectionDate' => trim($row['collectionDate']),
                'collectionType' => 'regular',
                'notes' => null,
            ];
            $rowErrors = [];

            if ($row['columnCount'] !== 2) {
                $rowErrors[] = 'Die Zeile muss genau zwei mit Semikolon getrennte Spalten enthalten: Behälternummer;Datum.';
            }
            if ($normalized['containerNumber'] === '') {
                $rowErrors[] = 'Die Behälternummer fehlt.';
            }

            $date = $this->parseDate($normalized['collectionDate']);
            if (! $date) {
                $rowErrors[] = 'Das Leerungsdatum ist ungültig; erwartet wird JJJJ-MM-TT oder TT.MM.JJJJ.';
            } else {
                $normalized['collectionDate'] = $date->toDateString();
            }

            $container = null;
            if ($normalized['containerNumber'] !== '') {
                /** @var Collection<int, WasteContainer> $matches */
                $matches = $containersByNumber->get($this->canonicalContainerNumber($normalized['containerNumber']), collect());
                if ($matches->isEmpty()) {
                    $rowErrors[] = 'Für die Behälternummer wurde keine Mülltonne gefunden.';
                } elseif ($matches->count() > 1) {
                    $rowErrors[] = 'Die Behälternummer ist mehreren Objekten zugeordnet und deshalb nicht eindeutig.';
                } else {
                    /** @var WasteContainer $container */
                    $container = $matches->first();
                }
            }

            if ($container && $date) {
                $rowErrors = [...$rowErrors, ...$this->validateContainerDate($container, $date)];
            }

            if ($rowErrors !== []) {
                $errors[] = $this->issueRow($index, $normalized, implode(' ', $rowErrors));
                continue;
            }

            /** @var WasteContainer $container */
            $key = $this->duplicateKey($container->id, $normalized['collectionDate'], 'regular');
            if (isset($existingKeys[$key])) {
                $duplicates[] = $this->issueRow($index, $normalized, 'Diese Leerung ist für die Mülltonne bereits vorhanden.');
                continue;
            }
            if (isset($seenImportKeys[$key])) {
                $duplicates[] = $this->issueRow($index, $normalized, 'Diese Leerung ist innerhalb der Importdatei doppelt enthalten.');
                continue;
            }

            $seenImportKeys[$key] = true;
            $affectedContainerIds[$container->id] = true;

            if ($preview) {
                $validRows[] = $normalized;
                continue;
            }

            $created[] = WasteCollection::query()->create([
                'waste_container_id' => $container->id,
                'collection_date' => $normalized['collectionDate'],
                'collection_type' => 'regular',
                'notes' => null,
            ]);
            $existingKeys[$key] = true;
        }

        return new ImportResult(
            importedItems: $created,
            duplicates: $duplicates,
            errors: $errors,
            meta: [
                'total' => count($rows),
                'containers' => count($affectedContainerIds),
                'containerIds' => array_keys($affectedContainerIds),
                'validRows' => $validRows,
                'valid' => $preview ? count($validRows) : count($created),
            ],
        );
    }

    /**
     * @param array<int, array{sourceRow:int,containerNumber:string,collectionDate:string,columnCount:int}> $rows
     * @return Collection<string, Collection<int, WasteContainer>>
     */
    private function containersByNumber(array $rows, bool $lock): Collection
    {
        $numbers = collect($rows)
            ->pluck('containerNumber')
            ->map(fn (mixed $value): string => $this->canonicalContainerNumber((string) $value))
            ->filter()
            ->unique()
            ->values();

        if ($numbers->isEmpty()) return collect();

        $query = WasteContainer::query()->where(function (Builder $query) use ($numbers): void {
            foreach ($numbers as $number) {
                $query->orWhereRaw('LOWER(TRIM(container_number)) = ?', [$number]);
            }
        });

        if ($lock) $query->lockForUpdate();

        return $query
            ->get()
            ->groupBy(fn (WasteContainer $container): string => $this->canonicalContainerNumber($container->container_number));
    }

    /** @return array<int, string> */
    private function validateContainerDate(WasteContainer $container, CarbonImmutable $date): array
    {
        $errors = [];

        if ($container->status !== 'active') {
            $errors[] = $container->status === 'cancelled'
                ? 'Für eine gekündigte Mülltonne können keine neuen Leerungen importiert werden.'
                : 'Leerungen können nur für eine aktive Mülltonne importiert werden.';
        }
        if ($date->gt(CarbonImmutable::today())) {
            $errors[] = 'Das Leerungsdatum darf nicht in der Zukunft liegen.';
        }
        if ($container->valid_from && $date->lt($container->valid_from->startOfDay())) {
            $errors[] = 'Das Leerungsdatum liegt vor dem Beginn der Tonnenlaufzeit.';
        }

        $end = collect([$container->valid_until, $container->cancellation_date])->filter()->sort()->first();
        if ($end && $date->gt($end->startOfDay())) {
            $errors[] = 'Das Leerungsdatum liegt nach dem Ende der Tonnenlaufzeit.';
        }

        return $errors;
    }

    /** @return array<int, array{sourceRow:int,containerNumber:string,collectionDate:string,columnCount:int}> */
    private function parseCsv(string $csv): array
    {
        $csv = preg_replace('/^\xEF\xBB\xBF/', '', $csv) ?? $csv;
        $stream = fopen('php://temp', 'r+');
        if ($stream === false) return [];

        fwrite($stream, $csv);
        rewind($stream);

        $rows = [];
        $sourceRow = 0;
        $firstDataRow = true;

        try {
            while (($columns = fgetcsv($stream, 0, ';', '"', '')) !== false) {
                $sourceRow++;
                $columns = array_map(static fn (mixed $value): string => trim((string) $value), $columns);
                if (! array_filter($columns, static fn (string $value): bool => $value !== '')) continue;

                if ($firstDataRow && $this->isHeaderRow($columns)) {
                    $firstDataRow = false;
                    continue;
                }
                $firstDataRow = false;

                $rows[] = [
                    'sourceRow' => $sourceRow,
                    'containerNumber' => $columns[0] ?? '',
                    'collectionDate' => $columns[1] ?? '',
                    'columnCount' => count($columns),
                ];
            }
        } finally {
            fclose($stream);
        }

        return $rows;
    }

    /** @param array<int, string> $columns */
    private function isHeaderRow(array $columns): bool
    {
        if (count($columns) < 2) return false;

        $first = $this->normalizeHeader($columns[0]);
        $second = $this->normalizeHeader($columns[1]);

        return in_array($first, ['behaelternummer', 'behaelter', 'containernummer', 'container', 'tonnennummer', 'tonne'], true)
            && in_array($second, ['datum', 'leerungsdatum', 'entleerungsdatum', 'abholdatum', 'date'], true);
    }

    private function normalizeHeader(string $value): string
    {
        $value = mb_strtolower(trim($value));
        $value = str_replace(['ä', 'ö', 'ü', 'ß'], ['ae', 'oe', 'ue', 'ss'], $value);

        return preg_replace('/[^a-z0-9]+/', '', $value) ?? $value;
    }

    private function canonicalContainerNumber(string $value): string
    {
        return mb_strtolower(trim($value));
    }

    private function parseDate(string $value): ?CarbonImmutable
    {
        $raw = trim($value);
        if ($raw === '') return null;

        if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})$/', $raw, $matches)) {
            return $this->safeDate((int) $matches[1], (int) $matches[2], (int) $matches[3]);
        }
        if (preg_match('/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/', $raw, $matches)) {
            return $this->safeDate((int) $matches[3], (int) $matches[2], (int) $matches[1]);
        }

        return null;
    }

    private function safeDate(int $year, int $month, int $day): ?CarbonImmutable
    {
        try {
            return CarbonImmutable::createSafe($year, $month, $day, 0, 0, 0)->startOfDay();
        } catch (Throwable) {
            return null;
        }
    }

    private function duplicateKey(string $containerId, string $date, string $type): string
    {
        return $containerId.'|'.$date.'|'.$type;
    }

    /**
     * @param array{sourceRow:int,containerNumber:string,collectionDate:string,collectionType:string,notes:?string} $row
     * @return array<string, mixed>
     */
    private function issueRow(int $index, array $row, string $reason): array
    {
        return [
            'index' => $index,
            'sourceRow' => $row['sourceRow'],
            'containerNumber' => $row['containerNumber'],
            'collectionDate' => $row['collectionDate'],
            'collectionType' => $row['collectionType'],
            'reason' => $reason,
        ];
    }
}
