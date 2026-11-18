<?php

namespace App\Reports\Concerns;

use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

trait OperatingCostStatementPdfTables
{
    private function summaryTable(string $title, array $rows): void
    {
        $this->summaryHeader($title);
        $x = self::LEFT;
        $amountX = $x + self::CONTENT_W - self::AMOUNT_W;
        foreach ($rows as $row) {
            $this->ensureSpace(10.0, fn () => $this->summaryHeader($title));
            $rowY = $this->GetY();
            $isResult = ($row['isResult'] ?? false) === true;
            if ($isResult) {
                // One highlighted total row, aligned with the same amount column
                // instead of a second multi-line "Abrechnungsergebnis" box.
                $this->setFill(self::HEADER_FILL_RGB);
                $this->Rect($x, $rowY, self::CONTENT_W, 10.0, 'F');
            }
            $this->SetXY($x + 3, $rowY + ($isResult ? 2.9 : 1.8));
            $this->font('B', $isResult ? 10.0 : 8.8);
            $this->Cell(120, 3.7, $this->encode((string) $row['title']), 0, 2);
            if (! $isResult) {
                $this->font('', 7.8, self::SUBLINE_RGB);
                $this->Cell(120, 3.3, $this->encode((string) ($row['subtitle'] ?? '')), 0, 0);
            }
            $this->SetXY($amountX, $rowY + ($isResult ? 2.9 : 2));
            $this->font('B', $isResult ? 10.0 : 8.8);
            $this->Cell(self::AMOUNT_W - 3, 4, $this->encode($this->money((float) $row['price'])), 0, 0, 'R');
            $this->drawRule($rowY + 10);
            $this->SetY($rowY + 10);
        }
        $this->SetY($this->GetY() + 2);
    }

    private function summaryHeader(string $title): void
    {
        $this->ensureSpace(19.0);
        $y = $this->GetY() + 1.0;
        $this->setFill(self::HEADER_FILL_RGB);
        $this->Rect(self::LEFT, $y, self::CONTENT_W, 8, 'F');
        $this->SetXY(self::LEFT + self::CELL_PAD_X, $y + 2);
        $this->font('B', 10);
        $this->Cell(self::CONTENT_W - 6, 4, $this->encode($title));
        $this->drawRule($y + 8);
        $this->SetY($y + 8);
    }

    private function positionHeader(string $left, string $right): void
    {
        $this->ensureSpace(8);
        $y = $this->GetY();
        $leftW = self::CONTENT_W - self::AMOUNT_W;
        $this->setFill(self::HEADER_FILL_RGB);
        $this->Rect(self::LEFT, $y, self::CONTENT_W, 8, 'F');
        $this->SetXY(self::LEFT + 3, $y + 2);
        $this->font('B', 8.8);
        $this->Cell($leftW - 6, 4, $this->encode($left));
        $this->SetXY(self::LEFT + $leftW, $y + 2);
        $this->Cell(self::AMOUNT_W - 3, 4, $this->encode($right), 0, 0, 'R');
        $this->drawRule($y + 8);
        $this->SetY($y + 8);
    }

    private function positionRow(string $title, string $subtitle, float $amount): void
    {
        $leftW = self::CONTENT_W - self::AMOUNT_W;
        $titleLines = $this->wrap($title, $leftW - 7, 8.6);
        $subLines = $subtitle !== '' ? $this->wrap($subtitle, $leftW - 7, 7.8) : [];
        $lines = [
            ...array_map(fn (string $text): array => ['text' => $text, 'title' => true, 'height' => 3.6], $titleLines),
            ...array_map(fn (string $text): array => ['text' => $text, 'title' => false, 'height' => 3.4], $subLines),
        ];
        $height = max(8.5, 4 + array_sum(array_column($lines, 'height')));
        $pageCapacity = $this->pageBottom - self::DETAIL_BODY_TOP - 18.0;
        $this->ensureSpace(min($height, max(8.5, $pageCapacity)), fn () => $this->positionHeader('Position', 'Betrag'));
        $index = 0;
        $firstPart = true;
        while ($index < count($lines)) {
            $this->ensureSpace(8.5, fn () => $this->positionHeader('Position (Fortsetzung)', 'Betrag'));
            $y = $this->GetY();
            $cursor = $y + 2.0;
            while ($index < count($lines) && $cursor + $lines[$index]['height'] + 2.0 <= $this->pageBottom) {
                $line = $lines[$index++];
                $this->SetXY(self::LEFT + 3, $cursor);
                $this->font($line['title'] ? 'B' : '', $line['title'] ? 8.6 : 7.8, $line['title'] ? [0, 0, 0] : self::SUBLINE_RGB);
                $this->Cell($leftW - 7, $line['height'], $this->encode($line['text']), 0, 2);
                $cursor += $line['height'];
            }
            if ($firstPart) {
                $this->SetXY(self::LEFT + $leftW, $y + 2);
                $this->font('B', 8.6);
                $this->Cell(self::AMOUNT_W - 3, 4, $this->encode($this->money($amount)), 0, 0, 'R');
            }
            $bottom = max($y + 8.5, $cursor + 2.0);
            $this->drawRule($bottom);
            $this->SetY($bottom);
            $firstPart = false;
        }
    }

