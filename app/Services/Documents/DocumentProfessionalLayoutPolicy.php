<?php

namespace App\Services\Documents;

/**
 * Professional visual baseline for persisted editor documents.
 *
 * Visible content stays in the Tiptap tree. Tables, document references and
 * signatures use shared presentation rules across every report; individual
 * document profiles may tune typography, but not these core business patterns.
 */
final class DocumentProfessionalLayoutPolicy
{
    public const VERSION = 27;

    private const MODERN_LEGAL_CODES = [
        'lease-contract-residential-source',
        'lease-contract-garage-source',
        'lease-contract-parking-space',
        'privacy-notice-residential',
        'house-rules-residential',
    ];

    private const BUILTIN_HEADERS = [
        'lease-contract-residential-source' => 'MIETVERTRAG · WOHNRAUM',
        'lease-contract-garage-source' => 'MIETVERTRAG · GARAGE / STELLPLATZ',
        'lease-contract-parking-space' => 'MIETVERTRAG · KFZ-STELLPLATZ',
        'privacy-notice-residential' => 'DATENSCHUTZHINWEISE · MIETVERHÄLTNIS',
        'house-rules-residential' => 'HAUSORDNUNG',
        'handover-protocol-residential-source' => 'ÜBERGABEPROTOKOLL · EINZUG',
        'return-protocol-residential-source' => 'RÜCKGABEPROTOKOLL · AUSZUG',
        'housing-provider-confirmation-residential' => 'WOHNUNGSGEBERBESTÄTIGUNG · § 19 BMG',
    ];

    private const BUILTIN_FOOTERS = [
        'lease-contract-residential-source' => 'Mietvertrag über Wohnraum',
        'lease-contract-garage-source' => 'Mietvertrag Garage / Stellplatz',
        'lease-contract-parking-space' => 'Mietvertrag Kfz-Stellplatz',
        'privacy-notice-residential' => 'Datenschutzhinweise',
        'house-rules-residential' => 'Hausordnung',
        'handover-protocol-residential-source' => 'Übergabeprotokoll',
        'return-protocol-residential-source' => 'Rückgabeprotokoll',
        'housing-provider-confirmation-residential' => 'Wohnungsgeberbestätigung · § 19 BMG',
    ];

    /** Exact labels retained by earlier seeded templates; never match arbitrary user text. */
    private const LEGACY_BUILTIN_FOOTERS = [
        'privacy-notice-residential' => ['Datenschutzhinweise zum Mietverhältnis'],
    ];

    /** Preserve authored notes; the central reference already identifies built-in documents. */
    public function footerSupplement(string $code, string $text): string
    {
        $builtins = [self::BUILTIN_FOOTERS[$code] ?? null, ...(self::LEGACY_BUILTIN_FOOTERS[$code] ?? [])];

        return in_array(trim($text), $builtins, true) ? '' : $text;
    }

