<?php

namespace App\Services\Documents;

/**
 * Reusable Canvas signature layouts for compact legal documents.
 *
 * Reports opt in semantically. The component owns the generic rendering for
 * inline forms and contract closings so individual reports never need their
 * own signature renderer or design service.
 */
final class CanvasSignatureBlockComponent
{
    private const LINE = '____________________________';

    public function __construct(
        private readonly CanvasDocumentConverter $converter,
    ) {}

    /**
     * Replace semantic signature blocks that opt into a shared layout while
     * leaving existing or unknown signature blocks untouched.
     *
     * @param array<int, array<string, mixed>> $blocks
     * @return array<int, array<string, mixed>>
     */
    public function apply(array $blocks, array $style = []): array
    {
        return array_values(array_map(function ($block) use ($style): mixed {
            if (! is_array($block)) {
                return $block;
            }

            $semantic = data_get($block, 'extension.s4v2');
            $layout = is_array($semantic) ? (string) ($semantic['layout'] ?? '') : '';

            if (! is_array($semantic)
                || ($semantic['kind'] ?? null) !== 'signatureBlock'
                || ! in_array($layout, ['inline', 'closing'], true)) {
                return $block;
            }

            return $this->render($semantic, $style);
        }, $blocks));
    }

    /** @param array<string, mixed> $semantic @return array<string, mixed> */
    public function render(array $semantic, array $style = []): array
    {
        return ($semantic['layout'] ?? 'inline') === 'closing'
            ? $this->renderClosing($semantic, $style)
            : $this->renderInline($semantic, $style);
    }

    /** @param array<string, mixed> $semantic @return array<string, mixed> */
    private function renderInline(array $semantic, array $style): array
    {
        $parties = $this->parties($semantic);
        $contentWidth = $this->converter->contentWidth($style);
        $columnWidths = $this->inlineColumnWidths($contentWidth, count($parties));
        $compact = (bool) ($semantic['compact'] ?? false);

        $rowHeight = $compact ? 38.0 : 52.0;
        $primarySize = $compact ? 8.2 : 9.0;
        $roleSize = $compact ? 7.2 : 7.9;
        $lineSize = $compact ? 8.4 : 9.0;
        $captionColor = '#62686C';

        $cells = [$this->placeDateCell($semantic, $primarySize, $roleSize, $lineSize, $captionColor, $compact)];
        foreach ($parties as $party) {
            $cells[] = $this->signatureCell($party, $primarySize, $roleSize, $lineSize, $captionColor, $compact);
        }

        return [
            'type' => 'table',
            'value' => '',
            'borderType' => 'empty',
            'colgroup' => array_map(
                static fn (float $width): array => ['width' => $width],
                $columnWidths,
            ),
            'trList' => [[
                'height' => $rowHeight,
                'minHeight' => $rowHeight,
                'tdList' => $cells,
            ]],
            'extension' => ['s4v2' => [
                'kind' => 'signatureComponent',
                'layout' => 'inline',
                'version' => 0,
                'partyCount' => count($parties),
            ]],
        ];
    }

    /**
     * Contract closing layout: place/date is a restrained lead-in above two
     * equal signature fields. The closing deliberately uses tighter spacing
     * and quieter captions than form-style inline signatures.
     *
     * @param array<string, mixed> $semantic
     * @return array<string, mixed>
     */
    private function renderClosing(array $semantic, array $style): array
    {
        $parties = array_map(
            fn (array $party): array => [
                ...$party,
                'label' => $this->closingRoleLabel($party['label']),
            ],
            $this->parties($semantic),
        );
        $contentWidth = $this->converter->contentWidth($style);
        $partyCount = max(1, count($parties));
        $compact = (bool) ($semantic['compact'] ?? false);

        $primarySize = $compact ? 7.9 : 8.8;
        $roleSize = $compact ? 6.2 : 7.0;
        $lineSize = $compact ? 8.0 : 8.8;
        $captionColor = '#747A7E';
        $placeDateHeight = $compact ? 15.0 : 20.0;
        $signatureHeight = $compact ? 30.0 : 40.0;

        $signatureCells = array_map(
            fn (array $party): array => $this->closingSignatureCell(
                $party,
                $primarySize,
                $roleSize,
                $lineSize,
                $captionColor,
                $compact,
            ),
            $parties,
        );

        return [
            'type' => 'table',
            'value' => '',
            'borderType' => 'empty',
            'colgroup' => array_fill(0, $partyCount, ['width' => $contentWidth / $partyCount]),
            'trList' => [
                [
                    'height' => $placeDateHeight,
                    'minHeight' => $placeDateHeight,
                    'tdList' => [[
                        ...$this->closingPlaceDateCell($semantic, $primarySize, $roleSize, $captionColor, $compact),
                        'colspan' => $partyCount,
                    ]],
                ],
                [
                    'height' => $signatureHeight,
                    'minHeight' => $signatureHeight,
                    'tdList' => $signatureCells,
                ],
            ],
            'extension' => ['s4v2' => [
                'kind' => 'signatureComponent',
                'layout' => 'closing',
                'version' => 2,
                'partyCount' => count($parties),
            ]],
        ];
    }