    private function positionTotal(string $title, float $amount): void
    {
        $this->ensureSpace(8);
        $y = $this->GetY();
        $leftW = self::CONTENT_W - self::AMOUNT_W;
        $this->setFill(self::HEADER_FILL_RGB);
        $this->Rect(self::LEFT, $y, self::CONTENT_W, 8, 'F');
        $this->drawRule($y);
        $this->SetXY(self::LEFT + 3, $y + 2);
        $this->font('B', 9);
        $this->Cell($leftW - 6, 4, $this->encode($title));
        $this->SetXY(self::LEFT + $leftW, $y + 2);
        $this->Cell(self::AMOUNT_W - 3, 4, $this->encode($this->money($amount)), 0, 0, 'R');
        $this->drawRule($y + 8);
        $this->SetY($y + 8);
    }

    private function groupedCostBlock(string $title, Collection $rows): void
    {
        $this->sectionCaption($title);
        $this->positionHeader('Position', 'Betrag');
        if ($rows->isEmpty()) {
            $this->positionRow('Keine Positionen vorhanden', '', 0);
            return;
        }
        foreach ($rows as $row) {
            $row = (array) $row;
            $this->positionRow((string) ($row['label'] ?? 'Kosten'), $this->costSubtitle($row), (float) ($row['allocatedAmount'] ?? 0));
        }
    }

    private function tableSection(string $title, array $columns, array $rows, bool $firstColumnBold = true): void
    {
        $columns = $this->fitTableColumns($columns);
        $this->sectionCaption($title);
        $this->tableHeader($columns);
        if ($rows === []) $rows = [$this->emptyTableRow($columns)];
        foreach ($rows as $row) $this->tableRow($columns, $row, $firstColumnBold);
        $this->Ln(3.5);
    }

    private function fitTableColumns(array $columns): array
    {
        $total = array_sum(array_map(fn (array $column): float => (float) ($column['width'] ?? 0), $columns));
        if ($total <= 0 || $columns === []) return $columns;

        $fitted = [];
        $used = 0.0;
        $lastIndex = array_key_last($columns);
        foreach ($columns as $index => $column) {
            $width = $index === $lastIndex
                ? self::CONTENT_W - $used
                : round(((float) ($column['width'] ?? 0) / $total) * self::CONTENT_W, 2);
            $fitted[] = [...$column, 'width' => $width];
            $used += $width;
        }

        return $fitted;
    }

    private function emptyTableRow(array $columns): array
    {
        return array_map(function (array $column, int $index): string {
            if ($index === 0) return 'Keine Positionen vorhanden';
            $label = mb_strtolower((string) ($column['label'] ?? ''));

            return $this->containsAny($label, ['gesamtkosten', 'gesamt betrag', 'kostenanteil', 'mein anteil', 'betrag brutto'])
                ? $this->money(0)
                : '-';
        }, $columns, array_keys($columns));
    }