    /** @param array<string,mixed> $style @return array<string,mixed> */
    public function style(array $style, string $code = ''): array
    {
        $style = [
            ...$style,
            'engine' => 'tiptap-fpdf',
            'editorSchemaVersion' => 15,
            'reportWorkspaceVersion' => 15,
            'documentSuiteDesignVersion' => self::VERSION,
            'documentSuiteLayoutVersion' => self::VERSION,
            'visualContrastVersion' => self::VERSION,
            'layoutProfile' => 'editor-authoritative-professional-suite-v3',
            'documentSuiteTheme' => 'slate-paper-professional-v3',
            'pageSize' => 'A4',
            'orientation' => 'portrait',
            'marginLeft' => 19.0,
            'marginRight' => 19.0,
            'marginTop' => 17.0,
            'marginBottom' => 16.0,
            'firstPageBodyTop' => 17.0,
            'continuationBodyTop' => 17.0,
            'fontFamily' => 'Helvetica',
            'fontSize' => 9.6,
            'lineHeight' => 4.45,
            'paragraphGap' => 1.15,
            'emptyParagraphHeight' => 3.2,
            'h1FontSize' => 17.0,
            'h1LineHeight' => 6.5,
            'h1GapBefore' => 0.0,
            'h1GapAfter' => 3.4,
            'h2FontSize' => 10.8,
            'h2LineHeight' => 5.0,
            'h2GapBefore' => 3.5,
            'h2GapAfter' => 1.2,
            'h3FontSize' => 9.8,
            'h3LineHeight' => 4.5,
            'h3GapBefore' => 2.5,
            'h3GapAfter' => 0.9,
            'headingTreatment' => 'editorial',
            'headingTextColor' => '17262F',
            'headingAccentColor' => '42657A',
            'headingRuleColor' => 'C8D5DC',
            'horizontalRuleColor' => 'C8D5DC',
            'horizontalRuleGapBefore' => 1.6,
            'horizontalRuleGapAfter' => 2.2,
            'horizontalRuleLineWidth' => 0.16,
            'documentReferenceDesignVersion' => self::VERSION,
            'documentReferenceWidth' => 64.0,
            'documentReferenceFill' => 'F7F8F8',
            'documentReferenceBorderColor' => 'D9DEE1',
            'documentReferenceAccentColor' => '68767D',
            'documentReferenceLabelColor' => '6A747A',
            'documentReferenceValueColor' => '20282C',
            'documentReferenceLabel' => 'VERTRAGSNUMMER',
            'signatureKeepTogether' => true,
            'signatureKeepTogetherHeight' => 48.0,
            'footerTextColor' => '68767D',
            'headerPreset' => 'none',
            'preserveSourcePageBreaks' => false,
        ];

        if ($this->isModernLegalCode($code)) {
            $style = [
                ...$style,
                'layoutProfile' => 'editor-authoritative-modern-legal-v1',
                'documentSuiteTheme' => 'modern-legal-slate-v1',
                'modernLegalSuite' => true,
                'marginLeft' => 18.5,
                'marginRight' => 18.5,
                'marginTop' => 18.5,
                'marginBottom' => 17.0,
                'firstPageBodyTop' => 18.5,
                'continuationBodyTop' => 18.5,
                'fontSize' => 9.45,
                'lineHeight' => 4.5,
                'paragraphGap' => 1.25,
                'h1FontSize' => 18.5,
                'h1LineHeight' => 7.0,
                'h1GapAfter' => 3.8,
                'h2FontSize' => 11.2,
                'h2LineHeight' => 5.25,
                'h2GapBefore' => 4.0,
                'h2GapAfter' => 1.35,
                'h3FontSize' => 9.9,
                'h3LineHeight' => 4.6,
                'h3GapBefore' => 2.8,
                'h3GapAfter' => 0.95,
                'headingTextColor' => '142832',
                'headingAccentColor' => '3B667A',
                'headingRuleColor' => 'C6D7DF',
                'horizontalRuleColor' => 'C6D7DF',
                'horizontalRuleGapBefore' => 1.8,
                'horizontalRuleGapAfter' => 2.5,
                'horizontalRuleLineWidth' => 0.18,
                'pageHeaderTextColor' => '58717E',
                'pageHeaderOffset' => 6.2,
                'pageFooterTextColor' => '718087',
                'pageFooterOffset' => 9.0,
                'pageNumberOffset' => 9.0,
                'footerTextColor' => '718087',
                'pdfCellMargin' => 1.25,
            ];
        }

        if ($this->isHousingProviderCode($code)) {
            $style = [
                ...$style,
                'layoutProfile' => 'editor-authoritative-bmg-business-v1',
                'documentSuiteTheme' => 'neutral-business-paper-v1',
                'housingProviderBusinessLayout' => true,
                'marginLeft' => 20.0,
                'marginRight' => 20.0,
                'marginTop' => 18.0,
                'marginBottom' => 17.0,
                'firstPageBodyTop' => 18.0,
                'continuationBodyTop' => 18.0,
                'fontSize' => 9.6,
                'lineHeight' => 4.45,
                'paragraphGap' => 1.15,
                'emptyParagraphHeight' => 4.2,
                'h1FontSize' => 17.0,
                'h1LineHeight' => 6.5,
                'h1GapAfter' => 3.5,
                'h2FontSize' => 10.7,
                'h2LineHeight' => 5.0,
                'h2GapBefore' => 4.0,
                'h2GapAfter' => 1.2,
                'headingTextColor' => '20282C',
                'headingAccentColor' => '657078',
                'headingRuleColor' => 'D8DDDF',
                'horizontalRuleColor' => 'D8DDDF',
                'signatureSingleWidth' => 82.0,
                'signatureGapBefore' => 6.0,
                'signatureRuleColor' => '6E777C',
                'signatureTextColor' => '5B6469',
                'signaturePlaceDateColor' => '30383C',
                'footerTextColor' => '737B7F',
            ];
        }

        // One table system for every report. Document-specific profiles above
        // deliberately cannot override this shared business presentation.
        $style = [
            ...$style,
            'tableDesignVersion' => self::VERSION,
            'tableDesign' => 'business-neutral-v1',
            'tableGap' => 1.8,
            'tableHeaderFill' => 'EEF0F1',
            'tableHeaderTextColor' => '2C353A',
            'tableRowHeaderFill' => 'F7F8F8',
            'tableRowHeaderTextColor' => '4A545A',
            'tableBodyTextColor' => '252C30',
            'tableBorderColor' => 'D9DEE1',
            'tableBorderWidth' => 0.12,
            'tableCellPaddingX' => 2.5,
            'tableCellPaddingY' => 1.8,
            'tableMinRowHeight' => 7.4,
            'tableHeaderTextAlign' => 'L',
            'tableBodyTextAlign' => 'L',
            'tableAlternateRows' => false,
            'tableRowAlternateFill' => 'FFFFFF',
        ];

        foreach ([
            'pageHeaderText', 'pageHeaderAlign', 'pageHeaderFontFamily', 'pageHeaderFontSize',
            'pageFooterText', 'pageFooterAlign', 'pageFooterFontFamily', 'pageFooterFontSize',
            'footerPageNumber', 'footerPageNumberFormat', 'footerPageNumberAlign', 'footerFontSize',
        ] as $legacyChromeKey) {
            unset($style[$legacyChromeKey]);
        }

        return $style;
    }

