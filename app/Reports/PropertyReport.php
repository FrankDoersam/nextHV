<?php

namespace App\Reports;

use App\Reports\Support\StructuredPdfReport;

final class PropertyReport extends StructuredPdfReport
{
    public function render(array $data): string
    {
        $this->reportTitle = 'Objektbericht';
        $this->reference = $data['code'];
        $this->SetTitle($this->reportTitle.' · '.$data['name'], true);
        $this->AddPage();
        $this->SetTextColor(25, 29, 39);
        $this->SetFont('DejaVu', 'B', 22);
        $this->MultiCell(0, 11, $data['name']);
        $this->Ln(2);
        $this->SetFont('DejaVu', '', 10);
        $this->SetTextColor(100, 106, 119);
        $this->MultiCell(0, 6, $data['address']);
        $this->Cell(0, 7, 'Stand '.$data['generated_at'].' · '.$data['status'], 0, 1);
        $this->Ln(7);
        $this->section('Bewirtschaftung auf einen Blick');
        $metrics = $data['metrics'];
        $money = fn ($value): string => number_format($value, 2, ',', '.').' EUR';
        $this->table(['Kennzahl', 'Wert'], [116, 58], [
            ['Einheiten / vermietet / frei', $metrics['units'].' / '.$metrics['rented'].' / '.$metrics['vacant']],
            ['Gesamte Einheitenfläche', number_format($metrics['area'], 2, ',', '.').' m²'],
            ['Grundmiete pro Monat', $money($metrics['monthly_rent'])],
            ['Nebenkosten und Heizung pro Monat', $money($metrics['monthly_charges'])],
            ['Jahreshochrechnung Grundmiete', $money($metrics['annual_rent'])],
        ], ['L', 'R']);
        $this->Ln(7);
        $this->section('Einheiten');
        $this->table(['Nummer', 'Bezeichnung', 'Art', 'Fläche', 'Zustand'], [24, 69, 27, 26, 28], $data['units'], ['L', 'L', 'L', 'R', 'L']);
        $this->Ln(6);
        $this->SetFont('DejaVu', '', 8);
        $this->SetTextColor(100, 106, 119);
        $this->MultiCell(0, 5, 'Kennzahlen basieren auf laufenden Vertragskonditionen am Erstellungsdatum. Die Jahreshochrechnung ist kein Nachweis eingegangener Zahlungen. Frei bezeichnet Einheiten ohne laufenden Mietvertrag; Instandhaltungszustände werden separat in der Einheitenliste ausgewiesen.');

        return $this->Output('S');
    }
}
