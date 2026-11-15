<?php

namespace App\Http\Controllers;

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Lomkit\Rest\Facades\Rest;

class GlobalSearchController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        if (is_string($request->input('query'))) {
            $request->merge(['query' => trim($request->input('query'))]);
        }
        $values = $request->validate(['query' => ['required', 'string', 'min:2', 'max:100']]);
        $groups = [];
        foreach (config('resource_features', []) as $name => $feature) {
            if (empty($feature['search'])) {
                continue;
            }
            $class = $feature['resource'];
            if (! Gate::allows('viewAny', $class::$model)) {
                continue;
            }
            $resource = new $class;
            $title = $resource->uiTitleField();
            $subtitles = $feature['search']['subtitle'] ?? [];
            $columns = array_values(array_unique(['id', $title, ...array_filter($subtitles, fn (string $field): bool => ! str_contains($field, '.'))]));
            try {
                $page = Rest::search($class)->as($request->user())->payload([
                    'text' => ['value' => $values['query']],
                    'selects' => array_map(fn (string $field): array => ['field' => $field], $columns),
                    'includes' => $resource->uiPicker()['includes'] ?? [],
                    'sorts' => [['field' => 'id', 'direction' => 'desc']],
                    'limit' => 10,
                ])->render();
            } catch (AuthorizationException) {
                continue;
            }
            $groups[] = [
                'resource' => $name,
                'label' => $feature['label'],
                'total' => $page['total'],
                'items' => array_map(fn (array $row): array => [
                    'id' => $row['id'],
                    'title' => (string) ($row[$title] ?? '#'.$row['id']),
                    'subtitle' => implode(' · ', array_filter(array_map(fn (string $field): string => (string) data_get($row, $field, ''), $subtitles))),
                    'url' => '/'.$name.'/'.$row['id'],
                ], $page['data']),
            ];
        }

        return response()->json(['data' => $groups], 200, ['Cache-Control' => 'private, no-store']);
    }
}
