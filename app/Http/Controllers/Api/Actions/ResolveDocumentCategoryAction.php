<?php

namespace App\Http\Controllers\Api\Actions;

use App\Application\Documents\DocumentAutomaticCategoryService;
use App\Models\DocumentCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class ResolveDocumentCategoryAction
{
    public function __invoke(Request $request, DocumentAutomaticCategoryService $categories): JsonResponse
    {
        abort_unless($request->user()?->isAdmin() && $request->user()?->is_active, 403);
        $input = $request->validate([
            'purpose' => ['required', 'string', Rule::in(array_keys(DocumentCategory::AUTOMATIC_USES))],
        ]);

        return response()->json([
            'data' => ['categoryId' => $categories->find($input['purpose'])?->id],
        ])->header('Cache-Control', 'private, no-store, max-age=0');
    }
}
