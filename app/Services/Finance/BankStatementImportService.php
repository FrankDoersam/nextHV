<?php

namespace App\Services\Finance;

use App\Contracts\Imports\CsvImportService;
use App\Models\BankStatement;
use App\Models\BusinessPartnerBankAccount;
use App\Models\Payment;
use App\Support\Imports\ImportResult;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

class BankStatementImportService implements CsvImportService
{
    private const MAX_ROWS = 5000;

    private const HEADER_ALIASES = [
        'bookingDate' => ['buchungstag', 'buchungsdatum', 'belegdatum', 'bookingdate'],
        'valueDate' => ['valuta', 'valutadatum', 'valuedate'],
        'amount' => ['betrag', 'amount', 'umsatz'],
        'currency' => ['waehrung', 'currency'],
        'counterpartyName' => ['beguenstigter', 'beguenstigterzahlungspflichtiger', 'auftraggeber', 'empfaenger', 'name', 'counterparty'],
        'counterpartyIban' => ['iban', 'gegenkontoiban', 'kontonummeriban'],
        'counterpartyBic' => ['bic', 'gegenkontobic', 'bicswiftcode'],
        'bookingText' => ['buchungstext', 'bookingtext'],
        'purpose' => ['verwendungszweck', 'purpose'],
        'reference' => ['kundenreferenzendtoend', 'kundenreferenz', 'endtoendreferenz', 'endtoendreference', 'endtoend', 'reference'],
    ];

    public function preview(string $csv, array $context = []): ImportResult
    {
        $this->validateContext($context);
        $parsed = $this->parseCsv($csv);
        $bankAccountId = $this->bankAccountId($context);

        return $this->inspectEntries($parsed['entries'], $parsed['skipped'], $parsed['errors'], $parsed['meta'], $bankAccountId);
    }

    public function importCsv(string $csv, array $context = []): ImportResult
    {
        $this->validateContext($context);
        $parsed = $this->parseCsv($csv);
        $bankAccountId = $this->bankAccountId($context);
        $preview = $this->inspectEntries($parsed['entries'], $parsed['skipped'], $parsed['errors'], $parsed['meta'], $bankAccountId);

        if ($preview->errorCount() > 0) {
            return $preview;
        }

        $validRows = is_array($preview->meta['validRows'] ?? null) ? $preview->meta['validRows'] : [];
        if ($validRows === []) {
            return new ImportResult(
                duplicates: $preview->duplicates,
                skipped: $preview->skipped,
                errors: $preview->errors,
                meta: $preview->meta + [
                    'valid' => 0,
                    'validRows' => [],
                ],
            );
        }

        $fileHash = strtolower((string) ($context['fileHash'] ?? ''));
        $importContext = $context + $parsed['meta'];
        $knownDuplicateCount = count($preview->duplicates);

        try {
            $result = DB::transaction(function () use (
                $validRows,
                $importContext,
                $fileHash,
                $bankAccountId,
                $knownDuplicateCount,
            ): ImportResult {
                $statement = BankStatement::query()->create([
                    'bank_account_id' => $bankAccountId,
                    'source' => $importContext['source'] ?? 'csv',
                    'file_name' => $importContext['fileName'] ?? null,
                    'file_hash' => $fileHash,
                    'statement_date' => $importContext['statementDate'] ?? null,
                    'entry_count' => (int) ($importContext['total'] ?? count($validRows)),
                    'total_amount' => (float) ($importContext['totalAmount'] ?? 0),
                    'currency' => strtoupper((string) ($importContext['currency'] ?? 'EUR')),
                    'status' => 'imported',
                    'import_meta' => Arr::except($importContext, ['fileHash', 'total', 'totalAmount']),
                    'imported_by' => $importContext['userId'] ?? null,
                ]);

                $created = [];
                $duplicates = [];
                $errors = [];

                foreach ($validRows as $index => $entry) {
                    try {
                        $created[] = Payment::query()->create(
                            $this->normalizeEntry($entry, $statement->id, $bankAccountId)
                        );
                    } catch (QueryException $exception) {
                        if (! $this->isUniqueViolation($exception, 'payments.import_fingerprint')) {
                            throw $exception;
                        }

                        $duplicates[] = $this->issueRow($index, $entry, 'Zahlung bereits vorhanden.');
                    } catch (Throwable $exception) {
                        $errors[] = $this->issueRow($index, $entry, $exception->getMessage());
                    }
                }

                if ($created === [] && $duplicates !== [] && $errors === []) {
                    $statement->forceDelete();

                    return new ImportResult(duplicates: $duplicates);
                }

                $statement->forceFill([
                    'status' => $errors === [] ? 'imported' : 'imported_with_errors',
                    'import_meta' => Arr::except($importContext, ['fileHash', 'total', 'totalAmount']) + [
                        'result' => [
                            'imported' => count($created),
                            'duplicates' => $knownDuplicateCount + count($duplicates),
                            'errors' => count($errors),
                        ],
                    ],
                ])->save();

                return new ImportResult(
                    importedItems: $created,
                    duplicates: $duplicates,
                    errors: $errors,
                    meta: ['statement' => $statement],
                );
            }, 3);
        } catch (QueryException $exception) {
            if ($this->isUniqueViolation($exception, 'bank_statements.file_hash')) {
                throw ValidationException::withMessages([
                    'fileHash' => 'Dieser Kontoauszug wurde bereits importiert.',
                ]);
            }

            throw $exception;
        }

        return new ImportResult(
            importedItems: $result->importedItems,
            duplicates: array_values(array_merge($preview->duplicates, $result->duplicates)),
            skipped: array_values(array_merge($preview->skipped, $result->skipped)),
            errors: $result->errors,
            meta: $result->meta + [
                'valid' => $result->importedCount(),
                'validRows' => [],
                'total' => $parsed['meta']['total'],
                'totalAmount' => $parsed['meta']['totalAmount'],
                'currency' => $parsed['meta']['currency'],
                'statementDate' => $parsed['meta']['statementDate'],
            ],
        );
    }