    private function tableHeader(array $columns): void
    {
        $maxLines = 1;
        foreach ($columns as $column) {
            $maxLines = max(
                $maxLines,
                $this->multiCellLineCount(
                    (string) ($column['label'] ?? ''),
                    max(1.0, (float) ($column['width'] ?? 0) - 4.0),
                    7.4,
                ),
            );
        }

        $height = max(8.5, 3.0 + $maxLines * 3.0);
        $this->ensureSpace($height);
        $x = self::LEFT;
        $y = $this->GetY();
        $this->setFill(self::HEADER_FILL_RGB);
        foreach ($columns as $column) {
            $width = (float) $column['width'];
            $this->Rect($x, $y, $width, $height, 'F');
            $label = (string) ($column['label'] ?? '');
            $align = (string) ($column['align'] ?? 'L');

            if ($this->isMeterMetadataHeader($label)) {
                $this->renderMeterMetadataHeader($x, $y, $width, $label, $align);
            } else {
                $this->SetXY($x + 2, $y + 1.5);
                $this->font('B', 7.4);
                $this->MultiCell($width - 4, 3.0, $this->encode($label), 0, $align);
            }
            $x += $width;
        }
        $this->drawRule($y + $height);
        $this->SetY($y + $height);
    }

    private function tableRow(array $columns, array $values, bool $firstColumnBold = true): void
    {
        $height = 9.0;
        foreach ($values as $index => $value) {
            $cellWidth = max(1.0, (float) ($columns[$index]['width'] ?? 0) - 4.0);
            $label = (string) ($columns[$index]['label'] ?? '');
            if (is_array($value) && array_key_exists('primary', $value)) {
                $primary = (string) $value['primary'];
                $secondary = (string) ($value['secondary'] ?? '');
                $primaryLines = $this->multiCellLineCount($primary, $cellWidth, 7.4);
                $secondaryLines = $secondary !== '' ? $this->multiCellLineCount($secondary, $cellWidth, 7.0) : 0;
                $height = max($height, $primaryLines * 3.3 + $secondaryLines * 3.1 + 3.0);
                continue;
            }
            $lineCount = $this->isMeterMetadataHeader($label)
                ? count($this->meterMetadataCellLines((string) $value, $label, $cellWidth))
                : $this->multiCellLineCount((string) $value, $cellWidth, 7.4);
            $height = max($height, $lineCount * 3.3 + 3.0);
        }
        $this->ensureSpace($height, fn () => $this->tableHeader($columns));
        $x = self::LEFT;
        $y = $this->GetY();
        foreach ($columns as $index => $column) {
            $width = (float) $column['width'];
            $label = (string) ($column['label'] ?? '');
            $align = (string) ($column['align'] ?? 'L');

            $value = $values[$index] ?? '';
            if (is_array($value) && array_key_exists('primary', $value)) {
                // A bold main label plus visually subordinate bookkeeping references.
                $this->SetXY($x + 2, $y + 1.5);
                $this->font('B', 7.4);
                $this->MultiCell($width - 4, 3.3, $this->encode((string) $value['primary']), 0, $align);
                $secondary = (string) ($value['secondary'] ?? '');
                if ($secondary !== '') {
                    $this->SetX($x + 2);
                    $this->font('', 7.0, self::SUBLINE_RGB);
                    $this->MultiCell($width - 4, 3.1, $this->encode($secondary), 0, $align);
                }
            } elseif ($this->isMeterMetadataHeader($label)) {
                $this->renderMeterMetadataCell(
                    $x,
                    $y,
                    $width,
                    (string) $value,
                    $label,
                    $align,
                );
            } else {
                $this->SetXY($x + 2, $y + 1.5);
                $this->font($index === 0 && $firstColumnBold ? 'B' : '', 7.4);
                $this->MultiCell(
                    $width - 4,
                    3.3,
                    $this->encode((string) $value),
                    0,
                    $align,
                );
            }
            $x += $width;
        }
        $this->drawRule($y + $height);
        $this->SetY($y + $height);
    }

    private function isMeterMetadataHeader(string $label): bool
    {
        return str_contains($label, 'Installationsort') || str_contains($label, 'Standort')
            || str_contains($label, 'Kommentar') || str_contains($label, 'Hinweis');
    }

    private function renderMeterMetadataHeader(float $x, float $y, float $width, string $label, string $align): void
    {
        $cursorY = $y + 1.5;
        foreach (preg_split('/\R/u', $label) ?: [$label] as $line) {
            $secondary = in_array(trim($line, " \t/"), ['Installationsort', 'Standort', 'Kommentar', 'Hinweis'], true);
            $this->SetXY($x + 2, $cursorY);
            $this->font('B', 7.4, $secondary ? self::SUBLINE_RGB : [0, 0, 0]);
            $this->Cell($width - 4, 3.0, $this->encode($line), 0, 0, $align);
            $cursorY += 3.0;
        }
    }

