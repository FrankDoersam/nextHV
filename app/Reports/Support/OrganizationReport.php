<?php

namespace App\Reports\Support;

use App\Services\Documents\OrganizationDocumentProfile;
use Carbon\CarbonImmutable;
use Closure;
use Illuminate\Validation\ValidationException;

/** Shared typography, header, tables and pagination of the approved property report. */
abstract class OrganizationReport
{
    protected const LEFT = 18.0;

    protected const WIDTH = 174.0;

    protected function document(string $title, string $reference, string $footerReference, string $subject, bool $complete = true): OrganizationPdfDocument
    {
        $organization = app(OrganizationDocumentProfile::class)->current();
        $pdf = new class($organization, $title, $reference, $complete) extends OrganizationPdfDocument
        {
            public function __construct(array $organization, private readonly string $reportTitle, private readonly string $reference, private readonly bool $complete)
            {
                parent::__construct($organization, $reportTitle);
            }

            public function Header(): void
            {
                $this->SetXY(18, 12);
                $this->SetFont('Arial', 'B', 9);
                $this->SetTextColor(32, 36, 40);
                $this->Cell(85, 5, $this->encodeText($this->reportTitle.($this->complete ? '' : ' - unvollständig')), 0, 0);
                $this->SetFont('Arial', '', 8);
                $this->SetTextColor(92, 96, 101);
                $this->Cell(89, 5, $this->encodeText($this->reference), 0, 1, 'R');
                $this->SetDrawColor(208, 211, 215);
                $this->Line(18, 20, 192, 20);
                $this->SetY(27);
            }
        };
        $pdf->SetMargins(self::LEFT, 12, self::LEFT);
        $pdf->configureFooter(27, ['reference' => $footerReference, 'minimumBodyHeight' => 90.0]);
        $pdf->SetAutoPageBreak(false);
        $pdf->SetTitle($pdf->encodeText($footerReference));
        $pdf->SetSubject($pdf->encodeText($subject));
        $pdf->AddPage();

        return $pdf;
    }

    protected function section(OrganizationPdfDocument $pdf, string $title): void
    {
        $this->ensure($pdf, 22);
        $pdf->Ln(4);
        $this->paragraph($pdf, $title, 11, 'B', 5.7);
        $pdf->Ln(1.5);
    }

    protected function tableHeader(OrganizationPdfDocument $pdf, array $labels, array $widths, ?array $alignments = null): void
    {
        $this->tableRow($pdf, $labels, $widths, $alignments ?? array_map(fn (int $index): string => $index === 0 ? 'L' : 'R', array_keys($labels)), true, null, 6.9);
    }

    protected function tableSection(OrganizationPdfDocument $pdf, string $title, array $labels, array $widths, ?array $alignments = null, ?array $firstRow = null, float $firstRowExtraHeight = 0): Closure
    {
        $height = 34.0;
        if ($firstRow !== null) {
            $header = $this->tableRowLayout($pdf, $labels, $widths, true, 6.9);
            $first = $this->tableRowLayout($pdf, $firstRow, $widths, false, 8);
            $height = max($height, 11.5 + $header['height'] + $first['height'] + $firstRowExtraHeight);
        }
        $this->ensure($pdf, $height);
        $this->section($pdf, $title);
        $this->tableHeader($pdf, $labels, $widths, $alignments);

        return function () use ($pdf, $title, $labels, $widths, $alignments): void {
            $this->paragraph($pdf, $title.' - Fortsetzung', 9, 'B', 5);
            $this->tableHeader($pdf, $labels, $widths, $alignments);
        };
    }

