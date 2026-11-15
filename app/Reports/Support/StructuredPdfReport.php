<?php

namespace App\Reports\Support;

use Closure;
use Illuminate\Validation\ValidationException;

/** s4v2-style shared typography, measured table rows and safe page breaks. */
abstract class StructuredPdfReport
{
    protected const LEFT = 18.0;

    protected const WIDTH = 174.0;

    protected function document(string $title, string $reference, string $subject): ReportPdfDocument
    {
        $pdf = new ReportPdfDocument($title, $reference);
        $pdf->SetTitle($pdf->encodeText($title.' · '.$reference));
        $pdf->SetSubject($pdf->encodeText($subject));
        $pdf->AddPage();

        return $pdf;
    }

    protected function section(ReportPdfDocument $pdf, string $title): void
    {
        $this->ensure($pdf, 22);
        $pdf->Ln(4);
        $this->paragraph($pdf, $title, 11, 'B', 5.7);
        $pdf->Ln(1.5);
    }

    protected function tableHeader(ReportPdfDocument $pdf, array $labels, array $widths, ?array $alignments = null): void
    {
        $this->tableRow($pdf, $labels, $widths, $alignments ?? array_map(
            fn (int $index): string => $index === 0 ? 'L' : 'R',
            array_keys($labels),
        ), true, null, 6.9);
    }

    /** Keep a section title, its table header and first row together on one page. */
    protected function tableSection(ReportPdfDocument $pdf, string $title, array $labels, array $widths, array $alignments, array $firstRow): Closure
    {
        $header = $this->tableRowLayout($pdf, $labels, $widths, true, 6.9);
        $first = $this->tableRowLayout($pdf, $firstRow, $widths, false, 8);
        $this->ensure($pdf, max(34.0, 11.5 + $header['height'] + $first['height']));
        $this->section($pdf, $title);
        $this->tableHeader($pdf, $labels, $widths, $alignments);

        return function () use ($pdf, $title, $labels, $widths, $alignments): void {
            $this->paragraph($pdf, $title.' - Fortsetzung', 9, 'B', 5);
            $this->tableHeader($pdf, $labels, $widths, $alignments);
        };
    }

    protected function tableRow(ReportPdfDocument $pdf, array $values, array $widths, array $alignments, bool $strong = false, ?Closure $repeat = null, float $fontSize = 8): void
    {
        ['lines' => $lines, 'height' => $height] = $this->tableRowLayout($pdf, $values, $widths, $strong, $fontSize);
        $this->ensure($pdf, $height, $repeat);
        $pdf->SetFont('Arial', $strong ? 'B' : '', $fontSize);
        $pdf->SetTextColor(35, 39, 44);
        $y = $pdf->GetY();
        if ($strong) {
            $pdf->SetFillColor(240, 242, 244);
            $pdf->Rect(self::LEFT, $y, self::WIDTH, $height, 'F');
        }
        $x = self::LEFT;
        foreach ($lines as $index => $cellLines) {
            foreach ($cellLines as $lineIndex => $line) {
                $pdf->SetXY($x + 1.5, $y + 1.2 + $lineIndex * 4.1);
                $pdf->Cell((float) $widths[$index] - 3.0, 4.1, $pdf->encodeText($line), 0, 0, $alignments[$index] ?? 'L');
            }
            $x += (float) $widths[$index];
        }
        $pdf->SetDrawColor(221, 224, 227);
        $pdf->Line(self::LEFT, $y + $height, self::LEFT + self::WIDTH, $y + $height);
        $pdf->SetY($y + $height);
    }

    /** The measurement and drawing use the same FPDF encoding and font. */
    protected function tableRowLayout(ReportPdfDocument $pdf, array $values, array $widths, bool $strong, float $fontSize): array
    {
        $pdf->SetFont('Arial', $strong ? 'B' : '', $fontSize);
        $lines = [];
        foreach ($values as $index => $value) {
            $lines[] = $this->wrap($pdf, (string) $value, (float) $widths[$index] - 3.0);
        }

        return ['lines' => $lines, 'height' => max(7.0, max(array_map('count', $lines)) * 4.1 + 2.5)];
    }

    protected function paragraph(ReportPdfDocument $pdf, string $text, float $fontSize = 8.2, string $style = '', float $lineHeight = 4.2): void
    {
        $pdf->SetFont('Arial', $style, $fontSize);
        $lines = $this->wrap($pdf, $text, self::WIDTH);
        foreach ($lines as $line) {
            $this->ensure($pdf, $lineHeight);
            $pdf->SetFont('Arial', $style, $fontSize);
            $pdf->SetTextColor($style === 'B' ? 35 : 83, $style === 'B' ? 39 : 88, $style === 'B' ? 44 : 94);
            $pdf->SetX(self::LEFT);
            $pdf->Cell(self::WIDTH, $lineHeight, $pdf->encodeText($line), 0, 1);
        }
    }

    /** Wrap character by character when long identifiers have no spaces. */
    protected function wrap(ReportPdfDocument $pdf, string $text, float $width): array
    {
        $lines = [];
        foreach (explode("\n", str_replace(["\r", "\t"], ['', ' '], $text)) as $paragraph) {
            $line = '';
            foreach (preg_split('/ +/u', trim($paragraph), -1, PREG_SPLIT_NO_EMPTY) ?: [] as $word) {
                $candidate = $line === '' ? $word : $line.' '.$word;
                if ($pdf->GetStringWidth($pdf->encodeText($candidate)) <= $width) {
                    $line = $candidate;

                    continue;
                }
                if ($line !== '') {
                    $lines[] = $line;
                    $line = '';
                }
                if ($pdf->GetStringWidth($pdf->encodeText($word)) <= $width) {
                    $line = $word;

                    continue;
                }
                foreach (preg_split('//u', $word, -1, PREG_SPLIT_NO_EMPTY) ?: [] as $character) {
                    if ($line !== '' && $pdf->GetStringWidth($pdf->encodeText($line.$character)) > $width) {
                        $lines[] = $line;
                        $line = '';
                    }
                    $line .= $character;
                }
            }
            $lines[] = $line;
        }

        return $lines === [] ? [''] : $lines;
    }

    /** Fail explicitly instead of drawing over the footer on an overfull page. */
    protected function ensure(ReportPdfDocument $pdf, float $height, ?Closure $repeat = null): void
    {
        if ($pdf->GetY() + $height <= $pdf->bodyBottom()) {
            return;
        }
        $pdf->AddPage();
        if ($repeat !== null) {
            $repeat();
        }
        if ($pdf->GetY() + $height > $pdf->bodyBottom()) {
            throw ValidationException::withMessages(['document' => 'Eine Berichtszeile ist zu hoch für die verfügbare Seitenfläche. Es wurde kein Inhalt abgeschnitten.']);
        }
    }
}
