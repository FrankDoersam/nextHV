<?php

namespace App\Http\Controllers\Api\Actions;

use App\Http\Controllers\Controller;
use App\Http\Requests\Finance\ImportBankStatementRequest;
use App\Models\BankStatement;
use App\Services\Finance\BankStatementImportService;
use App\Support\Imports\CsvImportResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Arr;

final class ImportBankStatementAction extends Controller
{
    public function __invoke(ImportBankStatementRequest $request, BankStatementImportService $service): JsonResponse
    {
        $command = $request->validated();
        $preview = (bool) ($command['preview'] ?? false);
        $csv = (string) ($command['csv'] ?? '');
        $context = Arr::except($command, ['meta', 'csv', 'preview']) + ['userId' => $request->user()?->id];
        $result = $preview ? $service->preview($csv, $context) : $service->importCsv($csv, $context);
        $statement = $result->meta['statement'] ?? null;

        return response()->json([
            'jsonapi' => ['version' => '1.1'],
            'data' => $statement instanceof BankStatement ? [[
                'type' => 'bank-statements',
                'id' => $statement->id,
                'attributes' => [
                    'fileName' => $statement->file_name,
                    'source' => $statement->source,
                    'statementDate' => $statement->statement_date?->toDateString(),
                    'entryCount' => $statement->entry_count,
                    'totalAmount' => (float) $statement->total_amount,
                    'currency' => $statement->currency,
                    'status' => $statement->status,
                    'createdAt' => $statement->created_at?->toISOString(),
                ],
            ]] : [],
            'meta' => CsvImportResponse::meta($result, $preview, [
                'currency' => (string) ($result->meta['currency'] ?? $statement?->currency ?? 'EUR'),
                'statementDate' => $result->meta['statementDate'] ?? $statement?->statement_date?->toDateString(),
                'paymentsCreated' => $result->importedCount(),
            ]),
        ], $preview ? 200 : 201, ['Content-Type' => 'application/vnd.api+json']);
    }
}
