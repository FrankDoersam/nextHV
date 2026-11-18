<?php

namespace App\Services\Documents;

/**
 * One-way transfer from persisted Canvas documents to semantic Tiptap JSON.
 *
 * This class contains no report-specific content. It preserves authored text,
 * variables, tables, relations, signatures and page breaks while moving page
 * chrome and typography into first-class Tiptap nodes. Once migrated, the DB
 * document is authoritative and FPDF renders the same semantic structure.
 */
final class CanvasToTiptapDocumentMigrator
{
    public const VERSION = 2;

    /** @return array{style:array<string,mixed>,blocks:array<int,array<string,mixed>>} */
    public function migrate(array $blocks, array $style, string $title = ''): array
    {
        if ($this->looksLikeTiptap($blocks)) {
            return [
                'style' => $this->enterpriseStyle($style),
                'blocks' => $this->ensurePageChrome($blocks, $style, $title),
            ];
        }

        $body = $this->convertCanvas($blocks);

        return [
            'style' => $this->enterpriseStyle($style),
            'blocks' => $this->ensurePageChrome($body, $style, $title),
        ];
    }

    private function looksLikeTiptap(array $blocks): bool
    {
        $first = collect($blocks)->first(fn (mixed $node): bool => is_array($node));
        return is_array($first) && isset($first['type']) && ! array_key_exists('value', $first);
    }

    /** @return array<int,array<string,mixed>> */
    private function convertCanvas(array $elements): array
    {
        $result = [];
        $inline = [];

        $flush = function () use (&$inline, &$result): void {
            if ($inline === []) return;
            $result[] = ['type' => 'paragraph', 'content' => $inline];
            $inline = [];
        };

        foreach ($elements as $element) {
            if (! is_array($element)) continue;
            $type = (string) ($element['type'] ?? '');

            if ($type === 'title') {
                $flush();
                $content = $this->canvasInline(is_array($element['valueList'] ?? null) ? $element['valueList'] : [$element]);
                if ($content !== []) {
                    $result[] = ['type' => 'heading', 'attrs' => ['level' => $this->headingLevel((string) ($element['level'] ?? 'second'))], 'content' => $content];
                }
                continue;
            }

            if ($type === 'separator') {
                $flush();
                $result[] = ['type' => 'horizontalRule'];
                continue;
            }

            if ($type === 'pageBreak') {
                $flush();
                $result[] = ['type' => 'pageBreak'];
                continue;
            }

            if ($type === 'table') {
                $flush();
                $semantic = data_get($element, 'extension.s4v2');
                if (is_array($semantic) && ($semantic['kind'] ?? null) === 'signatureBlock') {
                    $result[] = ['type' => 'signatureBlock', 'attrs' => $this->signatureAttrs($semantic)];
                } elseif (is_array($semantic) && ($semantic['kind'] ?? null) === 'relationTable') {
                    $result[] = ['type' => 'relationTable', 'attrs' => [
                        'source' => (string) ($semantic['source'] ?? ''),
                        'label' => (string) ($semantic['label'] ?? 'Daten'),
                        'columns' => array_values(array_filter($semantic['columns'] ?? [], 'is_array')),
                        'minimumRows' => max(0, min(20, (int) ($semantic['minimumRows'] ?? 0))),
                        'emptyText' => (string) ($semantic['emptyText'] ?? 'Keine Einträge vorhanden.'),
                    ]];
                } else {
                    $table = $this->canvasTable($element);
                    if ($table !== null) $result[] = $table;
                }
                continue;
            }

            $value = (string) ($element['value'] ?? '');
            if ($value === "\n" || $value === "\r\n") {
                $flush();
                continue;
            }

            if ($value === '' && is_array($element['valueList'] ?? null)) {
                array_push($inline, ...$this->canvasInline($element['valueList']));
                continue;
            }

            foreach ($this->splitCanvasElement($element) as $part) {
                if ($part === null) {
                    $flush();
                } elseif (is_array($part)) {
                    $inline[] = $part;
                }
            }
        }

        $flush();
        return $result !== [] ? $result : [['type' => 'paragraph']];
    }