    /**
     * @param array<int, array<string, mixed>> $entries
     * @param array<int, array<string, mixed>> $parseSkipped
     * @param array<int, array<string, mixed>> $parseErrors
     * @param array<string, mixed> $meta
     */
    private function inspectEntries(
        array $entries,
        array $parseSkipped,
        array $parseErrors,
        array $meta,
        ?string $bankAccountId,
    ): ImportResult {
        $fingerprints = array_map(
            fn (array $entry): string => $this->transactionFingerprint($entry, $bankAccountId),
            $entries,
        );
        $existing = $this->existingTransactionFingerprints($entries, $bankAccountId);
        $seen = [];
        $validRows = [];
        $duplicates = [];

        foreach ($entries as $index => $entry) {
            $fingerprint = $fingerprints[$index];

            if (isset($existing[$fingerprint])) {
                $duplicates[] = $this->issueRow($index, $entry, 'Zahlung bereits vorhanden.');
                continue;
            }

            if (isset($seen[$fingerprint])) {
                $duplicates[] = $this->issueRow($index, $entry, 'Zahlung ist innerhalb der Importdatei doppelt enthalten.');
                continue;
            }

            $seen[$fingerprint] = true;
            $validRows[] = $entry;
        }

        return new ImportResult(
            duplicates: $duplicates,
            skipped: $parseSkipped,
            errors: $parseErrors,
            meta: $meta + [
                'valid' => count($validRows),
                'validRows' => $validRows,
            ],
        );
    }

