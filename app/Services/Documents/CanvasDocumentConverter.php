<?php

namespace App\Services\Documents;

/** Converts the semantic report AST and legacy editor trees into Canvas Editor elements. */
final class CanvasDocumentConverter
{
    private const PX_PER_MM = 96 / 25.4;

    /** @return array<int, array<string, mixed>> */
    public function convert(array $nodes, array $style = []): array
    {
        if ($this->looksLikeCanvas($nodes)) return $nodes;

        $result = [];
        foreach ($nodes as $node) {
            if (! is_array($node)) continue;
            array_push($result, ...$this->node($node, $style));
        }
        return $this->ensureContent($result);
    }

    public function contentWidth(array $style = []): float
    {
        $landscape = (string) ($style['orientation'] ?? 'portrait') === 'landscape';
        $paperWidthMm = $landscape ? 297.0 : 210.0;
        $left = is_numeric($style['marginLeft'] ?? null) ? (float) $style['marginLeft'] : 22.0;
        $right = is_numeric($style['marginRight'] ?? null) ? (float) $style['marginRight'] : 22.0;

        return max(280.0, ($paperWidthMm - $left - $right) * self::PX_PER_MM);
    }

    private function looksLikeCanvas(array $nodes): bool
    {
        $first = collect($nodes)->first(fn ($node): bool => is_array($node));
        return is_array($first) && array_key_exists('value', $first) && ! array_key_exists('content', $first);
    }

    /** @return array<int, array<string, mixed>> */
    private function node(array $node, array $style): array
    {
        $type = (string) ($node['type'] ?? '');
        return match ($type) {
            'paragraph' => $this->paragraph($node, $style),
            'heading' => [$this->title($node, $style), ['value' => "\n"]],
            'horizontalRule' => [['type' => 'separator', 'value' => '', 'lineWidth' => 1, 'color' => '#'.ltrim((string) ($style['horizontalRuleColor'] ?? 'D6D6D6'), '#')]],
            'pageBreak' => [['type' => 'pageBreak', 'value' => '']],
            'blockquote' => $this->blockquote($node, $style),
            'table' => [$this->table($node, $style)],
            'relationTable' => [$this->relationTable($node, $style)],
            'signatureBlock' => [$this->signatureTable($node, $style)],
            'bulletList' => $this->list($node, false, $style),
            'orderedList' => $this->list($node, true, $style),
            default => is_array($node['content'] ?? null) ? $this->children($node['content'], $style) : [],
        };
    }

    /** @return array<int, array<string, mixed>> */
    private function paragraph(array $node, array $style): array
    {
        $content = is_array($node['content'] ?? null) ? $node['content'] : [];
        $rowFlex = $this->paragraphRowFlex($node, $style);
        $elements = $this->withRowFlex($this->inline($content, $style), $rowFlex);

        return [...$elements, ['value' => "\n"]];
    }

    /** @return array<int, array<string, mixed>> */
    private function blockquote(array $node, array $style): array
    {
        $rowFlex = $this->rowFlex((string) ($style['bodyTextAlign'] ?? 'justify'));
        $elements = $this->withRowFlex(
            $this->inline($this->descendantInline($node), $style, ['italic' => true, 'color' => '#52616A']),
            $rowFlex,
        );

        return [...$elements, ['value' => "\n"]];
    }

    /** @return array<int, array<string, mixed>> */
    private function children(array $nodes, array $style): array
    {
        $result = [];
        foreach ($nodes as $node) if (is_array($node)) array_push($result, ...$this->node($node, $style));
        return $result;
    }

    private function title(array $node, array $style): array
    {
        $level = max(1, min(6, (int) data_get($node, 'attrs.level', 2)));
        $sizes = [1 => (float) ($style['h1FontSize'] ?? 16), 2 => (float) ($style['h2FontSize'] ?? 12), 3 => (float) ($style['h3FontSize'] ?? 10.5)];
        $titleLevel = [1 => 'first', 2 => 'second', 3 => 'third', 4 => 'fourth', 5 => 'fifth', 6 => 'sixth'][$level];
        $valueList = $this->withRowFlex(
            $this->inline($node['content'] ?? [], $style, ['bold' => true, 'size' => ($sizes[$level] ?? 10) * 96 / 72]),
            'left',
        );

        return [
            'type' => 'title', 'value' => '', 'level' => $titleLevel,
            'valueList' => $valueList,
        ];
    }

