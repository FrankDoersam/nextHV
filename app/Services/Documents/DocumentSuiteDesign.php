<?php

namespace App\Services\Documents;

use App\Models\DocumentTemplate;
use Illuminate\Support\Facades\File;

/** Shared Canvas Editor design contract for every configurable document report. */
final class DocumentSuiteDesign
{
    public const VERSION = 21;

    public const SUITE_CODES = [
        'lease-contract-residential-source',
        'lease-contract-garage-source',
        'privacy-notice-residential',
        'house-rules-residential',
        'handover-protocol-residential-source',
        'return-protocol-residential-source',
        'housing-provider-confirmation-residential',
    ];

    public function style(DocumentTemplate $template): array
    {
        return $this->styleFor(is_array($template->style) ? $template->style : [], (string) $template->code, (string) $template->document_type);
    }

    public function styleFor(array $style, string $code, string $documentType = ''): array
    {
        $defaults = [
            'engine' => 'canvas-editor',
            'editorSchemaVersion' => self::VERSION,
            'reportWorkspaceVersion' => self::VERSION,
            'layoutProfile' => 'canvas-document-suite',
            'documentSuiteTheme' => 'enterprise-contract-gray',
            'headingTreatment' => 'enterprise-section-band',
            'pageSize' => 'A4',
            'orientation' => 'portrait',
            'fontFamily' => 'Arial',
            'marginLeft' => 25.0, 'marginRight' => 20.0, 'marginTop' => 20.0, 'marginBottom' => 20.0,
            'fontSize' => 9.8, 'lineHeight' => 4.0, 'paragraphGap' => 0.7,
            'bodyTextAlign' => 'justify', 'tableTextAlign' => 'left',
            'h1FontSize' => 15.0, 'h1LineHeight' => 5.4, 'h1GapBefore' => 0.0, 'h1GapAfter' => 1.8, 'h1TextAlign' => 'right',
            'h2FontSize' => 10.0, 'h2LineHeight' => 4.0, 'h2GapBefore' => 1.6, 'h2GapAfter' => 0.3,
            'h3FontSize' => 9.5, 'h3LineHeight' => 4.0, 'h3GapBefore' => 1.4, 'h3GapAfter' => 0.3,
            'headingTextColor' => '20262A', 'headingAccentColor' => '3A454C', 'headingRuleColor' => 'AAB1B6',
            'sectionBandFill' => 'D9DDE0', 'sectionBandTextColor' => '20262A', 'sectionBandBorderColor' => 'AAB1B6',
            'sectionBandBorderWidth' => 0.65, 'sectionBandMinHeight' => 6.4,
            'subsectionBandFill' => 'ECEEEF', 'subsectionBandTextColor' => '2C3236',
            'horizontalRuleColor' => 'AAB1B6', 'horizontalRuleGapBefore' => 0.8, 'horizontalRuleGapAfter' => 1.0, 'horizontalRuleLineWidth' => 0.65,
            'tableGap' => 0.6,
            'tableHeaderFill' => 'D9DDE0', 'tableHeaderTextColor' => '20262A', 'tableBorderColor' => 'AAB1B6',
            'tableBorderWidth' => 0.65, 'tableBodyTextColor' => '292F33', 'tableRowAlternateFill' => 'F8F9FA', 'tableAlternateRows' => true,
            'tableCellPaddingX' => 1.8, 'tableCellPaddingY' => 1.0, 'tableMinRowHeight' => 6.6,
            'footerPageNumber' => true, 'footerPageNumberAlign' => 'right', 'footerPageNumberFormat' => 'Seite {pageNo} / {pageCount}',
            'footerFontSize' => 6.8, 'footerTextColor' => '6F767B', 'pageNumberOffset' => 7.5,
            'pageHeaderText' => '', 'pageHeaderAlign' => 'right', 'pageHeaderOffset' => 6.5, 'pageHeaderFontSize' => 7.5,
            'pageFooterText' => '', 'pageFooterAlign' => 'left', 'pageFooterOffset' => 9.0, 'pageFooterFontSize' => 6.8,
            'visualContrastVersion' => self::VERSION,
        ];

        $profile = $this->suiteLayoutProfile($code);

        $functional = match ($code) {
            'lease-contract-residential-source' => ['sourceLayout' => 'canvas-residential-lease-v1', 'residentialLeaseContentVersion' => 14, 'contractLegalReviewVersion' => 13],
            'lease-contract-garage-source' => ['sourceLayout' => 'canvas-garage-lease-v1', 'garageLeaseContentVersion' => 12, 'contractLegalReviewVersion' => 13],
            'privacy-notice-residential' => ['sourceLayout' => 'canvas-privacy-v1', 'privacyLayoutVersion' => 11, 'privacyLegalReviewVersion' => 13],
            'house-rules-residential' => ['sourceLayout' => 'canvas-house-rules-v5', 'houseRulesLayoutVersion' => 17, 'houseRulesLegalReviewVersion' => 17],
            'handover-protocol-residential-source' => ['sourceLayout' => 'canvas-move-in-inspection-v1', 'handoverLayoutVersion' => 13, 'handoverLegalReviewVersion' => 12],
            'return-protocol-residential-source' => ['sourceLayout' => 'canvas-move-out-inspection-v1', 'handoverLayoutVersion' => 13, 'handoverLegalReviewVersion' => 12],
            'housing-provider-confirmation-residential' => [
                'sourceLayout' => 'canvas-bmg-19', 'housingProviderLayoutVersion' => 0, 'housingProviderLegalReviewVersion' => 0,
                'officialForm' => false, 'officialFormLockedGeometry' => false, 'officialFormBackgroundImage' => false,
                'optionalPlaceholders' => array_values(array_unique([...data_get($style, 'optionalPlaceholders', []), 'organization.representedBy', 'inputs.housing.ownerName'])),
            ],
            default => [],
        };

        return [
            ...$defaults,
            ...$profile,
            ...$style,
            ...$functional,
            'engine' => 'canvas-editor',
            'editorSchemaVersion' => self::VERSION,
            'reportWorkspaceVersion' => self::VERSION,
            'documentSuiteDesignVersion' => self::VERSION,
            'documentSuiteLayoutVersion' => self::VERSION,
            'visualContrastVersion' => self::VERSION,
        ];
    }