    /**
     * @return array{
     *   entries:array<int,array<string,mixed>>,
     *   skipped:array<int,array<string,mixed>>,
     *   errors:array<int,array<string,mixed>>,
     *   meta:array{total:int,totalAmount:float,currency:string,statementDate:?string}
     * }
     */
    private function parseCsv(string $csv): array
    {
        $this->assertValidUtf8($csv);
        $csv = preg_replace('/^\xEF\xBB\xBF/', '', $csv) ?? $csv;
        $lines = preg_split('/\r\n|\r|\n/', $csv) ?: [];
        $sample = collect($lines)->first(fn (string $line): bool => trim($line) !== '');
        if (! is_string($sample) || trim($sample) === '') {
            throw ValidationException::withMessages(['csv' => 'Die CSV-Datei enthält keine Buchungszeilen.']);
        }

        $delimiter = $this->detectDelimiter($sample);
        $stream = fopen('php://temp', 'r+');
        if ($stream === false) {
            throw ValidationException::withMessages(['csv' => 'Die CSV-Datei konnte nicht gelesen werden.']);
        }

        fwrite($stream, $csv);
        rewind($stream);

        try {
            $headers = null;
            $headerMap = [];
            $entries = [];
            $skipped = [];
            $errors = [];
            $sourceRow = 0;
            $dataRows = 0;

            while (($columns = fgetcsv($stream, 0, $delimiter, '"', '')) !== false) {
                $sourceRow++;
                $columns = array_map(static fn (mixed $value): string => trim((string) $value), $columns);
                if (! array_filter($columns, static fn (string $value): bool => $value !== '')) {
                    continue;
                }

                if ($headers === null) {
                    $headers = array_map(fn (string $value): string => $this->normalizeHeader($value), $columns);
                    $headerMap = $this->headerMap($headers);
                    if (($headerMap['bookingDate'] ?? -1) < 0 || ($headerMap['amount'] ?? -1) < 0) {
                        throw ValidationException::withMessages(['csv' => 'Die Pflichtspalten Buchungsdatum und Betrag wurden nicht gefunden.']);
                    }
                    continue;
                }

                $dataRows++;
                if ($dataRows > self::MAX_ROWS) {
                    throw ValidationException::withMessages(['csv' => 'Pro Import können höchstens 5.000 Buchungszeilen verarbeitet werden.']);
                }

                $amountColumn = $headerMap['amount'] ?? -1;
                $rawAmount = $amountColumn >= 0 ? trim((string) ($columns[$amountColumn] ?? '')) : '';
                $parsedAmount = $this->parseDecimal($rawAmount);

                if ($parsedAmount !== null && abs($parsedAmount) < 0.000001) {
                    $referenceColumn = $headerMap['reference'] ?? -1;
                    $counterpartyColumn = $headerMap['counterpartyName'] ?? -1;
                    $bookingDateColumn = $headerMap['bookingDate'] ?? -1;
                    $reference = $referenceColumn >= 0 ? trim((string) ($columns[$referenceColumn] ?? '')) : '';
                    $counterparty = $counterpartyColumn >= 0 ? trim((string) ($columns[$counterpartyColumn] ?? '')) : '';
                    $bookingDate = $bookingDateColumn >= 0 ? trim((string) ($columns[$bookingDateColumn] ?? '')) : '';

                    $skipped[] = [
                        'index' => $dataRows - 1,
                        'sourceRow' => $sourceRow,
                        'reference' => $reference !== '' ? $reference : ($counterparty !== '' ? $counterparty : $bookingDate),
                        'bookingDate' => $bookingDate !== '' ? $bookingDate : null,
                        'counterpartyName' => $counterparty !== '' ? $counterparty : null,
                        'amount' => 0.0,
                        'reason' => 'Betrag ist 0,00 und wird beim Import übersprungen.',
                    ];
                    continue;
                }

                try {
                    $entries[] = $this->parseEntry($columns, $headerMap, $sourceRow);
                } catch (ValidationException $exception) {
                    $errors[] = [
                        'index' => $dataRows - 1,
                        'sourceRow' => $sourceRow,
                        'reference' => $columns[0] ?? '',
                        'reason' => collect($exception->errors())->flatten()->implode(' '),
                    ];
                }
            }
        } finally {
            fclose($stream);
        }

        if ($dataRows === 0) {
            throw ValidationException::withMessages(['csv' => 'Die CSV-Datei enthält keine Buchungszeilen.']);
        }

        $currencies = collect($entries)->pluck('currency')->filter()->unique()->values();
        if ($currencies->count() > 1) {
            throw ValidationException::withMessages(['csv' => 'Ein Kontoauszug darf nur eine Währung enthalten. Bitte importieren Sie unterschiedliche Währungen getrennt.']);
        }

        $statementDate = collect($entries)->pluck('bookingDate')->filter()->sortDesc()->first();
        $totalAmount = round((float) collect($entries)->sum(
            fn (array $entry): float => round((float) ($entry['amount'] ?? 0), 2)
        ), 2);

        return [
            'entries' => $entries,
            'skipped' => $skipped,
            'errors' => $errors,
            'meta' => [
                'total' => $dataRows,
                'totalAmount' => $totalAmount,
                'currency' => (string) ($currencies->first() ?? 'EUR'),
                'statementDate' => is_string($statementDate) ? $statementDate : null,
            ],
        ];
    }

