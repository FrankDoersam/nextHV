<?php

namespace App\Reports;

use App\Reports\Support\OrganizationPdfDocument;
use App\Reports\Support\OrganizationReport;
use Closure;

class PropertyRentStatementPdfReport extends OrganizationReport
{
    private const SUMMARY_WIDTHS = [69.0, 35.0, 35.0, 35.0];

    private const PHASE_WIDTHS = [39.0, 27.0, 26.0, 28.0, 27.0, 27.0];

    private const PHASE_TOTAL_WIDTHS = [92.0, 28.0, 27.0, 27.0];

    private const SUMMARY_LABELS = ['Einheitentyp', 'Kaltmiete', 'Nebenkosten', 'Gesamt'];

    private const PHASE_LABELS = ['Zeitraum', 'Kalt / Intervall', 'NK / Intervall', 'Kalt im Zeitraum', 'NK im Zeitraum', 'Gesamt'];

    /** Render only the server's privacy-filtered report projection. */
    public function render(array $data): string
    {
        $reference = (string) data_get($data, 'property.number', '');
        $complete = (bool) ($data['complete'] ?? true);
        $pdf = $this->document(
            'Mietaufstellung',
            'Objekt '.$reference,
            'Mietaufstellung · '.$reference,
            'Vertragliche Mietaufstellung '.$this->period($data['from'], $data['to']),
            $complete,
        );

        $this->intro($pdf, $data);
        $this->overview($pdf, $data);
        $this->warnings($pdf, (array) ($data['warnings'] ?? []));

        foreach ((array) ($data['groups'] ?? []) as $group) {
            $this->group($pdf, $group, (bool) ($data['includeTenants'] ?? false));
        }

        return $pdf->Output('S');
    }

    private function intro(OrganizationPdfDocument $pdf, array $data): void
    {
        $this->paragraph($pdf, (string) data_get($data, 'property.name', ''), 17, 'B', 7.5);
        $address = trim((string) data_get($data, 'property.address', ''));
        if ($address !== '') {
            $this->paragraph($pdf, $address, 9, '', 4.7);
        }
        $pdf->Ln(2);
        $this->paragraph($pdf, $this->period($data['from'], $data['to']), 11, 'B', 5.5);
        $this->paragraph($pdf, ($data['includeTenants'] ?? false) ? 'Darstellung: Einheiten mit Mieternamen' : 'Darstellung: nur Einheiten, ohne Mieternamen', 8.2);
        $this->paragraph($pdf, 'Erstellt am '.$this->date((string) ($data['generatedAt'] ?? now()->toIso8601String())), 8.2);
        $pdf->Ln(3);
        $this->paragraph($pdf, 'Vertragliche Mietaufstellung: Vereinbarte Mieten und Nebenkosten werden für den gewählten Zeitraum einschließlich Start- und Enddatum berechnet. Änderungen und Einmalbeträge erscheinen in eigenen Abschnitten.', 8.4);
        $this->paragraph($pdf, 'Zahlungseingänge, Kautionen und Ergebnisse von Nebenkostenabrechnungen sind nicht enthalten. Die Beträge sind keine Einnahmenaufstellung nach Zahlungseingang.', 8.4);
        $pdf->Ln(2);

        if (! ($data['complete'] ?? true)) {
            $this->paragraph($pdf, 'Unvollständige Datengrundlage', 10, 'B', 5);
            $this->paragraph($pdf, 'Die Summen enthalten nur auswertbare Vereinbarungen. Fehlende Konditionen und weitere Lücken sind unter Datenhinweise mit Einheit und Zeitraum aufgeführt.', 8.4);
            $pdf->Ln(2);
        }
    }

    private function overview(OrganizationPdfDocument $pdf, array $data): void
    {
        $this->section($pdf, 'Summen nach Einheitentyp');
        $repeat = function () use ($pdf): void {
            $this->section($pdf, 'Summen nach Einheitentyp - Fortsetzung');
            $this->tableHeader($pdf, self::SUMMARY_LABELS, self::SUMMARY_WIDTHS);
        };
        $this->tableHeader($pdf, self::SUMMARY_LABELS, self::SUMMARY_WIDTHS);
        foreach ((array) ($data['groups'] ?? []) as $group) {
            $this->summaryRow($pdf, (string) $group['label'], (array) $group['totals'], false, $repeat);
        }
        $this->summaryRow($pdf, 'Gesamtsumme', (array) $data['totals'], true, $repeat);
        $this->components($pdf, (array) $data['totals']);

        $this->section($pdf, 'Jahressummen im gewählten Zeitraum');
        $yearLabels = ['Jahr / ausgewerteter Zeitraum', 'Kaltmiete', 'Nebenkosten', 'Gesamt'];
        $repeatYears = function () use ($pdf, $yearLabels): void {
            $this->section($pdf, 'Jahressummen - Fortsetzung');
            $this->tableHeader($pdf, $yearLabels, self::SUMMARY_WIDTHS);
        };
        $this->tableHeader($pdf, $yearLabels, self::SUMMARY_WIDTHS);
        foreach ((array) ($data['years'] ?? []) as $year) {
            $this->summaryRow($pdf, $year['year'].' · '.$this->period($year['from'], $year['to']), (array) $year['totals'], false, $repeatYears);
        }
        $pdf->Ln(3);
        $this->paragraph($pdf, 'Berechnung: Wiederkehrende Intervallbeträge werden auf Monate verteilt; Teilmonate nach den tatsächlichen Kalendertagen berechnet. Gerundet wird je Konditionsabschnitt, Kalenderjahr und Mietbestandteil. Einmalbeträge werden einmal am Beginn ihrer Gültigkeit berücksichtigt.', 8);
        $this->paragraph($pdf, 'Nebenkosten = Betriebs- und Heizkostenvorauszahlungen. Die Typgruppen folgen den hinterlegten Einheiten. Garagen- und Stellplatzanteile innerhalb eines anderen Mietvertrags bleiben bei dessen Einheit und sind als Teil der Kaltmiete ausgewiesen.', 8);
    }

