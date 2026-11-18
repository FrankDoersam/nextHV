<?php

namespace App\Application\Documents;

use App\Models\DocumentCategory;
use Illuminate\Validation\ValidationException;

/** Stable, administrator-selected document destinations (no category-name lookup). */
final class DocumentAutomaticCategoryService
{
    public function find(string $purpose): ?DocumentCategory
    {
        $ownerType = DocumentCategory::AUTOMATIC_USES[$purpose] ?? null;
        if (! $ownerType) {
            throw ValidationException::withMessages(['purpose' => 'Unbekannter Zweck für automatische Dokumentablage.']);
        }

        $category = DocumentCategory::query()
            ->where('automatic_use', $purpose)
            ->where('is_active', true)
            ->first();

        if (! $category) return null;

        $scopes = $category->resource_types;
        if (is_array($scopes) && $scopes !== [] && ! in_array($ownerType, $scopes, true)) {
            // Can only occur after a legacy/raw write or a broken import.
            throw ValidationException::withMessages([
                'categoryId' => 'Die automatische Dokumentkategorie ist für ihren Dokumentbereich nicht freigegeben.',
            ]);
        }

        return $category;
    }

    public function requiredId(string $purpose): string
    {
        $category = $this->find($purpose);
        if (! $category) {
            throw ValidationException::withMessages([
                'categoryId' => 'Für diese automatische Ablage ist noch keine aktive Dokumentkategorie konfiguriert. Bitte unter Einstellungen → Dokumente → Kategorien zuordnen.',
            ]);
        }

        return (string) $category->id;
    }
}