    /** @param array<string, mixed> $semantic @return array<int, array{path:string,label:string}> */
    private function parties(array $semantic): array
    {
        $parties = [];

        if (($semantic['leftEnabled'] ?? true) !== false) {
            $parties[] = [
                'path' => trim((string) ($semantic['leftNamePath'] ?? '')),
                'label' => $this->roleLabel((string) ($semantic['leftLabel'] ?? 'Vermieter / Vertretung')),
            ];
        }

        if (($semantic['rightEnabled'] ?? true) !== false) {
            $parties[] = [
                'path' => trim((string) ($semantic['rightNamePath'] ?? '')),
                'label' => $this->roleLabel((string) ($semantic['rightLabel'] ?? 'Mieter / Mieterin')),
            ];
        }

        return $parties !== [] ? $parties : [['path' => '', 'label' => 'Unterschrift']];
    }

    /** @return array<int, float> */
    private function inlineColumnWidths(float $contentWidth, int $partyCount): array
    {
        if ($partyCount <= 1) {
            return [$contentWidth / 2, $contentWidth / 2];
        }

        $placeDateWidth = $contentWidth * 0.30;
        $signatureWidth = ($contentWidth - $placeDateWidth) / $partyCount;

        return [
            $placeDateWidth,
            ...array_fill(0, $partyCount, $signatureWidth),
        ];
    }

    /** @param array<string, mixed> $semantic @return array<string, mixed> */
    private function placeDateCell(
        array $semantic,
        float $primarySize,
        float $roleSize,
        float $lineSize,
        string $captionColor,
        bool $compact,
    ): array {
        $value = [
            $this->line($lineSize),
            $this->lineToValueBreak($compact),
            ...$this->placeDateValue($semantic, $primarySize, $roleSize, $captionColor, $compact),
        ];

        return $this->cell($value);
    }

    /** @param array<string, mixed> $semantic @return array<string, mixed> */
    private function closingPlaceDateCell(
        array $semantic,
        float $primarySize,
        float $roleSize,
        string $captionColor,
        bool $compact,
    ): array {
        $locationPath = trim((string) ($semantic['locationPath'] ?? 'inputs.signature.location'));
        $datePath = trim((string) ($semantic['datePath'] ?? 'inputs.signature.date'));
        $label = trim((string) ($semantic['placeDateLabel'] ?? 'Ort, Datum')) ?: 'Ort, Datum';
        $value = [];

        if ($locationPath !== '') {
            $value[] = ['value' => '{{'.$locationPath.'}}', 'size' => $primarySize, 'color' => '#343A3E', 'rowFlex' => 'left'];
        }
        if ($locationPath !== '' && $datePath !== '') {
            $value[] = ['value' => ', ', 'size' => $primarySize, 'color' => '#343A3E', 'rowFlex' => 'left'];
        }
        if ($datePath !== '') {
            $value[] = ['value' => '{{'.$datePath.'}}', 'size' => $primarySize, 'color' => '#343A3E', 'rowFlex' => 'left'];
        }
        if ($locationPath === '' && $datePath === '') {
            $value[] = ['value' => ' ', 'size' => $primarySize, 'rowFlex' => 'left'];
        }

        $value[] = $this->closingValueBreak($compact);
        $value[] = ['value' => $label, 'size' => $roleSize, 'color' => $captionColor, 'rowFlex' => 'left'];

        return $this->cell($value);
    }

