<?php

namespace App\Services\OperatingCosts;

use App\Application\Documents\DocumentAutomaticCategoryService;
use App\Models\Document;
use App\Models\OperatingCostStatementUnit;
use App\Reports\OperatingCostStatementPdfReport;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

final class OperatingCostStatementDocumentArchiveService
{
    public function __construct(
        private readonly OperatingCostStatementPdfReport $report,
        private readonly DocumentAutomaticCategoryService $categories,
    ) {}

    /**
     * Store the exact current statement PDF as a document revision and point the
     * current frozen document snapshot to that revision. Prior Document records and
     * PDF bytes remain untouched when an explicitly editable draft is revised.
     */
    public function archive(OperatingCostStatementUnit $row, ?string $userId = null): Document
    {
        // Validate the designated category before creating an immutable PDF
        // or touching the document storage filesystem.
        $categoryId = $this->categories->find('operating_cost_statement')?->id;
        // Billing must remain possible before a category is configured; such
        // versions are archived uncategorized rather than in an arbitrary folder.
        $row->loadMissing(['statement', 'unit', 'contract']);
        $pdf = $this->report->render($row);
        if (! str_starts_with($pdf, '%PDF-')) {
            throw new RuntimeException('Die serverseitige Betriebskostenabrechnung hat kein gültiges PDF geliefert.');
        }

        $snapshotHash = $this->snapshotHash($row);
        $createdOn = $row->statement?->created_on ?? now();
        $path = sprintf(
            'documents/operating-cost-statements/%s/%s/%s/%s.pdf',
            $createdOn->format('Y'),
            $createdOn->format('m'),
            $row->id,
            Str::uuid()->toString(),
        );

        if (! Storage::disk('local')->put($path, $pdf)) {
            throw new RuntimeException('Das PDF der Betriebskostenabrechnung konnte nicht archiviert werden.');
        }

        $document = null;
        try {
            $document = Document::query()->create([
                'documentable_type' => $row->getMorphClass(),
                'documentable_id' => $row->id,
                'category_id' => $categoryId,
                'title' => 'Betriebskostenabrechnung '.($row->statement?->number ?: $row->id).' · '.($row->contract?->contract_number ?: 'Vertrag'),
                'description' => 'Archivierte PDF-Version der eingefrorenen Betriebskostenabrechnung.',
                'status' => 'completed',
                'disk' => 'local',
                'path' => $path,
                'original_name' => $this->report->filename($row),
                'mime_type' => 'application/pdf',
                'size_bytes' => strlen($pdf),
                'sha256' => hash('sha256', $pdf),
                'uploaded_by' => $userId,
                'metadata' => [
                    'generated' => true,
                    'generator' => 'operating-cost-statement-pdf',
                    'resourceType' => 'operating-cost-statement-units',
                    'statementNumber' => $row->statement?->number,
                    'contractNumber' => $row->contract?->contract_number,
                    'calculationSnapshotVersion' => (int) data_get($row->calculation_snapshot, 'schemaVersion', 0),
                    'documentSnapshotVersion' => (int) data_get($row->document_snapshot, 'schemaVersion', 0),
                    'contentHash' => $snapshotHash,
                    'generatedAt' => now()->toISOString(),
                ],
            ]);

            $snapshot = (array) ($row->document_snapshot ?? []);
            $row->forceFill([
                'document_snapshot' => [
                    ...$snapshot,
                    'archiveDocumentId' => (string) $document->id,
                    'archiveContentHash' => $snapshotHash,
                ],
            ])->saveQuietly();

            return $document;
        } catch (Throwable $exception) {
            if ($document instanceof Document) {
                $document->delete();
            }
            Storage::disk('local')->delete($path);
            throw $exception;
        }
    }

    public function snapshotHash(OperatingCostStatementUnit $row): string
    {
        $document = (array) ($row->document_snapshot ?? []);
        unset($document['archiveDocumentId'], $document['archiveContentHash']);

        return hash('sha256', json_encode([
            'calculation' => (array) ($row->calculation_snapshot ?? []),
            'document' => $document,
        ], JSON_THROW_ON_ERROR));
    }
}
