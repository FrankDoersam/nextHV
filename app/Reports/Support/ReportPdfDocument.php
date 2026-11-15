<?php

namespace App\Reports\Support;

use FPDF;
use Illuminate\Validation\ValidationException;

/**
 * Page geometry and PDF-specific encoding for the shared report renderer.
 * Mirrors the separate FPDF document used by s4v2; nextHV does not yet have
 * the organisation profile required by s4v2's extended document footer.
 */
final class ReportPdfDocument extends FPDF
{
    public function __construct(
        private readonly string $reportTitle,
        private readonly string $reference,
    ) {
        parent::__construct('P', 'mm', 'A4');
        $this->SetMargins(18, 12, 18);
        $this->SetAutoPageBreak(false);
        $this->AliasNbPages();
        $this->SetCreator('nextHV');
    }

    public function Header(): void
    {
        $this->SetXY(18, 12);
        $this->SetFont('Arial', 'B', 9);
        $this->SetTextColor(32, 36, 40);
        $this->Cell(100, 5, $this->encodeText('nextHV / '.$this->reportTitle));
        $this->SetFont('Arial', '', 8);
        $this->SetTextColor(92, 96, 101);
        $this->Cell(74, 5, $this->encodeText($this->reference), 0, 1, 'R');
        $this->SetDrawColor(208, 211, 215);
        $this->Line(18, 20, 192, 20);
        $this->SetY(27);
    }

    public function Footer(): void
    {
        $this->SetY(-15);
        $this->SetDrawColor(208, 211, 215);
        $this->Line(18, $this->GetY() - 3, 192, $this->GetY() - 3);
        $this->SetFont('Arial', '', 8);
        $this->SetTextColor(112, 117, 129);
        $this->Cell(120, 5, $this->encodeText('nextHV · '.$this->reportTitle));
        $this->Cell(54, 5, $this->encodeText('Seite '.$this->PageNo().' / {nb}'), 0, 0, 'R');
    }

    /** Reserve a fixed gap before the footer, even on pages with many table rows. */
    public function bodyBottom(): float
    {
        return $this->GetPageHeight() - 27.0;
    }

    /** FPDF core fonts are Windows-1252; measure and draw the exact same bytes. */
    public function encodeText(string $value): string
    {
        $encoded = @iconv('UTF-8', 'windows-1252//TRANSLIT', $value);
        if ($encoded === false) {
            throw ValidationException::withMessages(['document' => 'Der Bericht enthält ungültige Textzeichen.']);
        }

        return $encoded;
    }
}