    private function warnings(OrganizationPdfDocument $pdf, array $warnings): void
    {
        if ($warnings === []) {
            return;
        }
        $this->section($pdf, 'Datenhinweise');
        foreach ($warnings as $warning) {
            $identity = 'Einheit '.(string) ($warning['unitNumber'] ?? '');
            if (! empty($warning['from']) && ! empty($warning['to'])) {
                $identity .= ' · '.$this->period($warning['from'], $warning['to']);
            }
            $this->paragraph($pdf, $identity, 8.5, 'B');
            $this->paragraph($pdf, (string) ($warning['message'] ?? ''), 8.2);
            $pdf->Ln(1);
        }
    }

    private function group(OrganizationPdfDocument $pdf, array $group, bool $includeTenants): void
    {
        $units = (array) ($group['units'] ?? []);
        $label = (string) $group['label'];
        $this->ensure($pdf, $includeTenants ? 48 : 42);
        $this->section($pdf, $label.' · '.count($units).' '.(count($units) === 1 ? 'Einheit' : 'Einheiten'));

        foreach ($units as $unit) {
            $this->unit($pdf, $label, $unit, $includeTenants);
        }

        if (count($units) < 2) {
            return;
        }

        $years = count((array) ($group['years'] ?? [])) > 1 ? $group['years'] : [];
        $this->ensure($pdf, 7.0 * (2 + count($years)) + $this->componentHeight($pdf, (array) $group['totals']));
        $labels = ['Einheitentyp / Jahr', 'Kaltmiete', 'Nebenkosten', 'Gesamt'];
        $repeat = function () use ($pdf, $label, $labels): void {
            $this->paragraph($pdf, $label.' - Summen', 9, 'B', 5);
            $this->tableHeader($pdf, $labels, self::SUMMARY_WIDTHS);
        };
        $this->tableHeader($pdf, $labels, self::SUMMARY_WIDTHS);
        $this->summaryRow($pdf, 'Summe '.$label, (array) $group['totals'], true, $repeat);
        foreach ($years as $year) {
            $this->summaryRow($pdf, (string) $year['year'], (array) $year['totals'], false, $repeat);
        }
        $this->components($pdf, (array) $group['totals']);
        $pdf->Ln(4);
    }

