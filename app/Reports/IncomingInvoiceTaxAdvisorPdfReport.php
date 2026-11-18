<?php

namespace App\Reports;

use App\Reports\Support\OrganizationReport;

/** Accountant review export using the canonical organisation report layout. */
final class IncomingInvoiceTaxAdvisorPdfReport extends OrganizationReport
{
    private const WIDTHS = [25.0, 36.0, 48.0, 23.0, 21.0, 21.0];

    public function render(array $data): string
    {
        $pdf = $this->document(
            'Eingangsrechnungen · Steuerberatung',
            $this->period($data['from'], $data['to']),
            'Steuerliche Vorprüfung',
            'Ausgaben und Lieferantengutschriften nach Rechnungsdatum',
            (int) $data['counts']['review'] === 0 && (int) $data['counts']['withoutDocuments'] === 0,
        );

        $this->paragraph($pdf, 'Ausgaben für die Steuerberatung', 16, 'B', 7);
        $this->paragraph($pdf, 'Rechnungsdatum: '.$this->period($data['from'], $data['to']), 10, 'B', 5.5);
        $this->paragraph($pdf, 'Erstellt: '.$this->date($data['generatedAt']), 8.2);
        $pdf->Ln(2);
        $this->paragraph($pdf, (string) $data['disclaimer'], 8.2);
        $pdf->Ln(3);

        $counts = $data['counts'];
        $totals = $data['totalsCents'];
        $this->section($pdf, 'Übersicht und Prüfbarkeit');
        $this->tableHeader($pdf, ['Kennzahl', 'Anzahl', 'Betrag'], [85, 33, 56], ['L', 'R', 'R']);
        foreach ([
            ['Eingangsrechnungen', $counts['invoices'], null],
            ['Lieferantengutschriften', $counts['creditNotes'], null],
            ['Steuerlich zu prüfen', $counts['review'], $totals['reviewGross']],
            ['Als relevant vorgemerkt', $counts['relevant'], $totals['relevantGross']],
            ['Als nicht relevant vorgemerkt', $counts['notRelevant'], $totals['notRelevantGross']],
            ['Fehlende Belege in der Ablage', $counts['withoutDocuments'], null],
            ['Saldo aller Positionen', $counts['positions'], $totals['gross']],
        ] as $entry) {
            $this->tableRow($pdf, [
                $entry[0], (string) $entry[1],
                $entry[2] === null ? '-' : $this->money((int) $entry[2]),
            ], [85, 33, 56], ['L', 'R', 'R']);
        }
        $this->section($pdf, 'Vorgemerkte Ausgaben nach Kategorie');
        if ($data['categoriesCents'] === []) {
            $this->paragraph($pdf, 'Noch keine steuerlich relevanten Positionen kategorisiert.');
        } else {
            foreach ($data['categoriesCents'] as $category => $amount) {
                $this->paragraph($pdf, $this->category((string) $category).'  ·  '.$this->money((int) $amount), 9.2);
            }
        }

        if ($data['rows'] === []) {
            $this->section($pdf, 'Einzelpositionen');
            $this->paragraph($pdf, 'Im ausgewählten Zeitraum liegen keine aktiven Belege vor.');
        } else {
            $header = ['Beleg / Datum', 'Lieferant', 'Position / Objekt', 'Zuordnung', 'Netto', 'Brutto'];
            $repeat = $this->tableSection($pdf, 'Einzelpositionen', $header, self::WIDTHS, ['L', 'L', 'L', 'L', 'R', 'R']);
            foreach ($data['rows'] as $row) {
                $category = $row['taxTreatment'] === 'relevant'
                    ? $this->category((string) $row['taxCategory'])
                    : ($row['taxTreatment'] === 'not_relevant' ? 'Nicht relevant' : 'Prüfung offen');
                $ref = $row['externalNumber'] ?: $row['invoiceNumber'];
                if (in_array($row['documentType'], ['supplier_credit', 'credit'], true)) $ref = 'GS '.$ref;
                $description = $row['position'];
                if ($row['property']) $description .= "\n".$row['property'];
                $this->tableRow($pdf, [
                    $ref."\n".$this->date($row['invoiceDate']),
                    $row['supplier'] ?: '-',
                    $description,
                    $category,
                    $this->money((int) $row['netCents']),
                    $this->money((int) $row['grossCents']),
                ], self::WIDTHS, ['L', 'L', 'L', 'L', 'R', 'R'], false, $repeat);
            }
            $pdf->Ln(2);
            $this->paragraph($pdf, 'Details einschließlich Umsatzsteuerbetrag, Originalrechnungsbezug, Objektkonto, Umlagefähigkeit, internen Hinweisen und Dokumentenzahl enthält der CSV-Export.');
        }
        return $pdf->Output('S');
    }

    private function category(string $category): string
    {
        return match ($category) {
            'maintenance' => 'Instandhaltung',
            'operating_costs' => 'Betriebskosten',
            'administration' => 'Verwaltung',
            'work_equipment' => 'Arbeitsmittel',
            'capital_expenditure' => 'Anschaffung / Herstellung (Prüfung AfA)',
            'financing' => 'Finanzierung',
            'other' => 'Sonstige',
            default => 'Nicht zugeordnet',
        };
    }
}
