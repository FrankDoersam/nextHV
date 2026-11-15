<?php

namespace App\Http\Controllers;

use App\Framework\Import\CsvImportService;
use App\Framework\Import\ImportMutationRequest;
use App\Models\ImportBatch;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Lomkit\Rest\Facades\Rest;

class CsvImportController extends Controller
{
    public function schema(string $resource, CsvImportService $service): JsonResponse
    {
        [, $fields] = $service->definition($resource);

        return response()->json(['fields' => array_values($fields), 'template' => $service->template($fields), 'limits' => ['rows' => 100, 'bytes' => 2097152]], 200, ['Cache-Control' => 'private, no-store']);
    }

    public function inspect(Request $request, string $resource, CsvImportService $service): JsonResponse
    {
        [, $fields] = $service->definition($resource);
        $request->validate(['file' => ['required', 'file', 'max:2048']]);
        $csv = $service->read($request->file('file'));

        return response()->json(['fields' => array_values($fields), 'headers' => $csv['headers'], 'sample' => array_slice($csv['rows'], 0, 3), 'count' => count($csv['rows']), 'mapping' => $service->mapping($csv, $fields), 'values' => array_map(fn (int $column): array => array_values(array_unique(array_column($csv['rows'], $column))), array_keys($csv['headers']))], 200, ['Cache-Control' => 'private, no-store']);
    }

    public function preview(Request $request, string $resource, CsvImportService $service): JsonResponse
    {
        [$config, $fields] = $service->definition($resource);
        $request->validate(['file' => ['required', 'file', 'max:2048'], 'mapping' => ['required', 'string', 'max:15000']]);
        $mapping = json_decode($request->string('mapping'), true);
        validator(['mapping' => $mapping], [
            'mapping' => ['required', 'array', 'min:1', 'max:50'],
            'mapping.*' => ['array:field,column,match,values'],
            'mapping.*.field' => ['required', 'string'],
            'mapping.*.column' => ['required', 'integer', 'min:0', 'max:49'],
            'mapping.*.match' => ['nullable', 'string'],
            'mapping.*.values' => ['sometimes', 'array', 'max:100'],
            'mapping.*.values.*' => ['array:from,to'],
            'mapping.*.values.*.from' => ['present', 'string', 'max:10000'],
            'mapping.*.values.*.to' => ['required'],
        ])->validate();
        $preview = $service->preview($service->read($request->file('file')), $mapping, $config, $fields, $request->user());
        $batch = $preview['valid'] ? ImportBatch::create([
            'id' => (string) Str::uuid(), 'user_id' => $request->user()->getAuthIdentifier(), 'resource' => $resource,
            'payload' => $preview['payload'], 'expires_at' => now()->addMinutes(15),
        ]) : null;

        return response()->json(['rows' => $preview['rows'], 'valid' => $preview['valid'], 'token' => $batch?->id, 'expires_at' => $batch?->expires_at], 200, ['Cache-Control' => 'private, no-store']);
    }

    public function commit(Request $request, string $resource, CsvImportService $service): JsonResponse
    {
        [$config, $fields] = $service->definition($resource);
        $values = $request->validate(['token' => ['required', 'uuid']]);
        $result = DB::transaction(function () use ($values, $request, $resource, $config, $fields, $service) {
            $batch = ImportBatch::whereKey($values['token'])->where('user_id', $request->user()->getAuthIdentifier())->where('resource', $resource)->lockForUpdate()->firstOrFail();
            if ($batch->completed_at) {
                return ['count' => $batch->count, 'completed' => true];
            }
            if ($batch->expires_at->isPast()) {
                throw ValidationException::withMessages(['token' => 'Die Vorschau ist abgelaufen. Bitte erneut prüfen.']);
            }
            foreach ($batch->payload as $row) {
                if (array_diff(array_keys($row), array_keys($fields))) {
                    throw ValidationException::withMessages(['token' => 'Die Importfreigabe wurde geändert. Bitte eine neue Vorschau erstellen.']);
                }
            }
            // Recheck relation visibility at execution time, including changed policies/scopes.
            foreach ($config['import']['relations'] ?? [] as $field => $relation) {
                $ids = array_values(array_unique(array_filter(array_column($batch->payload, $field))));
                if ($ids === []) {
                    continue;
                }
                $page = Rest::search($relation['resource'])->as($request->user())->payload(['filters' => [...$service->relationFilters($config, $field), ['field' => 'id', 'operator' => 'in', 'value' => $ids]], 'limit' => 100, 'selects' => [['field' => 'id']]])->render();
                if ($page['total'] !== count($ids)) {
                    throw ValidationException::withMessages([$field => 'Mindestens eine zugeordnete Beziehung ist nicht mehr verfügbar. Bitte erneut prüfen.']);
                }
            }
            $count = ImportMutationRequest::prepare($config['resource'], $batch->payload, $request->user())->execute();
            $batch->update(['count' => $count, 'completed_at' => now(), 'payload' => []]);

            return ['count' => $count, 'completed' => true];
        });

        return response()->json($result, 200, ['Cache-Control' => 'private, no-store']);
    }
}
