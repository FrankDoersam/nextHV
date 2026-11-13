<?php

namespace App\Http\Controllers;

use App\Framework\Crud\CrudRegistry;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;

final class CrudMetadataController extends Controller
{
    public function show(string $resource): JsonResponse
    {
        $model = CrudRegistry::modelFor($resource);
        abort_unless($model, 404);

        Gate::authorize('viewAny', $model);

        return response()->json([
            'data' => CrudRegistry::rulesFor($resource)->metadata(),
        ]);
    }
}
