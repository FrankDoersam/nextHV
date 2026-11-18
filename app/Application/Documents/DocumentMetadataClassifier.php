<?php

namespace App\Application\Documents;

use App\Models\DocumentCategory;
use Illuminate\Support\Str;

final class DocumentMetadataClassifier
{
    public function __construct(private readonly DocumentAutomaticCategoryService $categories) {}

    /**
     * Adds stable fallback metadata when ChatGPT did not already provide a
     * semantic document title/category. Existing explicit values always win.
     */
    public function enrich(array $payload, string $resourceType, bool $classifyCategory = true): array
    {
        $source = is_array($payload['sourceAttachment'] ?? null) ? $payload['sourceAttachment'] : [];
        $fileName = trim((string) ($source['fileName'] ?? ''));

        if (trim((string) ($payload['title'] ?? '')) === '') {
            $payload['title'] = $this->fallbackTitle($resourceType, $fileName, $payload);
        }

        if ($classifyCategory && trim((string) ($payload['categoryId'] ?? '')) === '') {
            $categoryId = $this->resolveCategoryId(
                $resourceType,
                collect([
                    $payload['title'] ?? null,
                    $payload['description'] ?? null,
                    $fileName,
                ])->filter()->join(' '),
            );

            if ($categoryId !== null) {
                $payload['categoryId'] = $categoryId;
            }
        }

        return $payload;
    }

    public function invoiceDocumentPayload(array $invoicePayload, array $invoiceResult, array $sourceAttachment): array
    {
        $externalNumber = trim((string) ($invoicePayload['externalNumber'] ?? ''));
        $invoiceNumber = trim((string) ($invoiceResult['number'] ?? ''));
        $reference = $externalNumber !== '' ? $externalNumber : $invoiceNumber;
        $isCredit = in_array(($invoicePayload['documentType'] ?? 'invoice'), ['supplier_credit', 'credit'], true);
        $title = $isCredit
            ? ($reference !== '' ? 'Lieferantengutschrift · '.$reference : 'Originalbeleg Lieferantengutschrift')
            : ($reference !== '' ? 'Originalbeleg · '.$reference : 'Originalbeleg Eingangsrechnung');

        $payload = [
            'resourceType' => 'incoming-invoices',
            'resourceId' => (string) ($invoiceResult['id'] ?? ''),
            'title' => $title,
            'description' => $isCredit ? 'Originalbeleg einer Lieferantengutschrift mit Referenz zur ursprünglichen Rechnung.' : 'Originalbeleg der über ChatGPT angelegten Eingangsrechnung.',
            'originalName' => trim((string) ($sourceAttachment['fileName'] ?? '')) ?: null,
            'sourceAttachment' => $sourceAttachment,
        ];

        // Explicit document purpose wins over fuzzy title/name classification.
        $purpose = $isCredit ? 'incoming_invoice_credit' : 'incoming_invoice_original';
        $payload['categoryId'] = $this->categories->find($purpose)?->id;
        // When no category is configured, keep the original uncategorized.
        // Never silently use a fuzzy name match for a known business purpose.
        return $this->enrich($payload, 'incoming-invoices', false);
    }

    private function fallbackTitle(string $resourceType, string $fileName, array $payload): string
    {
        $stem = trim((string) pathinfo($fileName, PATHINFO_FILENAME));
        $stem = preg_replace('/[_-]+/u', ' ', $stem) ?: $stem;
        $stem = preg_replace('/\s+/u', ' ', $stem) ?: $stem;
        $stem = trim($stem);

        if ($resourceType === 'incoming-invoices') {
            $reference = trim((string) ($payload['externalNumber'] ?? ''));
            return $reference !== '' ? 'Originalbeleg · '.$reference : 'Originalbeleg Eingangsrechnung';
        }

        if ($stem !== '') {
            return Str::limit(Str::ucfirst($stem), 255, '');
        }

        return match ($resourceType) {
            'contracts' => 'Vertragsdokument',
            'business-partners' => 'Geschäftspartner-Dokument',
            'properties' => 'Objektdokument',
            'units' => 'Einheitsdokument',
            'meters' => 'Zählerdokument',
            'unit-facilities' => 'Einrichtungsdokument',
            'waste-containers' => 'Mülltonnen-Dokument',
            'open-items' => 'Forderungsdokument',
            'direct-allocations' => 'Direktumlagenbeleg',
            default => 'Dokument',
        };
    }

    private function resolveCategoryId(string $resourceType, string $context): ?string
    {
        $categories = DocumentCategory::query()
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get(['id', 'name', 'slug', 'description', 'resource_types', 'sort_order']);

        if ($categories->isEmpty()) {
            return null;
        }

        $contextText = $this->normalize($context);
        $resourceHints = $this->resourceHints($resourceType);
        $contextTokens = collect(preg_split('/[^a-z0-9]+/', $contextText) ?: [])
            ->filter(static fn (string $token): bool => mb_strlen($token) >= 4)
            ->unique()
            ->values();

        $ranked = $categories->map(function (DocumentCategory $category) use ($resourceType, $resourceHints, $contextText, $contextTokens): ?array {
            $resourceTypes = is_array($category->resource_types) ? $category->resource_types : [];
            if ($resourceTypes !== [] && ! in_array($resourceType, $resourceTypes, true)) {
                return null;
            }

            $candidate = $this->normalize(collect([
                $category->name,
                $category->slug,
                $category->description,
            ])->filter()->join(' '));

            $score = in_array($resourceType, $resourceTypes, true) ? 30 : 0;

            foreach ($resourceHints as $hint) {
                if (str_contains($candidate, $hint)) {
                    $score += 20;
                    if (str_contains($contextText, $hint)) {
                        $score += 100;
                    }
                }
            }

            foreach ($contextTokens as $token) {
                if (str_contains($candidate, $token)) {
                    $score += 15;
                }
            }

            return [
                'id' => (string) $category->id,
                'score' => $score,
                'sortOrder' => (int) $category->sort_order,
            ];
        })->filter()->sortBy([
            ['score', 'desc'],
            ['sortOrder', 'asc'],
        ])->values();

        $best = $ranked->first();
        if (! is_array($best) || (int) ($best['score'] ?? 0) < 50) {
            return null;
        }

        return (string) $best['id'];
    }

    /** @return array<int, string> */
    private function resourceHints(string $resourceType): array
    {
        return match ($resourceType) {
            'incoming-invoices' => ['eingangsrechnung', 'rechnung', 'invoice', 'originalbeleg', 'beleg'],
            'contracts' => ['kuendigung', 'kundigung', 'mietvertrag', 'vertrag', 'nachtrag', 'protokoll', 'vollmacht'],
            'business-partners' => ['vollmacht', 'ausweis', 'register', 'stammdaten', 'geschaeftspartner'],
            'properties' => ['objekt', 'gebaeude', 'grundbuch', 'versicherung'],
            'units' => ['einheit', 'wohnung', 'uebergabe', 'protokoll'],
            'meters' => ['zaehler', 'ablesung', 'zaehlerstand'],
            'unit-facilities' => ['einrichtung', 'anlage', 'wartung'],
            'waste-containers' => ['muell', 'tonne', 'entsorgung'],
            'open-items' => ['forderung', 'gutschrift', 'abrechnung', 'nka', 'zahlung', 'beleg'],
            default => [],
        };
    }

    private function normalize(string $value): string
    {
        return strtolower(Str::ascii($value));
    }
}