    /** @param array<string, mixed> $semantic @return array<int, array<string, mixed>> */
    private function placeDateValue(
        array $semantic,
        float $primarySize,
        float $roleSize,
        string $captionColor,
        bool $compact,
    ): array {
        $locationPath = trim((string) ($semantic['locationPath'] ?? 'inputs.signature.location'));
        $datePath = trim((string) ($semantic['datePath'] ?? 'inputs.signature.date'));
        $label = trim((string) ($semantic['placeDateLabel'] ?? 'Ort, Datum')) ?: 'Ort, Datum';
        $value = [];

        if ($locationPath !== '') {
            $value[] = [
                'value' => '{{'.$locationPath.'}}',
                'size' => $primarySize,
                'color' => '#343A3E',
                'rowFlex' => 'left',
            ];
        }
        if ($locationPath !== '' && $datePath !== '') {
            $value[] = [
                'value' => ', ',
                'size' => $primarySize,
                'color' => '#343A3E',
                'rowFlex' => 'left',
            ];
        }
        if ($datePath !== '') {
            $value[] = [
                'value' => '{{'.$datePath.'}}',
                'size' => $primarySize,
                'color' => '#343A3E',
                'rowFlex' => 'left',
            ];
        }
        if ($locationPath === '' && $datePath === '') {
            $value[] = ['value' => ' ', 'size' => $primarySize, 'rowFlex' => 'left'];
        }

        $value[] = $this->valueToRoleBreak($compact);
        $value[] = [
            'value' => $label,
            'size' => $roleSize,
            'color' => $captionColor,
            'rowFlex' => 'left',
        ];

        return $value;
    }

    /** @param array{path:string,label:string} $party @return array<string, mixed> */
    private function signatureCell(
        array $party,
        float $primarySize,
        float $roleSize,
        float $lineSize,
        string $captionColor,
        bool $compact,
    ): array {
        return $this->cell([
            $this->line($lineSize),
            $this->lineToValueBreak($compact),
            [
                'value' => $party['path'] !== '' ? '{{'.$party['path'].'}}' : ' ',
                'size' => $primarySize,
                'color' => '#343A3E',
                'rowFlex' => 'left',
            ],
            $this->valueToRoleBreak($compact),
            [
                'value' => $party['label'],
                'size' => $roleSize,
                'color' => $captionColor,
                'rowFlex' => 'left',
            ],
        ]);
    }

    /** @param array{path:string,label:string} $party @return array<string, mixed> */
    private function closingSignatureCell(
        array $party,
        float $primarySize,
        float $roleSize,
        float $lineSize,
        string $captionColor,
        bool $compact,
    ): array {
        return $this->cell([
            $this->line($lineSize),
            $this->closingLineBreak($compact),
            [
                'value' => $party['path'] !== '' ? '{{'.$party['path'].'}}' : ' ',
                'size' => $primarySize,
                'color' => '#343A3E',
                'rowFlex' => 'left',
            ],
            $this->closingValueBreak($compact),
            [
                'value' => $party['label'],
                'size' => $roleSize,
                'color' => $captionColor,
                'rowFlex' => 'left',
            ],
        ]);
    }

    /** @return array<string, mixed> */
    private function line(float $size): array
    {
        return [
            'value' => self::LINE,
            'size' => $size,
            'color' => '#343A3E',
            'rowFlex' => 'left',
        ];
    }

    /** @return array<string, mixed> */
    private function lineToValueBreak(bool $compact): array
    {
        return ['value' => "\n", 'size' => $compact ? 1.25 : 2.0];
    }

    /** @return array<string, mixed> */
    private function valueToRoleBreak(bool $compact): array
    {
        return ['value' => "\n", 'size' => $compact ? 0.5 : 1.25];
    }

    /** @return array<string, mixed> */
    private function closingLineBreak(bool $compact): array
    {
        return ['value' => "\n", 'size' => $compact ? 0.45 : 0.8];
    }

    /** @return array<string, mixed> */
    private function closingValueBreak(bool $compact): array
    {
        return ['value' => "\n", 'size' => $compact ? 0.2 : 0.5];
    }

    /** @param array<int, array<string, mixed>> $value @return array<string, mixed> */
    private function cell(array $value): array
    {
        return [
            'colspan' => 1,
            'rowspan' => 1,
            'verticalAlign' => 'bottom',
            'value' => $value,
        ];
    }

    private function roleLabel(string $label): string
    {
        $clean = trim((string) preg_replace('/^Unterschrift\s+/ui', '', trim($label)));

        return $clean !== '' ? $clean : 'Unterschrift';
    }

    private function closingRoleLabel(string $label): string
    {
        return match ($label) {
            'Vermieter / Vertretung' => 'Vermieter',
            'Mieter / Mieterin' => 'Mieter',
            default => $label,
        };
    }
}
