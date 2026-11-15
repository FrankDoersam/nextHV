<?php

namespace App\Http\Controllers;

use App\Framework\FeatureRegistry;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Lomkit\Rest\Facades\Rest;

class GlobalSearchController extends Controller
{
    public function __invoke(Request $request, FeatureRegistry $features): JsonResponse
    {
        if (is_string($request->input('query'))) {
            $request->merge(['query' => trim($request->input('query'))]);
        }
        $values = $request->validate(['query' => ['required', 'string', 'min:2', 'max:100']]);
        $groups = [];
        foreach ($features->all() as $name => $feature) {
            if (empty($feature['search'])) {
                continue;
            }
            $class = $feature['resource'];
            if (! Gate::allows('viewAny', $class::$model)) {
                continue;
            }
            $title = $feature['search']['title'];
            $subtitles = $feature['search']['subtitle'] ?? [];
            $columns = array_values(array_unique(['id', ...array_filter([$title, ...$subtitles], fn (string $field): bool => ! str_contains($field, '.'))]));
            try {
                $page = Rest::search($class)->as($request->user())->payload([
                    'text' => ['value' => $values['query']],
                    'selects' => array_map(fn (string $field): array => ['field' => $field], $columns),
                    'includes' => $feature['search']['includes'],
                    'sorts' => [['field' => 'id', 'direction' => 'desc']],
                    'limit' => $feature['search']['limit'] <= 10 ? 10 : ($feature['search']['limit'] <= 25 ? 25 : 50),
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
                    'title' => (string) (data_get($row, $title, '#'.$row['id'])),
                    'subtitle' => implode(' · ', array_filter(array_map(fn (string $field): string => (string) data_get($row, $field, ''), $subtitles))),
                    'url' => '/'.$name.'/'.$row['id'],
                ], array_slice($page['data'], 0, $feature['search']['limit'])),
            ];
        }

        return response()->json(['data' => $groups], 200, ['Cache-Control' => 'private, no-store']);
    }
}