    protected function tableRow(OrganizationPdfDocument $pdf, array $values, array $widths, array $alignments, bool $strong = false, ?Closure $repeat = null, float $fontSize = 8): void
    {
        $style = $strong ? 'B' : '';
        ['lines' => $lines, 'height' => $height] = $this->tableRowLayout($pdf, $values, $widths, $strong, $fontSize);
        $lineHeight = 4.1;
        $this->ensure($pdf, $height, $repeat);
        $pdf->SetFont('Arial', $style, $fontSize);
        $pdf->SetTextColor(35, 39, 44);
        $y = $pdf->GetY();
        if ($strong) {
            $pdf->SetFillColor(240, 242, 244);
            $pdf->Rect(self::LEFT, $y, self::WIDTH, $height, 'F');
        }
        $x = self::LEFT;
        foreach ($lines as $index => $cellLines) {
            foreach ($cellLines as $lineIndex => $line) {
                $pdf->SetXY($x + 1.5, $y + 1.2 + $lineIndex * $lineHeight);
                $pdf->Cell((float) $widths[$index] - 3.0, $lineHeight, $pdf->encodeText($line), 0, 0, $alignments[$index] ?? 'L');
            }
            $x += (float) $widths[$index];
        }
        $pdf->SetDrawColor(221, 224, 227);
        $pdf->Line(self::LEFT, $y + $height, self::LEFT + self::WIDTH, $y + $height);
        $pdf->SetY($y + $height);
    }

    /** Use the same measured rows for drawing and keeping a heading with its first entry. */
    protected function tableRowLayout(OrganizationPdfDocument $pdf, array $values, array $widths, bool $strong, float $fontSize): array
    {
        $pdf->SetFont('Arial', $strong ? 'B' : '', $fontSize);
        $lines = [];
        foreach ($values as $index => $value) {
            $lines[] = $this->wrap($pdf, (string) $value, (float) $widths[$index] - 3.0);
        }

        return ['lines' => $lines, 'height' => max(7.0, max(array_map('count', $lines)) * 4.1 + 2.5)];
    }

    protected function paragraph(OrganizationPdfDocument $pdf, string $text, float $fontSize = 8.2, string $style = '', float $lineHeight = 4.2, ?Closure $repeat = null): void
    {
        $pdf->SetFont('Arial', $style, $fontSize);
        $lines = $this->wrap($pdf, $text, self::WIDTH);
        foreach ($lines as $line) {
            $this->ensure($pdf, $lineHeight, $repeat);
            $pdf->SetFont('Arial', $style, $fontSize);
            $pdf->SetTextColor($style === 'B' ? 35 : 83, $style === 'B' ? 39 : 88, $style === 'B' ? 44 : 94);
            $pdf->SetX(self::LEFT);
            $pdf->Cell(self::WIDTH, $lineHeight, $pdf->encodeText($line), 0, 1);
        }
    }

    /** Measure with the same font and encoding used to draw; long values are never clipped. */
    protected function wrap(OrganizationPdfDocument $pdf, string $text, float $width): array
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

    protected function ensure(OrganizationPdfDocument $pdf, float $height, ?Closure $repeat = null): void
    {
        if ($pdf->GetY() + $height <= $pdf->bodyBottom()) {
            return;
        }
        $pdf->AddPage();
        if ($repeat) {
            $repeat();
        }
        if ($pdf->GetY() + $height > $pdf->bodyBottom()) {
            throw ValidationException::withMessages(['document' => 'Ein Berichtsabschnitt ist zusammen mit dem Dokumentfuß zu umfangreich für eine Seite. Es wurde kein Inhalt verdeckt.']);
        }
    }

    protected function money(int $cents): string
    {
        $absolute = abs($cents);

        return ($cents < 0 ? '-' : '').number_format(intdiv($absolute, 100), 0, ',', '.').','.str_pad((string) ($absolute % 100), 2, '0', STR_PAD_LEFT).' €';
    }

    protected function date(string $value): string
    {
        return CarbonImmutable::parse($value)->format('d.m.Y');
    }

    protected function displayDate(?string $value): string
    {
        return $value ? $this->date($value) : '-';
    }

    /** The existing rent-ledger JSON contract expresses amounts in decimal euros. */
    protected function decimalMoney(float|int|string|null $amount): string
    {
        return $this->money((int) round((float) ($amount ?? 0) * 100));
    }

    protected function period(string $from, string $to): string
    {
        return $this->date($from).' - '.$this->date($to);
    }
}
