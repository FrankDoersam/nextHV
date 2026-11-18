<?php

namespace App\Http\Controllers\Api\Actions;

use App\Models\DocumentCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class MoveDocumentCategoryAction
{
    public function __invoke(Request $request, DocumentCategory $category): JsonResponse
    {
        $values = $request->validate([
            'targetId' => ['required', 'uuid', Rule::exists('document_categories', 'id')->whereNull('deleted_at')],
            'placement' => ['required', Rule::in(['before', 'inside', 'after'])],
        ]);
        if ((string) $values['targetId'] === (string) $category->id) {
            throw ValidationException::withMessages(['targetId' => 'Eine Kategorie kann nicht auf sich selbst verschoben werden.']);
        }

        $target = DocumentCategory::query()->findOrFail($values['targetId']);
        $newParentId = $values['placement'] === 'inside' ? $target->id : $target->parent_id;
        if ($newParentId && $category->wouldCreateCycle((string) $newParentId)) {
            throw ValidationException::withMessages(['targetId' => 'Diese Zuordnung würde eine Zirkelbeziehung im Kategorienbaum erzeugen.']);
        }

        DB::transaction(function () use ($category, $target, $newParentId, $values): void {
            $oldParentId = $category->parent_id;
            $category->update(['parent_id' => $newParentId]);
            $siblings = DocumentCategory::query()->where('parent_id', $newParentId)->whereKeyNot($category->id)
                ->orderBy('sort_order')->orderBy('name')->get();
            if ($values['placement'] === 'inside') {
                $ordered = $siblings->push($category);
            } else {
                $targetIndex = $siblings->search(fn (DocumentCategory $row): bool => $row->id === $target->id);
                $insertAt = $targetIndex === false ? $siblings->count() : $targetIndex + ($values['placement'] === 'after' ? 1 : 0);
                $ordered = $siblings->values();
                $ordered->splice($insertAt, 0, [$category]);
            }
            $ordered->values()->each(fn (DocumentCategory $row, int $index) => $row->update(['sort_order' => ($index + 1) * 10]));
            if ($oldParentId !== $newParentId) {
                DocumentCategory::query()->where('parent_id', $oldParentId)->orderBy('sort_order')->orderBy('name')->get()
                    ->values()->each(fn (DocumentCategory $row, int $index) => $row->update(['sort_order' => ($index + 1) * 10]));
            }
        });

        return response()->json([
            'jsonapi' => ['version' => '1.1'],
            'data' => ['type' => 'document-categories', 'id' => (string) $category->id],
        ], 200, ['Content-Type' => 'application/vnd.api+json']);
    }
}