    /** @return array<int, array<string, mixed>> */
    private function inline(array $content, array $style, array $base = []): array
    {
        $result = [];
        foreach ($content as $node) {
            if (! is_array($node)) continue;
            $type = (string) ($node['type'] ?? '');
            $marks = collect($node['marks'] ?? [])->pluck('type')->all();
            $format = [
                ...$base,
                'bold' => ($base['bold'] ?? false) || in_array('bold', $marks, true),
                'italic' => ($base['italic'] ?? false) || in_array('italic', $marks, true),
                'underline' => ($base['underline'] ?? false) || in_array('underline', $marks, true),
            ];
            if ($type === 'text') {
                $value = $this->typographicText((string) ($node['text'] ?? ''));
                if ($value !== '') $result[] = ['value' => $value, ...$format];
            } elseif ($type === 'hardBreak') {
                $result[] = ['value' => "\n"];
            } elseif ($type === 'variable') {
                $path = trim((string) data_get($node, 'attrs.path', ''));
                $label = trim((string) data_get($node, 'attrs.label', $path));
                $result[] = [
                    'value' => '{{'.$path.'}}', ...$format,
                    'extension' => ['s4v2' => ['kind' => 'variable', 'path' => $path, 'label' => $label]],
                    'hint' => $label.' · '.$path,
                ];
            } elseif (is_array($node['content'] ?? null)) {
                array_push($result, ...$this->inline($node['content'], $style, $format));
            }
        }
        return $result;
    }

    private function table(array $node, array $style): array
    {
        $rows = array_values(array_filter($node['content'] ?? [], fn ($row): bool => is_array($row) && ($row['type'] ?? null) === 'tableRow'));
        $columnWidths = $this->columnWidths($rows, $style);
        $borderColor = '#'.ltrim((string) ($style['tableBorderColor'] ?? 'D6D6D6'), '#');
        $headerFill = '#'.ltrim((string) ($style['tableHeaderFill'] ?? 'F4F6F7'), '#');
        $minHeight = max(24, (float) ($style['tableMinRowHeight'] ?? 7) * self::PX_PER_MM);

        return [
            'type' => 'table', 'value' => '', 'borderType' => 'all', 'borderColor' => $borderColor,
            'borderWidth' => max(0.5, (float) ($style['tableBorderWidth'] ?? 0.5)),
            'colgroup' => array_map(fn (float $width): array => ['width' => $width], $columnWidths),
            'trList' => array_map(function (array $row) use ($style, $headerFill, $minHeight): array {
                $cells = array_values(array_filter($row['content'] ?? [], 'is_array'));
                $headerRow = $cells !== [] && collect($cells)->every(fn (array $cell): bool => ($cell['type'] ?? null) === 'tableHeader');
                return [
                    'height' => $minHeight, 'minHeight' => $minHeight, 'pagingRepeat' => $headerRow,
                    'tdList' => array_map(function (array $cell) use ($style, $headerFill): array {
                        $header = ($cell['type'] ?? null) === 'tableHeader';
                        return [
                            'colspan' => max(1, (int) data_get($cell, 'attrs.colspan', 1)),
                            'rowspan' => max(1, (int) data_get($cell, 'attrs.rowspan', 1)),
                            'verticalAlign' => 'top',
                            'backgroundColor' => $header ? $headerFill : '#FFFFFF',
                            'value' => $this->cellContent($cell, $style, $header),
                        ];
                    }, $cells),
                ];
            }, $rows),
        ];
    }

