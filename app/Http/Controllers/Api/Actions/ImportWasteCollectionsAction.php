<?php

namespace App\Http\Controllers\Api\Actions;

use App\Http\Controllers\Controller;
use App\Http\Requests\Waste\ImportWasteCollectionsRequest;
use App\Models\WasteCollection;
use App\Services\OperatingCosts\WasteCollectionImportService;
use App\Support\Imports\CsvImportResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Arr;

final class ImportWasteCollectionsAction extends Controller
{
    public function __invoke(ImportWasteCollectionsRequest $request, WasteCollectionImportService $service): JsonResponse
    {
        $command = $request->validated();
        $preview = (bool) ($command['preview'] ?? false);
        $csv = (string) ($command['csv'] ?? '');
        $context = Arr::except($command, ['meta', 'csv', 'preview']);
        $result = $preview ? $service->preview($csv, $context) : $service->importCsv($csv, $context);

        return response()->json([
            'jsonapi' => ['version' => '1.1'],
            'data' => $preview ? [] : collect($result->importedItems)->map(fn (WasteCollection $collection): array => [
                'type' => 'waste-collections',
                'id' => (string) $collection->id,
                'attributes' => [
                    'collectionDate' => $collection->collection_date?->toDateString(),
                    'collectionType' => $collection->collection_type,
                    'notes' => $collection->notes,
                ],
            ])->values(),
            'meta' => CsvImportResponse::meta($result, $preview, [
                'containers' => (int) ($result->meta['containers'] ?? 0),
                'containerIds' => $result->meta['containerIds'] ?? [],
            ]),
        ], $preview ? 200 : 201, ['Content-Type' => 'application/vnd.api+json']);
    }
}
