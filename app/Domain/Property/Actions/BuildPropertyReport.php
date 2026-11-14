<?php

namespace App\Domain\Property\Actions;

use App\Models\Property;

final class BuildPropertyReport
{
    public function __construct(private CalculateOverview $overview) {}

    public function handle(Property $property): string
    {
        $metrics = $this->overview->handle(Property::whereKey($property->id));
        $pdf = new \tFPDF;
        $pdf->SetAutoPageBreak(true, 18);
        $pdf->AddPage();
        $pdf->AddFont('DejaVu', '', 'DejaVuSansCondensed.ttf', true);
        $pdf->SetFont('DejaVu', '', 20);
        $pdf->SetTextColor(79, 70, 229);
        $pdf->Cell(0, 12, 'nextHV · Objektbericht', 0, 1);
        $pdf->SetTextColor(25, 35, 35);
        $pdf->SetFont('DejaVu', '', 14);
        $pdf->MultiCell(0, 9, $property->code.' · '.$property->name);
        $pdf->SetFont('DejaVu', '', 10);
        $pdf->MultiCell(0, 7, $property->street.' '.$property->house_number.' · '.$property->postal_code.' '.$property->city);
        $pdf->Cell(0, 8, 'Erstellt: '.now()->timezone('Europe/Berlin')->format('d.m.Y H:i'), 0, 1);
        $pdf->Ln(6);
        foreach (['Einheiten' => $metrics['units'], 'Vermietet' => $metrics['rented'], 'Grundmiete pro Monat' => number_format($metrics['monthly_rent'], 2, ',', '.').' EUR', 'Nebenkosten und Heizung' => number_format($metrics['monthly_charges'], 2, ',', '.').' EUR', 'Jahreshochrechnung Grundmiete' => number_format($metrics['annual_rent'], 2, ',', '.').' EUR'] as $label => $value) {
            $pdf->Cell(100, 8, $label, 0, 0);
            $pdf->Cell(0, 8, (string) $value, 0, 1);
        }
        $pdf->Ln(6);
        $pdf->SetFont('DejaVu', '', 13);
        $pdf->Cell(0, 10, 'Einheiten', 0, 1);
        $pdf->SetFont('DejaVu', '', 10);
        foreach ($property->units()->orderBy('code')->cursor() as $unit) {
            $pdf->MultiCell(0, 7, $unit->code.' · '.$unit->name.' · '.number_format($unit->area, 2, ',', '.').' m²');
        }
        $pdf->Ln(6);
        $pdf->SetFont('DejaVu', '', 8);
        $pdf->MultiCell(0, 5, 'Kennzahlen basieren auf laufenden Vertragskonditionen am Erstellungsdatum. Die Jahreshochrechnung ist kein Nachweis eingegangener Zahlungen.');

        return $pdf->Output('S');
    }
}