    /** @return array<int,array{text:string,secondary:bool,bold:bool}> */
    private function meterMetadataCellLines(string $value, string $label, float $width): array
    {
        $sourceLines = preg_split('/\R/u', trim($value)) ?: [];
        if ($sourceLines === []) $sourceLines = ['-'];
        $locationColumn = str_contains($label, 'Installationsort') || str_contains($label, 'Standort');
        $commentColumn = str_contains($label, 'Kommentar') || str_contains($label, 'Hinweis');
        $result = [];

        foreach ($sourceLines as $index => $sourceLine) {
            $secondary = ($locationColumn && $index >= 1) || ($commentColumn && $index >= 2);
            $bold = $locationColumn && $index === 0;
            foreach ($this->wrap($sourceLine, max(1.0, $width), 7.4) as $wrapped) {
                $result[] = ['text' => $wrapped, 'secondary' => $secondary, 'bold' => $bold];
            }
        }

        return $result ?: [['text' => '-', 'secondary' => false, 'bold' => $locationColumn]];
    }

    private function renderMeterMetadataCell(float $x, float $y, float $width, string $value, string $label, string $align): void
    {
        $cursorY = $y + 1.5;
        foreach ($this->meterMetadataCellLines($value, $label, max(1.0, $width - 4)) as $line) {
            $this->SetXY($x + 2, $cursorY);
            $this->font(
                $line['bold'] ? 'B' : '',
                7.4,
                $line['secondary'] ? self::SUBLINE_RGB : [0, 0, 0],
            );
            $this->Cell($width - 4, 3.3, $this->encode($line['text']), 0, 0, $align);
            $cursorY += 3.3;
        }
    }

    private function multiCellLineCount(string $text, float $width, float $size): int
    {
        $this->font('', $size);
        $encoded = str_replace("\r", '', $this->encode($text));
        $length = strlen($encoded);
        if ($length === 0) return 1;

        $cw = $this->CurrentFont['cw'] ?? [];
        $effectiveWidth = max(0.1, $width - 2 * $this->cMargin);
        $maxWidth = $effectiveWidth * 1000 / max(0.1, $this->FontSize);
        $separator = -1;
        $index = 0;
        $lineStart = 0;
        $lineWidth = 0.0;
        $lines = 1;

        while ($index < $length) {
            $char = $encoded[$index];
            if ($char === "\n") {
                $index++;
                $separator = -1;
                $lineStart = $index;
                $lineWidth = 0.0;
                $lines++;
                continue;
            }
            if ($char === ' ') $separator = $index;
            $lineWidth += (float) ($cw[$char] ?? 0);
            if ($lineWidth > $maxWidth) {
                if ($separator === -1) {
                    if ($index === $lineStart) $index++;
                } else {
                    $index = $separator + 1;
                }
                $separator = -1;
                $lineStart = $index;
                $lineWidth = 0.0;
                $lines++;
            } else {
                $index++;
            }
        }

        if ($length > 0 && $encoded[$length - 1] === "\n") $lines--;

        return max(1, $lines);
    }

    private function allocationBox(string $headline, array $allocation, string $unit): void
    {
        $rows = array_values((array) ($allocation['rows'] ?? []));
        $offset = 0;
        do {
            $this->ensureSpace(26.5);
            $x = self::LEFT + 4;
            $y = $this->GetY();
            $w = self::CONTENT_W - 4;
            $capacity = max(1, (int) floor(($this->pageBottom - $y - 21.0) / 5.5));
            $part = array_slice($rows, $offset, $capacity);
            $height = 18.0 + max(1, count($part)) * 5.5;
            $this->SetDrawColor(210, 210, 210);
            $this->Rect($x, $y, $w, $height);
            $this->SetXY($x + 3, $y + 2.4);
            $this->font('B', 8.6);
            $label = $headline.($offset > 0 ? ' (Fortsetzung)' : '');
            $this->Cell($w - 6, 4, $this->encode($label.': '.$this->number($allocation['total'] ?? 0).' '.$unit.' / '.$this->number($allocation['own'] ?? 0).' '.$unit), 0, 1);
            $cursor = $y + 8;
            foreach ($part as $row) {
                $this->SetXY($x + 3, $cursor);
                $this->font('', 7.8);
                $this->Cell($w - 45, 4, $this->encode((string) ($row['unit'] ?? '-')));
                $this->SetXY($x + $w - 42, $cursor);
                $this->Cell(39, 4, $this->encode($this->number($row['value'] ?? 0).' '.$unit), 0, 0, 'R');
                $cursor += 5.5;
            }
            $this->SetY($y + $height + 3);
            $offset += count($part);
        } while ($offset < count($rows));
    }

