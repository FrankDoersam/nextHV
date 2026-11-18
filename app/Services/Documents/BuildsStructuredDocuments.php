<?php

namespace App\Services\Documents;

/**
 * Semantic document-building toolkit. Builders describe content and business
 * structure only; the editor/PDF layers render the same semantic nodes.
 */
trait BuildsStructuredDocuments
{
    protected function heading(int $level, string $text): array
    {
        return ['type' => 'heading', 'attrs' => ['level' => $level], 'content' => [['type' => 'text', 'text' => $text]]];
    }

    protected function paragraph(string $text, array $marks = []): array
    {
        return ['type' => 'paragraph', 'content' => $this->textToNodes($text, $marks)];
    }

    protected function horizontalRule(): array { return ['type' => 'horizontalRule']; }

    protected function pageBreak(): array { return ['type' => 'pageBreak']; }

    /**
     * Business-style key/value table.
     *
     * Labels are semantic row headers instead of inventing a generic
     * "Angabe / Wert" header row. This keeps compact fact tables readable in
     * both the editor and the PDF while real data tables still use a column
     * header row.
     *
     * @param array<int, array{0:string,1:string,2?:bool}> $rows
     */
    protected function factsTable(array $rows, int $labelWidth = 205, int $valueWidth = 415): array
    {
        $content = [];

        foreach ($rows as $row) {
            $strong = (bool) ($row[2] ?? false);
            $valueMarks = $strong ? [['type' => 'bold']] : [];
            $content[] = [
                'type' => 'tableRow',
                'content' => [
                    $this->tableCell('tableHeader', $row[0], [$labelWidth]),
                    $this->tableCell('tableCell', $row[1], [$valueWidth], $valueMarks),
                ],
            ];
        }

        return ['type' => 'table', 'content' => $content];
    }

    protected function partyTable(string $leftLabel, string $leftValue, string $rightLabel, string $rightValue): array
    {
        return ['type' => 'table', 'content' => [
            ['type' => 'tableRow', 'content' => [$this->tableCell('tableHeader', $leftLabel, [310]), $this->tableCell('tableHeader', $rightLabel, [310])]],
            ['type' => 'tableRow', 'content' => [$this->tableCell('tableCell', $leftValue, [310]), $this->tableCell('tableCell', $rightValue, [310])]],
        ]];
    }

    /** @param array<int, array{key:string,label:string}> $columns */
    protected function relationTable(string $source, string $label, array $columns, int $minimumRows = 0, string $emptyText = ''): array
    {
        return ['type' => 'relationTable', 'attrs' => compact('source', 'label', 'columns', 'minimumRows', 'emptyText')];
    }

    /** @param array<int, string> $columns */
    protected function blankTable(array $columns, int $rows = 4): array
    {
        $width = max(1, (int) floor(620 / max(1, count($columns))));
        $content = [['type' => 'tableRow', 'content' => array_map(fn (string $label): array => $this->tableCell('tableHeader', $label, [$width]), $columns)]];
        for ($index = 0; $index < $rows; $index++) {
            $content[] = ['type' => 'tableRow', 'content' => array_map(fn (string $_): array => $this->tableCell('tableCell', '', [$width]), $columns)];
        }
        return ['type' => 'table', 'content' => $content];
    }

    /**
     * Generic ruled writing area made only from standard Tiptap paragraphs and
     * horizontal rules. No report-specific renderer is required.
     *
     * @return array<int, array<string, mixed>>
     */
    protected function freeTextArea(int $lines, int $blankParagraphs = 2): array
    {
        $nodes = [];
        $blankParagraphs = max(1, min(4, $blankParagraphs));

        for ($index = 0; $index < $lines; $index++) {
            for ($blank = 0; $blank < $blankParagraphs; $blank++) {
                $nodes[] = ['type' => 'paragraph', 'content' => []];
            }
            $nodes[] = $this->horizontalRule();
        }

        return $nodes;
    }

    protected function signatureBlock(
        string $leftLabel = 'Unterschrift Vermieter / Vertretung',
        string $rightLabel = 'Unterschrift Mieter / Mieterin',
        bool $leftEnabled = true,
        bool $rightEnabled = true,
        string $leftNamePath = 'inputs.signature.landlord',
        string $rightNamePath = 'inputs.signature.tenants',
    ): array {
        return ['type' => 'signatureBlock', 'attrs' => [
            'locationPath' => 'inputs.signature.location', 'datePath' => 'inputs.signature.date', 'placeDateLabel' => 'Ort, Datum',
            'leftEnabled' => $leftEnabled, 'rightEnabled' => $rightEnabled, 'leftLabel' => $leftLabel, 'rightLabel' => $rightLabel,
            'leftNamePath' => $leftNamePath, 'rightNamePath' => $rightNamePath,
        ]];
    }

    protected function tableCell(string $type, string $text, array $width, array $marks = []): array
    {
        return ['type' => $type, 'attrs' => ['colspan' => 1, 'rowspan' => 1, 'colwidth' => $width], 'content' => [['type' => 'paragraph', 'content' => $this->textToNodes($text, $marks)]]];
    }

    /** @return array<int, array<string, mixed>> */
    protected function textToNodes(string $text, array $marks = []): array
    {
        $nodes = [];
        $offset = 0;
        preg_match_all('/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/u', $text, $matches, PREG_OFFSET_CAPTURE);
        foreach ($matches[0] ?? [] as $index => $match) {
            [$full, $position] = $match;
            if ($position > $offset) $this->appendTextNodes($nodes, substr($text, $offset, $position - $offset), $marks);
            $path = (string) ($matches[1][$index][0] ?? '');
            $variable = ['type' => 'variable', 'attrs' => ['path' => $path, 'label' => $this->variableLabel($path)]];
            if ($marks !== []) $variable['marks'] = $marks;
            $nodes[] = $variable;
            $offset = $position + strlen($full);
        }
        if ($offset < strlen($text)) $this->appendTextNodes($nodes, substr($text, $offset), $marks);
        elseif ($nodes === [] && $text !== '') $this->appendTextNodes($nodes, $text, $marks);
        return $nodes;
    }

    private function variableLabel(string $path): string
    {
        return match ($path) {
            'unit.leaseAncillarySpacesLabel' => 'Nebenräume / Zubehör',
            'inputs.housing.ownerName' => 'Name des Eigentümers',
            default => ContractDocumentDataRegistry::label($path),
        };
    }

    private function appendTextNodes(array &$nodes, string $text, array $marks): void
    {
        $parts = preg_split('/\R/u', $text) ?: [$text];
        foreach ($parts as $index => $part) {
            if ($part !== '') {
                $node = ['type' => 'text', 'text' => $part];
                if ($marks !== []) $node['marks'] = $marks;
                $nodes[] = $node;
            }
            if ($index < count($parts) - 1) $nodes[] = ['type' => 'hardBreak'];
        }
    }
}