    /**
     * @param array<int,array<string,mixed>> $blocks
     * @param array<string,mixed> $style
     * @return array<int,array<string,mixed>>
     */
    public function normalize(array $blocks, string $code, string $name, array $style): array
    {
        $format = null;
        $header = null;
        $footer = null;
        $body = [];

        foreach ($blocks as $node) {
            if (! is_array($node)) {
                continue;
            }

            $type = (string) ($node['type'] ?? '');
            if ($type === 'documentFormat' && $format === null) {
                $format = $node;
                continue;
            }
            if ($type === 'pageHeader' && $header === null) {
                $header = $node;
                continue;
            }
            if ($type === 'pageFooter' && $footer === null) {
                $footer = $node;
                continue;
            }

            $body[] = $this->normalizeNode($node, $code);
        }

        $modernLegal = $this->isModernLegalCode($code);
        $body = $this->normalizeDocumentReference($body);

        $format ??= ['type' => 'documentFormat', 'attrs' => []];
        $format['attrs'] = [
            ...(is_array($format['attrs'] ?? null) ? $format['attrs'] : []),
            'fontFamily' => (string) ($style['fontFamily'] ?? 'Helvetica'),
            'fontSize' => (float) ($style['fontSize'] ?? 9.6),
        ];

        $headerText = self::BUILTIN_HEADERS[$code] ?? null;
        $header ??= ['type' => 'pageHeader', 'attrs' => [], 'content' => []];
        $header['attrs'] = [
            ...(is_array($header['attrs'] ?? null) ? $header['attrs'] : []),
            'align' => $modernLegal ? 'left' : 'right',
            'fontFamily' => 'Helvetica',
            'fontSize' => $modernLegal ? 6.9 : 7.1,
        ];
        if ($headerText !== null) {
            $header['content'] = [['type' => 'text', 'text' => $headerText]];
        } elseif (! is_array($header['content'] ?? null) || $header['content'] === []) {
            $header['content'] = [['type' => 'text', 'text' => $name]];
        }

        $footerText = self::BUILTIN_FOOTERS[$code] ?? null;
        $footer ??= ['type' => 'pageFooter', 'attrs' => [], 'content' => []];
        $footer['attrs'] = [
            ...(is_array($footer['attrs'] ?? null) ? $footer['attrs'] : []),
            'align' => 'left',
            'fontFamily' => 'Helvetica',
            'fontSize' => $modernLegal ? 6.5 : 6.7,
            'pageNumbers' => true,
            'pageNumberFormat' => 'Seite {pageNo} / {pageCount}',
            'pageNumberAlign' => 'right',
            'pageNumberFontSize' => $modernLegal ? 6.5 : 6.7,
        ];
        if ($footerText !== null) {
            $footer['content'] = [['type' => 'text', 'text' => $footerText]];
        } elseif (! is_array($footer['content'] ?? null) || $footer['content'] === []) {
            $footer['content'] = [['type' => 'text', 'text' => $name]];
        }

        return [$format, $header, ...$body, $footer];
    }

