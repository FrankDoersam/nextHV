<?php

namespace App\Reports\Support;

/** Shared print layout. Report renderers receive values, never query Eloquent models. */
abstract class StructuredPdfReport extends \tFPDF
{
    protected string $reportTitle = '';

    protected string $reference = '';

    public function __construct()
    {
        parent::__construct();
        $this->SetMargins(18, 18, 18);
        $this->SetAutoPageBreak(true, 22);
        $this->AddFont('DejaVu', '', 'DejaVuSansCondensed.ttf', true);
        $this->AddFont('DejaVu', 'B', 'DejaVuSansCondensed-Bold.ttf', true);
        $this->AliasNbPages();
        $this->SetCreator('nextHV');
    }

    public function Header(): void
    {
        $this->SetFont('DejaVu', 'B', 10);
        $this->SetTextColor(45, 49, 60);
        $this->Cell(110, 6, 'nextHV / '.$this->reportTitle);
        $this->SetFont('DejaVu', '', 8);
        $this->Cell(64, 6, $this->reference, 0, 1, 'R');
        $this->SetDrawColor(221, 224, 230);
        $this->Line(18, 27, 192, 27);
        $this->SetY(34);
    }

    public function Footer(): void
    {
        $this->SetY(-16);
        $this->SetDrawColor(221, 224, 230);
        $this->Line(18, $this->GetY() - 3, 192, $this->GetY() - 3);
        $this->SetFont('DejaVu', '', 8);
        $this->SetTextColor(112, 117, 129);
        $this->Cell(120, 5, 'nextHV · '.$this->reportTitle);
        $this->Cell(54, 5, 'Seite '.$this->PageNo().' / {nb}', 0, 0, 'R');
    }

    protected function section(string $title): void
    {
        if ($this->GetY() > 245) {
            $this->AddPage();
        }
        $this->SetFont('DejaVu', 'B', 11);
        $this->SetTextColor(30, 34, 43);
        $this->Cell(0, 10, $title, 0, 1);
    }

    /** Character-aware wrapping also handles long codes/URLs without overflowing cells. */
    private function lines(string $text, float $width): array
    {
        $lines = [];
        foreach (explode("\n", str_replace("\r", '', $text)) as $paragraph) {
            $line = '';
            foreach (preg_split('/\s+/u', trim($paragraph)) ?: [] as $word) {
                $candidate = $line === '' ? $word : $line.' '.$word;
                if ($this->GetStringWidth($candidate) <= $width) {
                    $line = $candidate;

                    continue;
                }
                if ($line !== '') {
                    $lines[] = $line;
                    $line = '';
                }
                foreach (preg_split('//u', $word, -1, PREG_SPLIT_NO_EMPTY) ?: [] as $character) {
                    if ($this->GetStringWidth($line.$character) > $width) {
                        $lines[] = $line;
                        $line = '';
                    }
                    $line .= $character;
                }
            }
            $lines[] = $line;
        }

        return $lines;
    }

    /** @param iterable<list<string>> $rows */
    protected function table(array $headers, array $widths, iterable $rows, array $alignments = []): void
    {
        $header = function () use ($headers, $widths, $alignments): void {
            $this->SetFont('DejaVu', 'B', 8);
            $this->SetFillColor(239, 241, 245);
            foreach ($headers as $index => $label) {
                $x = $this->GetX();
                $this->Rect($x, $this->GetY(), $widths[$index], 9, 'F');
                $this->SetX($x + 3);
                $this->Cell($widths[$index] - 6, 9, $label, 0, 0, $alignments[$index] ?? 'L');
                $this->SetX($x + $widths[$index]);
            }
            $this->Ln();
        };
        $header();
        $index = 0;
        foreach ($rows as $row) {
            $this->SetFont('DejaVu', '', 9);
            $lines = array_map(fn ($value, $width) => $this->lines((string) $value, $width - 6), $row, $widths);
            $height = max(array_map('count', $lines)) * 5 + 6;
            if ($this->GetY() + $height > 270) {
                $this->AddPage();
                $header();
                $this->SetFont('DejaVu', '', 9);
            }
            $x = 18;
            $y = $this->GetY();
            $this->SetFillColor(...($index++ % 2 ? [247, 248, 250] : [255, 255, 255]));
            $this->Rect(18, $y, 174, $height, 'F');
            $this->SetTextColor(38, 42, 52);
            foreach ($lines as $column => $textLines) {
                foreach ($textLines as $line => $text) {
                    $this->SetXY($x + 3, $y + 3 + $line * 5);
                    $this->Cell($widths[$column] - 6, 5, $text, 0, 0, $alignments[$column] ?? 'L');
                }
                $x += $widths[$column];
            }
            $this->SetXY(18, $y + $height);
            $this->SetDrawColor(230, 232, 237);
            $this->Line(18, $this->GetY(), 192, $this->GetY());
        }
        if ($index === 0) {
            $this->SetFont('DejaVu', '', 9);
            $this->Cell(0, 12, 'Keine Einträge vorhanden.', 0, 1);
        }
    }
}