    /**
     * Canonical layout values used by migrations when a built-in report is
     * intentionally moved to a new visual baseline. Normal editor reads still
     * allow stored user style overrides to win in styleFor().
     */
    public function suiteLayoutProfile(string $code): array
    {
        $professional = [
            'layoutProfile' => 'document-suite-enterprise-contract-v2',
            'documentSuiteTheme' => 'enterprise-contract-gray',
            'headingTreatment' => 'enterprise-section-band',
            'marginLeft' => 25.0, 'marginRight' => 20.0, 'marginTop' => 20.0, 'marginBottom' => 20.0,
            'fontSize' => 9.8, 'lineHeight' => 4.0, 'paragraphGap' => 0.7,
            'bodyTextAlign' => 'justify', 'tableTextAlign' => 'left',
            'h1FontSize' => 15.0, 'h1LineHeight' => 5.4, 'h1GapBefore' => 0.0, 'h1GapAfter' => 1.8, 'h1TextAlign' => 'right',
            'h2FontSize' => 10.0, 'h2LineHeight' => 4.0, 'h2GapBefore' => 1.6, 'h2GapAfter' => 0.3,
            'h3FontSize' => 9.5, 'h3LineHeight' => 4.0, 'h3GapBefore' => 1.4, 'h3GapAfter' => 0.3,
            'headingTextColor' => '20262A', 'headingAccentColor' => '3A454C', 'headingRuleColor' => 'AAB1B6',
            'sectionBandFill' => 'D9DDE0', 'sectionBandTextColor' => '20262A', 'sectionBandBorderColor' => 'AAB1B6',
            'sectionBandBorderWidth' => 0.65, 'sectionBandMinHeight' => 6.4,
            'subsectionBandFill' => 'ECEEEF', 'subsectionBandTextColor' => '2C3236',
            'horizontalRuleColor' => 'AAB1B6', 'horizontalRuleLineWidth' => 0.65,
            'horizontalRuleGapBefore' => 0.8, 'horizontalRuleGapAfter' => 1.0,
            'tableGap' => 0.6,
            'tableHeaderFill' => 'D9DDE0', 'tableHeaderTextColor' => '20262A', 'tableBorderColor' => 'AAB1B6',
            'tableBorderWidth' => 0.65, 'tableBodyTextColor' => '292F33', 'tableRowAlternateFill' => 'F8F9FA', 'tableAlternateRows' => true,
            'tableCellPaddingX' => 1.8, 'tableCellPaddingY' => 1.0, 'tableMinRowHeight' => 6.6,
            'pageHeaderText' => '', 'pageFooterText' => '',
            'footerPageNumber' => true, 'footerPageNumberAlign' => 'right', 'footerPageNumberFormat' => 'Seite {pageNo} / {pageCount}',
            'footerFontSize' => 6.8, 'footerTextColor' => '6F767B', 'pageNumberOffset' => 7.5,
            'visualContrastVersion' => self::VERSION,
        ];

        return match ($code) {
            'lease-contract-residential-source',
            'lease-contract-garage-source',
            'privacy-notice-residential' => $professional,
            'handover-protocol-residential-source',
            'return-protocol-residential-source',
            'housing-provider-confirmation-residential' => [
                ...$professional,
                'layoutProfile' => 'document-suite-enterprise-form-v2',
                'bodyTextAlign' => 'left',
            ],
            'house-rules-residential' => [
                ...$professional,
                'layoutProfile' => 'document-suite-house-rules-enterprise-v3',
                'bodyTextAlign' => 'left',
                'h1TextAlign' => 'left',
            ],
            default => [],
        };
    }