    /** @param array<int, string> $headers @return array<string, int> */
    private function headerMap(array $headers): array
    {
        $map = [];
        foreach (self::HEADER_ALIASES as $field => $aliases) {
            $index = collect($headers)->search(fn (string $header): bool => in_array($header, $aliases, true));
            $map[$field] = $index === false ? -1 : (int) $index;
        }

        return $map;
    }

    /** @param array<int, string> $columns @param array<string, int> $headerMap @return array<string, mixed> */
    private function parseEntry(array $columns, array $headerMap, int $sourceRow): array
    {
        $get = static fn (string $key): string => ($headerMap[$key] ?? -1) >= 0
            ? trim((string) ($columns[$headerMap[$key]] ?? ''))
            : '';

        $bookingDate = $this->parseDate($get('bookingDate'));
        $valueDateRaw = $get('valueDate');
        $valueDate = $valueDateRaw !== '' ? $this->parseDate($valueDateRaw) : null;
        $amount = $this->parseDecimal($get('amount'));
        $currency = strtoupper($get('currency') ?: 'EUR');

        $messages = [];
        if (! $bookingDate) $messages[] = 'Buchungsdatum ist ungültig.';
        if ($valueDateRaw !== '' && ! $valueDate) $messages[] = 'Valutadatum ist ungültig.';
        if ($amount === null) $messages[] = 'Betrag ist ungültig.';
        if (! preg_match('/^[A-Z]{3}$/', $currency)) $messages[] = 'Währung muss aus drei Buchstaben bestehen.';
        if ($messages !== []) {
            throw ValidationException::withMessages(['csv' => implode(' ', $messages)]);
        }

        $reference = $this->normalizeReference($get('reference'));

        return [
            'sourceRow' => $sourceRow,
            'bookingDate' => $bookingDate?->toDateString(),
            'valueDate' => $valueDate?->toDateString(),
            'amount' => $amount,
            'currency' => $currency,
            'counterpartyName' => $get('counterpartyName') ?: null,
            'counterpartyIban' => $get('counterpartyIban') ?: null,
            'counterpartyBic' => $get('counterpartyBic') ?: null,
            'bookingText' => $get('bookingText') ?: null,
            'purpose' => $get('purpose') ?: null,
            'reference' => $this->isMeaningfulReference($reference) ? $reference : null,
        ];
    }

    /** @return array<string, mixed> */
    private function normalizeEntry(
        array $entry,
        string $statementId,
        ?string $bankAccountId,
    ): array {
        $amount = round((float) ($entry['amount'] ?? 0), 2);
        $absoluteAmount = abs($amount);

        return [
            'id' => (string) Str::uuid(),
            'bank_statement_id' => $statementId,
            'bank_account_id' => $bankAccountId,
            'booking_date' => (string) ($entry['bookingDate'] ?? ''),
            'value_date' => $entry['valueDate'] ?? null,
            'amount' => $absoluteAmount,
            'unallocated_amount' => $absoluteAmount,
            'direction' => $amount >= 0 ? 'credit' : 'debit',
            'status' => 'unassigned',
            'counterparty_name' => $this->normalizeImportedText((string) ($entry['counterpartyName'] ?? '')) ?: null,
            'counterparty_iban' => $this->normalizeIban((string) ($entry['counterpartyIban'] ?? '')) ?: null,
            'counterparty_bic' => strtoupper(trim((string) ($entry['counterpartyBic'] ?? ''))) ?: null,
            'booking_text' => $this->normalizeImportedText((string) ($entry['bookingText'] ?? '')) ?: null,
            'purpose' => $this->normalizeImportedText((string) ($entry['purpose'] ?? '')) ?: null,
            'notes' => null,
            'payment_method' => 'bank_transfer',
            'import_fingerprint' => $this->transactionFingerprint($entry, $bankAccountId),
        ];
    }