    private function relationTable(array $node, array $style): array
    {
        $attrs = is_array($node['attrs'] ?? null) ? $node['attrs'] : [];
        $columns = array_values(array_filter($attrs['columns'] ?? [], 'is_array'));
        $minimumRows = max(0, min(20, (int) ($attrs['minimumRows'] ?? 0)));
        $width = $this->contentWidth($style) / max(1, count($columns));
        $headerFill = '#'.ltrim((string) ($style['tableHeaderFill'] ?? 'F4F6F7'), '#');
        $headerColor = '#'.ltrim((string) ($style['tableHeaderTextColor'] ?? '2F3437'), '#');
        $bodyColor = '#'.ltrim((string) ($style['tableBodyTextColor'] ?? '343A3E'), '#');
        $cell = fn (string $value, bool $header = false): array => [
            'colspan' => 1, 'rowspan' => 1, 'verticalAlign' => 'top',
            'backgroundColor' => $header ? $headerFill : '#FFFFFF',
            'value' => [[
                'value' => $this->typographicText($value),
                'bold' => $header,
                'color' => $header ? $headerColor : $bodyColor,
                'rowFlex' => 'left',
            ]],
        ];
        $minHeight = max(28, (float) ($style['tableMinRowHeight'] ?? 7) * self::PX_PER_MM);
        $rows = [[
            'height' => $minHeight, 'minHeight' => $minHeight, 'pagingRepeat' => true,
            'tdList' => array_map(fn (array $column): array => $cell((string) ($column['label'] ?? $column['key'] ?? ''), true), $columns),
        ]];
        for ($i = 0; $i < max(1, $minimumRows); $i++) {
            $rows[] = ['height' => max(34, $minHeight), 'minHeight' => max(34, $minHeight), 'tdList' => array_map(fn (): array => $cell(''), $columns)];
        }
        return [
            'type' => 'table', 'value' => '', 'borderType' => 'all',
            'borderColor' => '#'.ltrim((string) ($style['tableBorderColor'] ?? 'D6D6D6'), '#'),
            'borderWidth' => max(0.5, (float) ($style['tableBorderWidth'] ?? 0.5)),
            'colgroup' => array_map(fn (): array => ['width' => $width], $columns), 'trList' => $rows,
            'extension' => ['s4v2' => [
                'kind' => 'relationTable', 'source' => (string) ($attrs['source'] ?? ''), 'label' => (string) ($attrs['label'] ?? 'Daten'),
                'columns' => $columns, 'minimumRows' => $minimumRows, 'emptyText' => (string) ($attrs['emptyText'] ?? ''),
            ]],
        ];
    }

    private function signatureTable(array $node, array $style): array
    {
        $attrs = is_array($node['attrs'] ?? null) ? $node['attrs'] : [];
        $columns = [];
        if (($attrs['leftEnabled'] ?? true) !== false) $columns[] = ['path' => (string) ($attrs['leftNamePath'] ?? ''), 'label' => (string) ($attrs['leftLabel'] ?? 'Unterschrift Vermieter / Vertretung')];
        if (($attrs['rightEnabled'] ?? true) !== false) $columns[] = ['path' => (string) ($attrs['rightNamePath'] ?? ''), 'label' => (string) ($attrs['rightLabel'] ?? 'Unterschrift Mieter / Mieterin')];
        $width = $this->contentWidth($style) / max(1, count($columns));
        return [
            'type' => 'table', 'value' => '', 'borderType' => 'empty',
            'colgroup' => array_map(fn (): array => ['width' => $width], $columns),
            'trList' => [[
                'height' => 90, 'minHeight' => 90,
                'tdList' => array_map(fn (array $column): array => [
                    'colspan' => 1, 'rowspan' => 1, 'verticalAlign' => 'bottom',
                    'value' => [
                        ['value' => "\n\n____________________________\n", 'rowFlex' => 'left'],
                        ['value' => $column['path'] !== '' ? '{{'.$column['path'].'}}\n' : '', 'rowFlex' => 'left'],
                        ['value' => $column['label'], 'size' => 10, 'color' => '#555555', 'rowFlex' => 'left'],
                    ],
                ], $columns),
            ]],
            'extension' => ['s4v2' => ['kind' => 'signatureBlock', ...$attrs]],
        ];
    }

    /** @return array<int, array<string, mixed>> */
    private function list(array $node, bool $ordered, array $style): array
    {
        $result = [];
        $index = 1;
        foreach (($node['content'] ?? []) as $item) {
            if (! is_array($item)) continue;
            $prefix = $ordered ? $index.'. ' : '• ';
            $result[] = ['value' => $prefix, 'bold' => false, 'rowFlex' => 'left'];
            array_push($result, ...$this->inline($this->descendantInline($item), $style));
            $result[] = ['value' => "\n"];
            $index++;
        }
        return $result;
    }

    /** @return array<int, array<string, mixed>> */
    private function cellContent(array $cell, array $style, bool $header): array
    {
        $result = [];
        $children = array_values(array_filter($cell['content'] ?? [], 'is_array'));
        foreach ($children as $index => $child) {
            if (($child['type'] ?? null) === 'paragraph') {
                array_push($result, ...$this->inline($child['content'] ?? [], $style, $header ? ['bold' => true] : []));
            } else {
                array_push($result, ...$this->children([$child], $style));
            }
            if ($index < count($children) - 1) $result[] = ['value' => "\n"];
        }

        $result = $result !== [] ? $result : [['value' => '']];
        $result = $this->withRowFlex($result, $this->rowFlex((string) ($style['tableTextAlign'] ?? 'left')));
        $color = '#'.ltrim((string) ($header ? ($style['tableHeaderTextColor'] ?? '2F3437') : ($style['tableBodyTextColor'] ?? '343A3E')), '#');
        foreach ($result as $index => $element) {
            if (($element['value'] ?? '') !== "\n" && ! isset($element['color'])) $result[$index]['color'] = $color;
        }

        return $result;
    }