    /**
     * Converts historical semantic/editor trees on read. Canvas elements are
     * returned with the current suite visual baseline while their textual data
     * remains untouched.
     */
    public function upgradeBlocks(array $blocks, string $code, bool $ensureDocumentHeading = true): array
    {
        $style = $this->styleFor([], $code);
        $converted = (new CanvasDocumentConverter())->convert($blocks, $style);

        return $this->refineEnterpriseBlocks($converted, $style);
    }

    public function canonicalBlocks(string $code): array
    {
        $structured = match ($code) {
            'lease-contract-residential-source' => (new ResidentialLeaseDocumentBuilder())->build(),
            'lease-contract-garage-source' => (new GarageLeaseDocumentBuilder())->build(),
            'privacy-notice-residential' => (new PrivacyNoticeDocumentBuilder())->build(),
            'house-rules-residential' => (new HouseRulesDocumentBuilder())->build(),
            'handover-protocol-residential-source' => (new HandoverProtocolDocumentBuilder())->build(),
            'return-protocol-residential-source' => (new ReturnProtocolDocumentBuilder())->build(),
            'housing-provider-confirmation-residential' => (new HousingProviderConfirmationDocumentBuilder())->build(),
            default => null,
        };

        if (is_array($structured)) return $this->upgradeBlocks($structured, $code);

        $definition = $this->definition($code);
        if ($definition === []) return [];
        $source = is_array($definition['editorBlocks'] ?? null)
            ? $definition['editorBlocks']
            : (is_array($definition['blocks'] ?? null) ? $definition['blocks'] : []);
        $style = $this->styleFor(is_array($definition['style'] ?? null) ? $definition['style'] : [], $code, (string) ($definition['documentType'] ?? ''));
        $converted = (new CanvasDocumentConverter())->convert($source, $style);

        return $this->refineEnterpriseBlocks($converted, $style);
    }