    private function simpleInfoBox(array $lines): void
    {
        $wrapped = collect($lines)->flatMap(fn ($line) => $this->wrap((string) $line, self::CONTENT_W - 14, 8.2))->values()->all();
        $offset = 0;
        do {
            $this->ensureSpace(15.1);
            $x = self::LEFT + 4;
            $y = $this->GetY();
            $w = self::CONTENT_W - 4;
            $capacity = max(1, (int) floor(($this->pageBottom - $y - 11.0) / 4.1));
            $part = array_slice($wrapped, $offset, $capacity);
            $height = 8.0 + max(1, count($part)) * 4.1;
            $this->SetDrawColor(210, 210, 210);
            $this->Rect($x, $y, $w, $height);
            $cursor = $y + 3;
            foreach ($part as $line) {
                $this->SetXY($x + 3, $cursor);
                $this->font('', 8.2);
                $this->Cell($w - 6, 4.1, $this->encode('• '.$line));
                $cursor += 4.1;
            }
            $this->SetY($y + $height + 3);
            $offset += count($part);
        } while ($offset < count($wrapped));
    }

    private function sectionCaption(string $title): void
    {
        $this->ensureSpace(10.7);
        if ($this->GetY() > self::DETAIL_BODY_TOP + 12) $this->Ln(3.5);
        $this->font('B', 9.7);
        $this->Cell(self::CONTENT_W, 5, $this->encode($title), 0, 1);
        $this->SetDrawColor(210, 210, 210);
        $this->Line(self::LEFT, $this->GetY() + .4, self::LEFT + self::CONTENT_W, $this->GetY() + .4);
        $this->Ln(2.2);
    }

    private function distributionHeading(string $title): void
    {
        $this->ensureSpace(8);
        $this->font('B', 9, [70, 70, 70]);
        $this->Cell(self::CONTENT_W, 4.8, $this->encode($title), 0, 1);
    }

    private function paragraph(string $text, float $lineHeight = 4.55, float $fontSize = 9.0): void
    {
        foreach ($this->profileWrappedLines(trim($text), self::CONTENT_W, '', $fontSize) as $line) {
            $this->ensureSpace($lineHeight);
            $this->font('', $fontSize);
            $this->SetX(self::LEFT);
            $this->Cell(self::CONTENT_W, $lineHeight, $line, 0, 1);
        }
        $this->Ln(2.0);
    }

    private function normalizeGermanTerms(string $value): string
    {
        $replacements = [
            'Wohnflaeche' => 'Wohnfläche',
            'Wohnflaechen' => 'Wohnflächen',
            'Nutzflaeche' => 'Nutzfläche',
            'Gebaeude' => 'Gebäude',
            'Muell' => 'Müll',
            'Waerme' => 'Wärme',
            'Heizkoerper' => 'Heizkörper',
            'EUR' => '€',
        ];

        return trim(str_replace(array_keys($replacements), array_values($replacements), $value));
    }

    private function ensureSpace(float $height, ?callable $afterBreak = null): void
    {
        if ($this->GetY() + $height <= $this->pageBottom) return;
        $this->detailPage((string) ($this->data['title'] ?? 'Betriebskostenabrechnung'));
        if ($afterBreak) $afterBreak();
        if ($this->GetY() + $height > $this->pageBottom) {
            throw ValidationException::withMessages(['statement' => 'Ein Abrechnungsabschnitt ist zusammen mit den Unternehmensangaben zu umfangreich für eine lesbare PDF-Seite. Bitte prüfen Sie die Angaben; es wurde kein Inhalt gekürzt.']);
        }
    }
}