    /** @param array<int,array<string,mixed>> $body @return array<int,array<string,mixed>> */
    private function normalizeDocumentReference(array $body): array
    {
        if (
            ! isset($body[0], $body[1])
            || ($body[0]['type'] ?? null) !== 'heading'
            || (int) data_get($body[0], 'attrs.level', 0) !== 1
            || ! in_array(($body[1]['type'] ?? null), ['paragraph', 'blockquote'], true)
            || ! $this->isPureContractReference($body[1])
        ) {
            return array_values($body);
        }

        $variable = $this->findVariableNode($body[1], 'contract.number') ?? [
            'type' => 'variable',
            'attrs' => ['path' => 'contract.number', 'label' => 'Vertragsnummer'],
        ];
        $marks = is_array($variable['marks'] ?? null) ? $variable['marks'] : [];
        if (! collect($marks)->contains(fn (mixed $mark): bool => is_array($mark) && ($mark['type'] ?? null) === 'bold')) {
            $marks[] = ['type' => 'bold'];
        }
        $variable['marks'] = $marks;

        $reference = [
            'type' => 'blockquote',
            'attrs' => ['variant' => 'document-meta'],
            'content' => [
                ['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Vertragsnummer']]],
                ['type' => 'paragraph', 'content' => [$variable]],
            ],
        ];

        $tail = array_slice($body, 2);
        if (($tail[0]['type'] ?? null) === 'horizontalRule') {
            array_shift($tail);
        }

        return [$body[0], $reference, ...array_values($tail)];
    }

    /** @param array<string,mixed> $node */
    private function isPureContractReference(array $node): bool
    {
        $paths = array_values(array_unique($this->variablePaths($node)));
        if ($paths !== ['contract.number']) {
            return false;
        }

        $static = mb_strtolower(trim($this->staticText($node)));
        $static = preg_replace('/[\s:._-]+/u', ' ', $static) ?? $static;
        $static = trim($static);

        return in_array($static, ['', 'vertrag', 'vertragsnummer', 'vertragsnr', 'vertrag nr'], true);
    }

    /** @param array<string,mixed> $node @return array<int,string> */
    private function variablePaths(array $node): array
    {
        $paths = [];
        if (($node['type'] ?? null) === 'variable') {
            $path = trim((string) data_get($node, 'attrs.path', ''));
            if ($path !== '') {
                $paths[] = $path;
            }
        }
        foreach (($node['content'] ?? []) as $child) {
            if (is_array($child)) {
                array_push($paths, ...$this->variablePaths($child));
            }
        }

        return $paths;
    }

    /** @param array<string,mixed> $node */
    private function staticText(array $node): string
    {
        $text = ($node['type'] ?? null) === 'text' ? (string) ($node['text'] ?? '') : '';
        foreach (($node['content'] ?? []) as $child) {
            if (is_array($child)) {
                $text .= ' '.$this->staticText($child);
            }
        }

        return trim($text);
    }

    /** @param array<string,mixed> $node @return array<string,mixed>|null */
    private function findVariableNode(array $node, string $path): ?array
    {
        if (($node['type'] ?? null) === 'variable' && trim((string) data_get($node, 'attrs.path', '')) === $path) {
            return $node;
        }
        foreach (($node['content'] ?? []) as $child) {
            if (! is_array($child)) {
                continue;
            }
            $found = $this->findVariableNode($child, $path);
            if ($found !== null) {
                return $found;
            }
        }

        return null;
    }

    /** @param array<string,mixed> $node @return array<string,mixed> */
    private function normalizeNode(array $node, string $code): array
    {
        if (is_array($node['content'] ?? null)) {
            $node['content'] = array_values(array_map(
                fn (mixed $child): mixed => is_array($child) ? $this->normalizeNode($child, $code) : $child,
                $node['content'],
            ));
        }

        if (($node['type'] ?? null) === 'table') {
            return $this->normalizeTable($node);
        }

        if (($node['type'] ?? null) === 'signatureBlock') {
            $housingProvider = $this->isHousingProviderCode($code);
            $node['attrs'] = [
                ...(is_array($node['attrs'] ?? null) ? $node['attrs'] : []),
                'layout' => 'closing',
                'compact' => ! $housingProvider,
            ];

            if ($housingProvider) {
                $node['attrs'] = [
                    ...$node['attrs'],
                    'leftEnabled' => true,
                    'rightEnabled' => false,
                    'leftLabel' => 'Unterschrift Wohnungsgeber / beauftragte Person',
                    'rightLabel' => '',
                    'leftNamePath' => (string) ($node['attrs']['leftNamePath'] ?? 'organization.signatureName') ?: 'organization.signatureName',
                    'rightNamePath' => '',
                ];
            }
        }

        return $node;
    }

    /** @param array<string,mixed> $table @return array<string,mixed> */
    private function normalizeTable(array $table): array
    {
        $rows = is_array($table['content'] ?? null) ? $table['content'] : [];
        $keyValueTable = $this->isKeyValueTable($rows);

        foreach ($rows as $rowIndex => &$row) {
            if (! is_array($row) || ($row['type'] ?? null) !== 'tableRow') {
                continue;
            }

            $cells = is_array($row['content'] ?? null) ? $row['content'] : [];
            foreach ($cells as $cellIndex => &$cell) {
                if (! is_array($cell) || ! in_array(($cell['type'] ?? null), ['tableCell', 'tableHeader'], true)) {
                    continue;
                }

                $cell['type'] = $keyValueTable
                    ? ($cellIndex === 0 ? 'tableHeader' : 'tableCell')
                    : ($rowIndex === 0 ? 'tableHeader' : 'tableCell');
                $attrs = is_array($cell['attrs'] ?? null) ? $cell['attrs'] : [];
                $cell['attrs'] = [
                    ...$attrs,
                    'colspan' => max(1, (int) ($attrs['colspan'] ?? 1)),
                    'rowspan' => max(1, (int) ($attrs['rowspan'] ?? 1)),
                ];

                if (! is_array($cell['content'] ?? null) || $cell['content'] === []) {
                    $cell['content'] = [['type' => 'paragraph', 'content' => []]];
                }
            }
            unset($cell);
            $row['content'] = $cells;
        }
        unset($row);

        $table['content'] = $rows;

        return $table;
    }

    /** @param array<int,mixed> $rows */
    private function isKeyValueTable(array $rows): bool
    {
        if ($rows === []) {
            return false;
        }

        foreach ($rows as $row) {
            if (! is_array($row) || ($row['type'] ?? null) !== 'tableRow') {
                return false;
            }

            $cells = is_array($row['content'] ?? null) ? array_values($row['content']) : [];
            if (count($cells) < 2 || ! is_array($cells[0]) || ($cells[0]['type'] ?? null) !== 'tableHeader') {
                return false;
            }

            foreach (array_slice($cells, 1) as $cell) {
                if (! is_array($cell) || ($cell['type'] ?? null) !== 'tableCell') {
                    return false;
                }
            }
        }

        return true;
    }

    private function isModernLegalCode(string $code): bool
    {
        return in_array($code, self::MODERN_LEGAL_CODES, true);
    }

    private function isHousingProviderCode(string $code): bool
    {
        return $code === 'housing-provider-confirmation-residential';
    }
}