    /** @return array<int,array<string,mixed>|null> */
    private function splitCanvasElement(array $element): array
    {
        $semantic = data_get($element, 'extension.s4v2');
        if (is_array($semantic) && ($semantic['kind'] ?? null) === 'variable') {
            $path = trim((string) ($semantic['path'] ?? ''));
            if ($path === '') return [];
            return [[
                'type' => 'variable',
                'attrs' => ['path' => $path, 'label' => (string) ($semantic['label'] ?? $path)],
                'marks' => $this->canvasMarks($element),
            ]];
        }

        $value = (string) ($element['value'] ?? '');
        if ($value === '') return [];
        $parts = preg_split('/(\r\n|\n|\r)/u', $value, -1, PREG_SPLIT_DELIM_CAPTURE) ?: [$value];
        $result = [];
        foreach ($parts as $part) {
            if (preg_match('/^(\r\n|\n|\r)$/u', $part) === 1) {
                $result[] = null;
                continue;
            }
            if ($part === '') continue;
            $node = ['type' => 'text', 'text' => $part];
            $marks = $this->canvasMarks($element);
            if ($marks !== []) $node['marks'] = $marks;
            $result[] = $node;
        }
        return $result;
    }

    /** @return array<int,array<string,mixed>> */
    private function canvasInline(array $elements): array
    {
        $result = [];
        foreach ($elements as $element) {
            if (! is_array($element)) continue;
            foreach ($this->splitCanvasElement($element) as $part) {
                if ($part === null) $result[] = ['type' => 'hardBreak'];
                elseif (is_array($part)) $result[] = $part;
            }
            if (is_array($element['valueList'] ?? null)) array_push($result, ...$this->canvasInline($element['valueList']));
        }
        return $result;
    }

    /** @return array<int,array{type:string}> */
    private function canvasMarks(array $element): array
    {
        $marks = [];
        if (($element['bold'] ?? false) === true) $marks[] = ['type' => 'bold'];
        if (($element['italic'] ?? false) === true) $marks[] = ['type' => 'italic'];
        if (($element['underline'] ?? false) === true) $marks[] = ['type' => 'underline'];
        return $marks;
    }

    private function canvasTable(array $element): ?array
    {
        $rows = [];
        foreach (($element['trList'] ?? []) as $rowIndex => $row) {
            if (! is_array($row)) continue;
            $headerRow = ($row['pagingRepeat'] ?? false) === true || $rowIndex === 0;
            $cells = [];
            foreach (($row['tdList'] ?? []) as $cell) {
                if (! is_array($cell)) continue;
                $inline = $this->canvasInline(is_array($cell['value'] ?? null) ? $cell['value'] : []);
                $attrs = [
                    'colspan' => max(1, (int) ($cell['colspan'] ?? 1)),
                    'rowspan' => max(1, (int) ($cell['rowspan'] ?? 1)),
                ];
                $alignment = $this->canvasAlignment($cell);
                $paragraph = ['type' => 'paragraph'];
                if ($alignment !== null) $paragraph['attrs'] = ['textAlign' => $alignment];
                if ($inline !== []) $paragraph['content'] = $inline;
                $cells[] = ['type' => $headerRow ? 'tableHeader' : 'tableCell', 'attrs' => $attrs, 'content' => [$paragraph]];
            }
            if ($cells !== []) $rows[] = ['type' => 'tableRow', 'content' => $cells];
        }
        return $rows === [] ? null : ['type' => 'table', 'content' => $rows];
    }

    private function canvasAlignment(array $cell): ?string
    {
        foreach (($cell['value'] ?? []) as $item) {
            if (! is_array($item)) continue;
            return match (strtolower((string) ($item['rowFlex'] ?? ''))) {
                'center' => 'center',
                'right' => 'right',
                'justify' => 'justify',
                'left' => 'left',
                default => null,
            };
        }
        return null;
    }