    public function canonicalPrivacyBlocks(): array { return $this->canonicalBlocks('privacy-notice-residential'); }

    /** @param array<int, array<string, mixed>> $blocks */
    private function refineEnterpriseBlocks(array $blocks, array $style): array
    {
        $refined = [];
        $skipStandaloneNewline = false;

        foreach ($blocks as $block) {
            if (! is_array($block)) continue;

            if ($skipStandaloneNewline && $this->isStandaloneNewline($block)) {
                $skipStandaloneNewline = false;
                continue;
            }
            $skipStandaloneNewline = false;

            if (($block['type'] ?? null) === 'title') {
                $level = (string) ($block['level'] ?? 'second');
                if (in_array($level, ['second', 'third'], true) && ($style['headingTreatment'] ?? null) === 'enterprise-section-band') {
                    $refined[] = $this->sectionBandFromTitle($block, $style, $level);
                    $skipStandaloneNewline = true;
                    continue;
                }

                $color = '#'.ltrim((string) ($style['headingTextColor'] ?? '20262A'), '#');
                foreach (($block['valueList'] ?? []) as $index => $value) {
                    if (! is_array($value)) continue;
                    $block['valueList'][$index]['bold'] = true;
                    $block['valueList'][$index]['color'] = $color;
                }
                if (isset($block['valueList'][0]) && is_array($block['valueList'][0])) {
                    $block['valueList'][0]['rowFlex'] = (string) ($style['h1TextAlign'] ?? 'right');
                }
            }

            if (($block['type'] ?? null) === 'separator') {
                $block['color'] = '#'.ltrim((string) ($style['horizontalRuleColor'] ?? 'AAB1B6'), '#');
                $block['lineWidth'] = max(0.35, (float) ($style['horizontalRuleLineWidth'] ?? 0.65));
            }

            if (($block['type'] ?? null) === 'table') {
                $block = $this->refineEnterpriseTable($block, $style);
            }

            $refined[] = $block;
        }

        return $refined;
    }

    /** @param array<string, mixed> $block */
    private function isStandaloneNewline(array $block): bool
    {
        return ! isset($block['type']) && ($block['value'] ?? null) === "\n" && count($block) === 1;
    }

    /** @param array<string, mixed> $title */
    private function sectionBandFromTitle(array $title, array $style, string $level): array
    {
        $secondary = $level === 'third';
        $fill = '#'.ltrim((string) ($style[$secondary ? 'subsectionBandFill' : 'sectionBandFill'] ?? ($secondary ? 'ECEEEF' : 'D9DDE0')), '#');
        $textColor = '#'.ltrim((string) ($style[$secondary ? 'subsectionBandTextColor' : 'sectionBandTextColor'] ?? '20262A'), '#');
        $borderColor = '#'.ltrim((string) ($style['sectionBandBorderColor'] ?? 'AAB1B6'), '#');
        $height = max(24.0, (float) ($style['sectionBandMinHeight'] ?? 6.4) * (96 / 25.4));
        $fontSize = (float) ($style[$secondary ? 'h3FontSize' : 'h2FontSize'] ?? ($secondary ? 9.5 : 10.0)) * 96 / 72;
        $valueList = is_array($title['valueList'] ?? null) ? $title['valueList'] : [];

        foreach ($valueList as $index => $value) {
            if (! is_array($value)) continue;
            $valueList[$index]['bold'] = true;
            $valueList[$index]['color'] = $textColor;
            $valueList[$index]['size'] = $fontSize;
        }
        if (isset($valueList[0]) && is_array($valueList[0])) $valueList[0]['rowFlex'] = 'left';

        return [
            'type' => 'table', 'value' => '', 'borderType' => 'all',
            'borderColor' => $borderColor,
            'borderWidth' => max(0.5, (float) ($style['sectionBandBorderWidth'] ?? 0.65)),
            'colgroup' => [['width' => (new CanvasDocumentConverter())->contentWidth($style)]],
            'trList' => [[
                'height' => $height, 'minHeight' => $height,
                'tdList' => [[
                    'colspan' => 1, 'rowspan' => 1, 'verticalAlign' => 'top',
                    'backgroundColor' => $fill,
                    'value' => $valueList !== [] ? $valueList : [['value' => '', 'bold' => true, 'color' => $textColor, 'rowFlex' => 'left']],
                ]],
            ]],
            'extension' => ['s4v2' => ['kind' => 'sectionBand', 'level' => $level]],
        ];
    }