    /** @return array<int, mixed> */
    private function descendantInline(array $node): array
    {
        $result = [];
        $walk = function (array $current) use (&$walk, &$result): void {
            foreach (($current['content'] ?? []) as $child) {
                if (! is_array($child)) continue;
                if (in_array($child['type'] ?? null, ['text', 'variable', 'hardBreak'], true)) $result[] = $child;
                else $walk($child);
            }
        };
        $walk($node);
        return $result;
    }

    /** @return array<int, float> */
    private function columnWidths(array $rows, array $style): array
    {
        $first = $rows[0]['content'] ?? [];
        $weights = [];
        foreach ($first as $cell) {
            if (! is_array($cell)) continue;
            $width = data_get($cell, 'attrs.colwidth.0');
            $weights[] = is_numeric($width) && (float) $width > 0 ? (float) $width : 1.0;
        }
        if ($weights === []) return [$this->contentWidth($style)];
        $total = max(1.0, array_sum($weights));
        $contentWidth = $this->contentWidth($style);
        return array_map(fn (float $weight): float => $contentWidth * ($weight / $total), $weights);
    }

    private function paragraphRowFlex(array $node, array $style): string
    {
        $explicit = trim((string) data_get($node, 'attrs.align', ''));
        if ($explicit !== '') return $this->rowFlex($explicit);

        // Bold metadata lines directly beneath a document title should remain
        // left-aligned. Stretching a short contract/address line looks unlike a
        // typeset business document, while normal prose is deliberately justified.
        if ($this->allTextualNodesBold($node['content'] ?? [])) return 'left';

        return $this->rowFlex((string) ($style['bodyTextAlign'] ?? 'justify'));
    }

    private function allTextualNodesBold(mixed $content): bool
    {
        if (! is_array($content)) return false;
        $found = false;
        foreach ($content as $node) {
            if (! is_array($node)) continue;
            $type = (string) ($node['type'] ?? '');
            if ($type === 'hardBreak') continue;
            if (in_array($type, ['text', 'variable'], true)) {
                $found = true;
                $marks = collect($node['marks'] ?? [])->pluck('type')->all();
                if (! in_array('bold', $marks, true)) return false;
                continue;
            }
            if (is_array($node['content'] ?? null) && ! $this->allTextualNodesBold($node['content'])) return false;
        }
        return $found;
    }

    private function rowFlex(string $value): string
    {
        return match (mb_strtolower(trim($value))) {
            'center', 'c' => 'center',
            'right', 'r' => 'right',
            'justify', 'alignment', 'block', 'blocksatz', 'j' => 'alignment',
            default => 'left',
        };
    }

    /** @param array<int, array<string, mixed>> $elements */
    private function withRowFlex(array $elements, string $rowFlex): array
    {
        foreach ($elements as $index => $element) {
            if (($element['value'] ?? '') === "\n") continue;
            $elements[$index]['rowFlex'] = $rowFlex;
            break;
        }
        return $elements;
    }

    private function typographicText(string $value): string
    {
        if ($value === '') return '';
        $nbsp = "\u{00A0}";

        // Canvas can collapse ordinary spaces at boundaries between separate
        // text/variable elements. Preserve those boundaries without introducing
        // visible formatting or placeholder highlighting.
        if (str_starts_with($value, ' ')) $value = $nbsp.substr($value, 1);
        if (str_ends_with($value, ' ')) $value = substr($value, 0, -1).$nbsp;

        // Keep common German legal references together so line wrapping remains
        // grammatically readable in justified paragraphs.
        $value = preg_replace('/§§\s+(?=\d)/u', '§§'.$nbsp, $value) ?? $value;
        $value = preg_replace('/§\s+(?=\d)/u', '§'.$nbsp, $value) ?? $value;
        $value = preg_replace('/\bArt\.\s+(?=\d)/u', 'Art.'.$nbsp, $value) ?? $value;
        $value = preg_replace('/\bAbs\.\s+(?=\d)/u', 'Abs.'.$nbsp, $value) ?? $value;
        $value = preg_replace('/\bNr\.\s+(?=\d)/u', 'Nr.'.$nbsp, $value) ?? $value;
        $value = preg_replace('/(\d)\s+%/u', '$1'.$nbsp.'%', $value) ?? $value;

        return $value;
    }

    private function ensureContent(array $elements): array
    {
        return $elements !== [] ? $elements : [['value' => '']];
    }
}