    private function signatureAttrs(array $semantic): array
    {
        return [
            'locationPath' => (string) ($semantic['locationPath'] ?? 'organization.city'),
            'datePath' => (string) ($semantic['datePath'] ?? 'today.date'),
            'placeDateLabel' => (string) ($semantic['placeDateLabel'] ?? 'Ort, Datum'),
            'leftEnabled' => ($semantic['leftEnabled'] ?? true) !== false,
            'rightEnabled' => ($semantic['rightEnabled'] ?? true) !== false,
            'leftLabel' => (string) ($semantic['leftLabel'] ?? 'Vermieter'),
            'rightLabel' => (string) ($semantic['rightLabel'] ?? 'Mieter'),
            'leftNamePath' => (string) ($semantic['leftNamePath'] ?? ''),
            'rightNamePath' => (string) ($semantic['rightNamePath'] ?? ''),
        ];
    }

    private function headingLevel(string $level): int
    {
        return match (strtolower($level)) {
            'first', '1' => 1,
            'third', '3' => 3,
            default => 2,
        };
    }

    /** @return array<int,array<string,mixed>> */
    private function ensurePageChrome(array $blocks, array $style, string $title): array
    {
        $format = collect($blocks)->firstWhere('type', 'documentFormat');
        $header = collect($blocks)->firstWhere('type', 'pageHeader');
        $footer = collect($blocks)->firstWhere('type', 'pageFooter');
        $body = array_values(array_filter($blocks, fn (array $node): bool => ! in_array((string) ($node['type'] ?? ''), ['documentFormat', 'pageHeader', 'pageFooter'], true)));
        $documentTitle = trim($title) !== '' ? trim($title) : 'Dokument';

        $formatNode = is_array($format) ? $format : ['type' => 'documentFormat', 'attrs' => [
            'fontFamily' => $this->fontFamily((string) ($style['fontFamily'] ?? 'Helvetica')),
            'fontSize' => (float) ($style['fontSize'] ?? 9.4),
        ]];

        $headerNode = is_array($header) ? $header : ['type' => 'pageHeader', 'attrs' => []];
        $headerNode['attrs'] = [
            'align' => $this->alignment((string) data_get($headerNode, 'attrs.align', $style['pageHeaderAlign'] ?? 'right'), 'right'),
            'fontFamily' => $this->fontFamily((string) data_get($headerNode, 'attrs.fontFamily', $style['fontFamily'] ?? 'Helvetica')),
            'fontSize' => (float) data_get($headerNode, 'attrs.fontSize', 7.2),
        ];
        if (! is_array($headerNode['content'] ?? null) || $headerNode['content'] === []) {
            $headerNode['content'] = $this->textContent(mb_strtoupper($documentTitle));
        }

        $footerNode = is_array($footer) ? $footer : ['type' => 'pageFooter', 'attrs' => []];
        $footerNode['attrs'] = [
            ...($footerNode['attrs'] ?? []),
            'align' => $this->alignment((string) data_get($footerNode, 'attrs.align', 'left'), 'left'),
            'fontFamily' => $this->fontFamily((string) data_get($footerNode, 'attrs.fontFamily', $style['fontFamily'] ?? 'Helvetica')),
            'fontSize' => (float) data_get($footerNode, 'attrs.fontSize', 6.8),
            'pageNumbers' => data_get($footerNode, 'attrs.pageNumbers', true) !== false,
            'pageNumberFormat' => (string) data_get($footerNode, 'attrs.pageNumberFormat', 'Seite {pageNo} / {pageCount}'),
            'pageNumberAlign' => $this->alignment((string) data_get($footerNode, 'attrs.pageNumberAlign', 'right'), 'right'),
            'pageNumberFontSize' => (float) data_get($footerNode, 'attrs.pageNumberFontSize', 6.8),
        ];
        if (! is_array($footerNode['content'] ?? null) || $footerNode['content'] === []) {
            $footerNode['content'] = $this->textContent($documentTitle);
        }

        return [$formatNode, $headerNode, ...$body, $footerNode];
    }

    /** @return array<int,array{type:string,text:string}> */
    private function textContent(string $text): array
    {
        return trim($text) === '' ? [] : [['type' => 'text', 'text' => $text]];
    }