    /**
     * One canonical identity rule for every imported bank transaction.
     * The own bank account scopes the identity when known. A meaningful bank
     * reference is authoritative; otherwise immutable export fields are used.
     */
    private function transactionFingerprint(array $entry, ?string $bankAccountId): string
    {
        $amount = round((float) ($entry['amount'] ?? 0), 2);
        $payload = [
            'version' => 4,
            'bankAccountId' => $bankAccountId,
            'bookingDate' => (string) ($entry['bookingDate'] ?? ''),
            'amount' => number_format(abs($amount), 2, '.', ''),
            'currency' => strtoupper(trim((string) ($entry['currency'] ?? 'EUR'))),
            'direction' => $amount >= 0 ? 'credit' : 'debit',
        ];

        $reference = $this->entryReference($entry);
        if ($reference !== '') {
            $payload['reference'] = $reference;
        } else {
            $payload['valueDate'] = $entry['valueDate'] ?? null;
            $payload['iban'] = $this->normalizeIban((string) ($entry['counterpartyIban'] ?? ''));
            $payload['bookingText'] = $this->fingerprintText((string) ($entry['bookingText'] ?? ''));
            $payload['purpose'] = $this->fingerprintText((string) ($entry['purpose'] ?? ''));
        }

        return hash('sha256', json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
    }

    /**
     * Rebuild the same canonical identity from historical payments instead of
     * trusting fingerprints produced by older importer versions. One indexed
     * booking-date range query is enough; exact CSV dates are filtered in memory.
     *
     * @param array<int, array<string, mixed>> $entries
     * @return array<string, bool>
     */
    private function existingTransactionFingerprints(array $entries, ?string $bankAccountId): array
    {
        $dates = collect($entries)
            ->pluck('bookingDate')
            ->filter(fn (mixed $date): bool => is_string($date) && $date !== '')
            ->unique()
            ->sort()
            ->values()
            ->all();

        if ($dates === []) {
            return [];
        }

        $dateSet = array_fill_keys($dates, true);
        $from = $dates[0];
        $until = CarbonImmutable::parse($dates[array_key_last($dates)])->addDay()->toDateString();

        $query = Payment::withTrashed()
            ->join('bank_statements', 'bank_statements.id', '=', 'payments.bank_statement_id')
            ->where('payments.booking_date', '>=', $from)
            ->where('payments.booking_date', '<', $until);

        if ($bankAccountId !== null) {
            $query->where(function ($query) use ($bankAccountId): void {
                $query->where('payments.bank_account_id', $bankAccountId)
                    ->orWhereNull('payments.bank_account_id');
            });
        }

        $payments = $query->get([
            'payments.booking_date',
            'payments.value_date',
            'payments.amount',
            'payments.direction',
            'payments.counterparty_iban',
            'payments.booking_text',
            'payments.purpose',
            'bank_statements.currency as statement_currency',
        ]);

        $existing = [];
        foreach ($payments as $payment) {
            $bookingDate = substr((string) $payment->booking_date, 0, 10);
            if (! isset($dateSet[$bookingDate])) {
                continue;
            }

            $amount = (float) $payment->amount;
            $existing[$this->transactionFingerprint([
                'bookingDate' => $bookingDate,
                'valueDate' => $payment->value_date ? substr((string) $payment->value_date, 0, 10) : null,
                'amount' => $payment->direction === 'debit' ? -$amount : $amount,
                'currency' => $payment->statement_currency ?? 'EUR',
                'counterpartyIban' => $payment->counterparty_iban,
                'bookingText' => $payment->booking_text,
                'purpose' => $payment->purpose,
            ], $bankAccountId)] = true;
        }

        return $existing;
    }

    private function entryReference(array $entry): string
    {
        $reference = $this->normalizeReference((string) ($entry['reference'] ?? ''));
        if ($this->isMeaningfulReference($reference)) {
            return $reference;
        }

        foreach ([(string) ($entry['purpose'] ?? ''), (string) ($entry['bookingText'] ?? '')] as $text) {
            $reference = $this->extractReferenceFromText($text);
            if ($reference !== '') {
                return $reference;
            }
        }

        return '';
    }

    private function extractReferenceFromText(string $value): string
    {
        if (! preg_match_all('/\b[A-Z0-9][A-Z0-9-]{7,}\b/ui', $value, $matches)) {
            return '';
        }

        $candidates = array_values(array_unique(array_map(
            fn (string $match): string => $this->normalizeReference($match),
            $matches[0]
        )));
        usort($candidates, static fn (string $left, string $right): int => strlen($right) <=> strlen($left));

        foreach ($candidates as $candidate) {
            if ($this->isMeaningfulReference($candidate) && str_contains($candidate, '-') && preg_match('/\d/', $candidate)) {
                return $candidate;
            }
        }
        foreach ($candidates as $candidate) {
            if ($this->isMeaningfulReference($candidate) && strlen($candidate) >= 12 && preg_match('/\d/', $candidate)) {
                return $candidate;
            }
        }

        return '';
    }

    private function normalizeReference(string $value): string
    {
        return strtoupper(preg_replace('/[^A-Za-z0-9-]+/', '', trim($value)) ?? '');
    }

    private function isMeaningfulReference(string $value): bool
    {
        if (strlen($value) < 8) {
            return false;
        }

        foreach (['NOTPROVIDED', 'NONREF', 'NOREF', 'NOTAVAILABLE', 'NONE', 'UNKNOWN'] as $placeholder) {
            if ($value === $placeholder || str_contains($value, $placeholder)) {
                return false;
            }
        }

        return true;
    }

    private function fingerprintText(string $value): string
    {
        $value = mb_strtolower($this->normalizeImportedText($value));
        $value = str_replace(['ä', 'ö', 'ü', 'ß'], ['ae', 'oe', 'ue', 'ss'], $value);
        $value = str_replace("\u{FFFD}", '', $value);

        return preg_replace('/\s+/u', ' ', trim($value)) ?? trim($value);
    }

    private function normalizeImportedText(string $value): string
    {
        $value = trim(strtr($value, [
            'Ã¤' => 'ä', 'Ã¶' => 'ö', 'Ã¼' => 'ü', 'Ã„' => 'Ä', 'Ã–' => 'Ö', 'Ãœ' => 'Ü', 'ÃŸ' => 'ß', 'â‚¬' => '€',
        ]));
        $value = preg_replace('/\bF\s+r(?=\s+\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}\b)/u', 'Für', $value) ?? $value;

        return $value;
    }

    /** @return array<string, mixed> */
    private function issueRow(int $index, array $entry, string $reason): array
    {
        return [
            'index' => $index,
            'sourceRow' => (int) ($entry['sourceRow'] ?? $index + 2),
            'reference' => $this->entryReference($entry)
                ?: (trim((string) ($entry['counterpartyName'] ?? '')) ?: (string) ($entry['bookingDate'] ?? '')),
            'bookingDate' => $entry['bookingDate'] ?? null,
            'counterpartyName' => $entry['counterpartyName'] ?? null,
            'amount' => $entry['amount'] ?? null,
            'reason' => $reason,
        ];
    }

    /** @param array<string, mixed> $context */
    private function validateContext(array $context): void
    {
        $fileHash = strtolower((string) ($context['fileHash'] ?? ''));
        if (! preg_match('/^[a-f0-9]{64}$/', $fileHash)) {
            throw ValidationException::withMessages(['fileHash' => 'Für den Import wird ein gültiger SHA-256-Dateihash benötigt.']);
        }

        if (BankStatement::withTrashed()->where('file_hash', $fileHash)->exists()) {
            throw ValidationException::withMessages(['fileHash' => 'Dieser Kontoauszug wurde bereits importiert.']);
        }

        $bankAccountId = $this->bankAccountId($context);
        if ($bankAccountId && ! BusinessPartnerBankAccount::query()->whereKey($bankAccountId)->exists()) {
            throw ValidationException::withMessages(['bankAccountId' => 'Die ausgewählte Bankverbindung existiert nicht mehr.']);
        }
    }

    /** @param array<string, mixed> $context */
    private function bankAccountId(array $context): ?string
    {
        $value = $context['bankAccountId'] ?? null;

        return is_string($value) && $value !== '' ? $value : null;
    }

    private function assertValidUtf8(string $csv): void
    {
        if (! mb_check_encoding($csv, 'UTF-8') || str_contains($csv, "\u{FFFD}")) {
            throw ValidationException::withMessages([
                'csv' => 'Die CSV-Datei enthält beschädigte Zeichen. Bitte die Originaldatei erneut als UTF-8 oder Windows-1252 einlesen.',
            ]);
        }
    }

    private function detectDelimiter(string $line): string
    {
        $scores = [
            ';' => $this->delimiterScore($line, ';'),
            ',' => $this->delimiterScore($line, ','),
        ];

        return $scores[';'] >= $scores[','] ? ';' : ',';
    }

    private function delimiterScore(string $line, string $delimiter): int
    {
        $quoted = false;
        $score = 0;
        $length = strlen($line);

        for ($index = 0; $index < $length; $index++) {
            $character = $line[$index];
            if ($character === '"') {
                if ($quoted && ($line[$index + 1] ?? null) === '"') {
                    $index++;
                } else {
                    $quoted = ! $quoted;
                }
                continue;
            }
            if (! $quoted && $character === $delimiter) {
                $score++;
            }
        }

        return $score;
    }

    private function normalizeHeader(string $value): string
    {
        $value = mb_strtolower(trim($value));
        $value = str_replace(['ä', 'ö', 'ü', 'ß'], ['ae', 'oe', 'ue', 'ss'], $value);

        return preg_replace('/[^a-z0-9]+/', '', $value) ?? $value;
    }

    private function parseDate(string $value): ?CarbonImmutable
    {
        $raw = trim($value);
        if ($raw === '') {
            return null;
        }

        if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})$/', $raw, $matches)) {
            return $this->safeDate((int) $matches[1], (int) $matches[2], (int) $matches[3]);
        }
        if (preg_match('/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2}|\d{4})$/', $raw, $matches)) {
            $year = (int) $matches[3];
            if ($year < 100) {
                $year += 2000;
            }

            return $this->safeDate($year, (int) $matches[2], (int) $matches[1]);
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

    private function parseDecimal(string $value): ?float
    {
        $raw = preg_replace('/\s+/', '', trim($value)) ?? '';
        if ($raw === '') {
            return null;
        }

        if (str_contains($raw, ',')) {
            $raw = preg_replace('/\.(?=\d{3}(?:\D|$))/', '', $raw) ?? $raw;
            $raw = str_replace(',', '.', $raw);
        }

        return is_numeric($raw) ? (float) $raw : null;
    }

    private function normalizeIban(string $value): string
    {
        return strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $value) ?? '');
    }

    private function isUniqueViolation(QueryException $exception, string $column): bool
    {
        if (! in_array((string) ($exception->errorInfo[0] ?? ''), ['23000', '23505'], true)) {
            return false;
        }

        $message = strtolower($exception->getMessage());
        $column = strtolower($column);
        $constraint = str_replace('.', '_', $column).'_unique';

        return str_contains($message, $column) || str_contains($message, $constraint);
    }
}