    private function unit(OrganizationPdfDocument $pdf, string $groupLabel, array $unit, bool $includeTenants): void
    {
        $unitLabel = 'Einheit '.(string) $unit['unitNumber'];
        $phases = (array) ($unit['phases'] ?? []);
        $this->ensure($pdf, $includeTenants ? 37 : 31);
        $this->paragraph($pdf, $unitLabel, 10, 'B', 5.2);
        if ($phases === []) {
            $this->paragraph($pdf, ($unit['complete'] ?? true)
                ? 'Keine Mietbeträge im gewählten Zeitraum.'
                : 'Keine auswertbaren Mietbeträge. Bitte die Datenhinweise beachten.', 8.2);
            $pdf->Ln(4);

            return;
        }

        $repeat = function () use ($pdf, $groupLabel, $unitLabel): void {
            $this->paragraph($pdf, $groupLabel.' · '.$unitLabel.' - Fortsetzung', 9, 'B', 5);
            $this->tableHeader($pdf, self::PHASE_LABELS, self::PHASE_WIDTHS);
        };
        $this->tableHeader($pdf, self::PHASE_LABELS, self::PHASE_WIDTHS);

        foreach ($phases as $phase) {
            $interval = (array) $phase['intervalAmounts'];
            $amounts = (array) $phase['amounts'];
            $reason = trim((string) ($phase['changeReasonLabel'] ?? ''));
            $terms = (string) $phase['paymentIntervalLabel'].($reason !== '' ? ' · '.$reason : '');
            if (! empty($phase['conditionFrom'])) {
                $terms .= ' · Kondition seit '.$this->date($phase['conditionFrom']);
            }
            $metadata = [$terms];
            if ($includeTenants) {
                foreach ((array) ($phase['tenants'] ?? []) as $tenant) {
                    $metadata[] = 'Mieter: '.(string) $tenant['name'].' · '.$this->period($tenant['from'], $tenant['to']);
                }
            }

            $this->tableRow($pdf, [
                $this->date($phase['from']).($phase['from'] !== $phase['to'] ? "\nbis ".$this->date($phase['to']) : ''),
                $this->money($interval['coldRentCents']),
                $this->money($interval['serviceChargesCents']),
                $this->money($amounts['coldRentCents']),
                $this->money($amounts['serviceChargesCents']),
                $this->money($amounts['totalCents']),
            ], self::PHASE_WIDTHS, ['L', 'R', 'R', 'R', 'R', 'R'], false, $repeat);
            foreach ($metadata as $line) {
                $this->paragraph($pdf, $line, 7.6, '', 3.7, $repeat);
            }
            $this->phaseComponents($pdf, $interval, (string) $phase['paymentIntervalLabel'], $repeat);
            $pdf->Ln(1);
        }

        $years = count((array) ($unit['years'] ?? [])) > 1 ? $unit['years'] : [];
        $this->ensure($pdf, 7.0 * (1 + count($years)) + $this->componentHeight($pdf, (array) $unit['totals']), $repeat);
        $this->phaseTotalRow($pdf, 'Summe '.$unitLabel, (array) $unit['totals'], true, $repeat);
        foreach ($years as $year) {
            $this->phaseTotalRow($pdf, (string) $year['year'], (array) $year['totals'], false, $repeat);
        }
        $this->components($pdf, (array) $unit['totals']);
        $pdf->Ln(4);
    }

    private function phaseComponents(OrganizationPdfDocument $pdf, array $amounts, string $intervalLabel, ?Closure $repeat): void
    {
        $parts = [];
        foreach (['garageCents' => 'Garage', 'parkingCents' => 'Stellplatz', 'otherCents' => 'Sonstiges'] as $key => $label) {
            if (($amounts[$key] ?? 0) !== 0) {
                $parts[] = $label.' '.$this->money($amounts[$key]);
            }
        }
        if ($parts !== []) {
            $this->paragraph($pdf, 'In der Kaltmiete enthalten ('.$intervalLabel.'): '.implode(' · ', $parts), 7.6, '', 3.7, $repeat);
        }
    }

    private function components(OrganizationPdfDocument $pdf, array $amounts): void
    {
        $this->ensure($pdf, $this->componentHeight($pdf, $amounts));
        $pdf->Ln(1);
        foreach ($this->componentNotes($amounts) as $note) {
            $this->paragraph($pdf, $note, 7.8);
        }
    }

    private function componentHeight(OrganizationPdfDocument $pdf, array $amounts): float
    {
        $pdf->SetFont('Arial', '', 7.8);

        return 1.0 + array_sum(array_map(fn (string $note): float => count($this->wrap($pdf, $note, self::WIDTH)) * 4.2, $this->componentNotes($amounts)));
    }

    private function componentNotes(array $amounts): array
    {
        $parts = ['Grundmiete '.$this->money($amounts['baseRentCents'] ?? 0)];
        foreach (['garageCents' => 'Garagenanteile', 'parkingCents' => 'Stellplatzanteile', 'otherCents' => 'Sonstige Anteile'] as $key => $label) {
            if (($amounts[$key] ?? 0) !== 0) {
                $parts[] = $label.' '.$this->money($amounts[$key]);
            }
        }

        return [
            'Nebenkosten im Zeitraum: Betriebskosten '.$this->money($amounts['operatingCostsCents'] ?? 0).' · Heizkosten '.$this->money($amounts['heatingCostsCents'] ?? 0),
            'Bestandteile der Kaltmiete im Zeitraum: '.implode(' · ', $parts),
        ];
    }

    private function summaryRow(OrganizationPdfDocument $pdf, string $label, array $totals, bool $strong = false, ?Closure $repeat = null): void
    {
        $this->tableRow($pdf, [$label, $this->money($totals['coldRentCents'] ?? 0), $this->money($totals['serviceChargesCents'] ?? 0), $this->money($totals['totalCents'] ?? 0)], self::SUMMARY_WIDTHS, ['L', 'R', 'R', 'R'], $strong, $repeat);
    }

    private function phaseTotalRow(OrganizationPdfDocument $pdf, string $label, array $totals, bool $strong, ?Closure $repeat): void
    {
        $this->tableRow($pdf, [$label, $this->money($totals['coldRentCents'] ?? 0), $this->money($totals['serviceChargesCents'] ?? 0), $this->money($totals['totalCents'] ?? 0)], self::PHASE_TOTAL_WIDTHS, ['L', 'R', 'R', 'R'], $strong, $repeat);
    }
}