    private function enterpriseStyle(array $style): array
    {
        $preservePageBreaks = ($style['preserveSourcePageBreaks'] ?? true) !== false;
        $result = [
            ...$style,
            'engine' => 'tiptap-fpdf',
            'editorSchemaVersion' => 13,
            'reportWorkspaceVersion' => 13,
            'pageSize' => 'A4',
            'orientation' => 'portrait',
            'headerPreset' => 'none',
            'fontFamily' => $this->fontFamily((string) ($style['fontFamily'] ?? $style['font'] ?? 'Helvetica')),
            'marginLeft' => 20.0,
            'marginRight' => 20.0,
            'marginTop' => 18.0,
            'marginBottom' => 17.0,
            'firstPageBodyTop' => 18.0,
            'continuationBodyTop' => 18.0,
            'fontSize' => 9.4,
            'lineHeight' => 4.3,
            'paragraphGap' => 1.0,
            'emptyParagraphHeight' => 3.2,
            'h1FontSize' => 16.0,
            'h1LineHeight' => 6.2,
            'h1GapBefore' => 0.0,
            'h1GapAfter' => 3.0,
            'h2FontSize' => 10.2,
            'h2LineHeight' => 4.8,
            'h2GapBefore' => 3.2,
            'h2GapAfter' => 1.0,
            'h3FontSize' => 9.4,
            'h3LineHeight' => 4.3,
            'h3GapBefore' => 2.2,
            'h3GapAfter' => 0.7,
            'headingTreatment' => 'editorial',
            'headingTextColor' => '1F2D36',
            'headingAccentColor' => '54778C',
            'headingRuleColor' => 'D9E2E7',
            'horizontalRuleColor' => 'D9E2E7',
            'horizontalRuleGapBefore' => 1.3,
            'horizontalRuleGapAfter' => 2.1,
            'horizontalRuleLineWidth' => 0.14,
            'tableGap' => 1.8,
            'tableHeaderFill' => 'F1F5F7',
            'tableHeaderTextColor' => '263740',
            'tableBodyTextColor' => '303B42',
            'tableBorderColor' => 'D3DDE2',
            'tableBorderWidth' => 0.12,
            'tableCellPaddingX' => 2.3,
            'tableCellPaddingY' => 1.7,
            'tableMinRowHeight' => 7.2,
            'footerTextColor' => '6F7A80',
            'preserveSourcePageBreaks' => $preservePageBreaks,
            'migratedFromCanvas' => (string) ($style['engine'] ?? 'canvas-editor') !== 'tiptap-fpdf',
            'canvasToTiptapMigrationVersion' => self::VERSION,
        ];

        foreach ([
            'pageHeaderText', 'pageHeaderAlign', 'pageHeaderFontFamily', 'pageHeaderFontSize',
            'pageFooterText', 'pageFooterAlign', 'pageFooterFontFamily', 'pageFooterFontSize',
            'footerPageNumber', 'footerPageNumberFormat', 'footerPageNumberAlign', 'footerFontSize',
            'officialForm', 'officialFormLockedGeometry', 'officialFormBackgroundImage',
            'sourceGridPages', 'sourceGridSignatureHeight', 'sourceGridHeaderFill', 'sourceGridBorderColor',
            'sourceGridBorderWidth', 'sourceGridNumberColumnFill', 'sourceGridShadeNumberColumn',
            'sourceGridPaddingX', 'sourceGridPaddingY', 'sourceGridMinRowHeight', 'sourceGridTableGap',
            'sectionBandFill', 'sectionBandTextColor', 'sectionBandBorderColor', 'subsectionBandFill',
            'subsectionBandTextColor',
        ] as $key) unset($result[$key]);

        return $result;
    }

    private function fontFamily(string $value): string
    {
        return match (strtolower(trim($value))) {
            'times', 'times new roman', 'serif' => 'Times',
            'courier', 'courier new', 'mono', 'monospace' => 'Courier',
            default => 'Helvetica',
        };
    }

    private function alignment(string $value, string $fallback): string
    {
        return match (strtolower(trim($value))) {
            'center', 'centre', 'c', 'mittig' => 'center',
            'right', 'r', 'rechts' => 'right',
            'left', 'l', 'links' => 'left',
            default => $fallback,
        };
    }
}