    /** @param array<string, mixed> $table */
    private function refineEnterpriseTable(array $table, array $style): array
    {
        $kind = (string) ($table['extension']['s4v2']['kind'] ?? '');
        if ($kind === 'sectionBand') return $table;

        if ($kind !== 'signatureBlock') {
            $table['borderColor'] = '#'.ltrim((string) ($style['tableBorderColor'] ?? 'AAB1B6'), '#');
            $table['borderWidth'] = max(0.5, (float) ($style['tableBorderWidth'] ?? 0.65));
        }

        $headerFill = '#'.ltrim((string) ($style['tableHeaderFill'] ?? 'D9DDE0'), '#');
        $headerText = '#'.ltrim((string) ($style['tableHeaderTextColor'] ?? '20262A'), '#');
        $bodyText = '#'.ltrim((string) ($style['tableBodyTextColor'] ?? '292F33'), '#');
        $alternateFill = '#'.ltrim((string) ($style['tableRowAlternateFill'] ?? 'F8F9FA'), '#');
        $alternateRows = (bool) ($style['tableAlternateRows'] ?? false);

        foreach (($table['trList'] ?? []) as $rowIndex => $row) {
            if (! is_array($row)) continue;
            foreach (($row['tdList'] ?? []) as $cellIndex => $cell) {
                if (! is_array($cell)) continue;
                if ($kind === 'signatureBlock') {
                    foreach (($cell['value'] ?? []) as $valueIndex => $value) {
                        if (! is_array($value)) continue;
                        if (($value['value'] ?? '') !== '') $table['trList'][$rowIndex]['tdList'][$cellIndex]['value'][$valueIndex]['color'] ??= '#4B5358';
                    }
                    continue;
                }

                $originalFill = strtoupper(ltrim((string) ($cell['backgroundColor'] ?? ''), '#'));
                $isHeader = $kind === 'relationTable'
                    ? $rowIndex === 0
                    : ! in_array($originalFill, ['', 'FFFFFF', 'FFF', 'F8F9FA'], true);
                $table['trList'][$rowIndex]['tdList'][$cellIndex]['backgroundColor'] = $isHeader
                    ? $headerFill
                    : ($alternateRows && $rowIndex % 2 === 1 ? $alternateFill : '#FFFFFF');

                foreach (($cell['value'] ?? []) as $valueIndex => $value) {
                    if (! is_array($value)) continue;
                    if (($value['value'] ?? '') === "\n") continue;
                    $table['trList'][$rowIndex]['tdList'][$cellIndex]['value'][$valueIndex]['color'] = $isHeader ? $headerText : $bodyText;
                    if ($isHeader) $table['trList'][$rowIndex]['tdList'][$cellIndex]['value'][$valueIndex]['bold'] = true;
                }
            }
        }

        return $table;
    }

    private function definition(string $code): array
    {
        $directory = database_path('seeders/data/document-templates');
        $direct = $directory.DIRECTORY_SEPARATOR.$code.'.json';
        if (File::exists($direct)) $json = File::get($direct);
        else {
            $parts = collect(File::files($directory))->filter(fn ($file): bool => str_starts_with($file->getFilename(), $code.'.json.part'))->sortBy(fn ($file): string => $file->getFilename())->values();
            if ($parts->isEmpty()) return [];
            $json = $parts->map(fn ($file): string => File::get($file->getPathname()))->implode('');
        }
        $definition = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
        return is_array($definition) ? $definition : [];
    }
}
