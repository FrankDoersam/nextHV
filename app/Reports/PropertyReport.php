<?php

namespace App\Reports;

use App\Reports\Support\ReportPdfDocument;
use App\Reports\Support\StructuredPdfReport;
use Closure;

/** Domain-independent PDF layout; data is projected by BuildPropertyReport. */
final class PropertyReport extends StructuredPdfReport
{
    private const METRIC_WIDTHS = [116.0, 58.0];

    private const UNIT_WIDTHS = [24.0, 69.0, 27.0, 26.0, 28.0];

    public function render(array $data): string
    {
        $pdf = $this->document('Objektbericht', (string) $data['code'], 'Objektbericht · '.$data['name']);
        $this->intro($pdf, $data);
        $this->overview($pdf, (array) $data['metrics']);
        $this->units($pdf, $data['units']);

        $pdf->Ln(5);
        $this->paragraph($pdf, 'Kennzahlen basieren auf laufenden Vertragskonditionen am Erstellungsdatum. Die Jahreshochrechnung ist kein Nachweis eingegangener Zahlungen. Frei bezeichnet Einheiten ohne laufenden Mietvertrag; Instandhaltungszustände werden separat in der Einheitenliste ausgewiesen.', 8);

        return $pdf->Output('S');
    }

    private function intro(ReportPdfDocument $pdf, array $data): void
    {
        $this->paragraph($pdf, (string) $data['name'], 17, 'B', 8);
        $pdf->Ln(2);
        $this->paragraph($pdf, (string) $data['address'], 9, '', 4.7);
        $this->paragraph($pdf, 'Stand '.$data['generated_at'].' · '.$data['status'], 8.2);
        $pdf->Ln(6);
    }

    private function overview(ReportPdfDocument $pdf, array $metrics): void
    {
        $money = static fn (float|int|string $value): string => number_format((float) $value, 2, ',', '.').' EUR';
        $rows = [
            ['Einheiten / vermietet / frei', $metrics['units'].' / '.$metrics['rented'].' / '.$metrics['vacant']],
            ['Gesamte Einheitenfläche', number_format((float) $metrics['area'], 2, ',', '.').' m²'],
            ['Grundmiete pro Monat', $money($metrics['monthly_rent'])],
            ['Nebenkosten und Heizung pro Monat', $money($metrics['monthly_charges'])],
            ['Jahreshochrechnung Grundmiete', $money($metrics['annual_rent'])],
        ];
        $repeat = $this->tableSection($pdf, 'Bewirtschaftung auf einen Blick', ['Kennzahl', 'Wert'], self::METRIC_WIDTHS, ['L', 'R'], $rows[0]);
        foreach ($rows as $row) {
            $this->tableRow($pdf, $row, self::METRIC_WIDTHS, ['L', 'R'], false, $repeat);
        }
        $pdf->Ln(4);
    }

    /** @param iterable<list<string>> $units */
    private function units(ReportPdfDocument $pdf, iterable $units): void
    {
        $headers = ['Nummer', 'Bezeichnung', 'Art', 'Fläche', 'Zustand'];
        $alignments = ['L', 'L', 'L', 'R', 'L'];
        $repeat = null;
        foreach ($units as $row) {
            if ($repeat === null) {
                $repeat = $this->tableSection($pdf, 'Einheiten', $headers, self::UNIT_WIDTHS, $alignments, $row);
            }
            $this->tableRow($pdf, $row, self::UNIT_WIDTHS, $alignments, false, $repeat);
        }
        if ($repeat === null) {
            $this->section($pdf, 'Einheiten');
            $this->paragraph($pdf, 'Keine Einträge vorhanden.', 9);
        }
    }
}
