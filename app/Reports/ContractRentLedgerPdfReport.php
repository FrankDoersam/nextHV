<?php

namespace App\Reports;

use App\Reports\Support\OrganizationPdfDocument;
use App\Reports\Support\OrganizationReport;

class ContractRentLedgerPdfReport extends OrganizationReport
{
    private const SUMMARY_WIDTHS = [69, 35, 35, 35];

    private const SUMMARY_LABELS = ['Kostenart', 'Soll', 'Ist (zugeordnet)', 'Offen heute'];

    private const ITEM_WIDTHS = [57, 24, 31, 31, 31];

    private const ITEM_LABELS = ['Forderung / Kostenart', 'Fällig am', 'Soll', 'Ist (zugeordnet)', 'Offen heute'];

    public function render(array $data): string
    {
        $number = (string) data_get($data, 'contract.number', '');
        $period = (string) data_get($data, 'period.serviceLabel', data_get($data, 'period.label', ''));
        $pdf = $this->document('Mietkonto Soll/Ist', 'Vertrag '.$number, 'Mietkonto · '.$number, 'Leistungsmonate '.$period);

        $this->intro($pdf, $data);
        $this->overview($pdf, $data);
        $this->missingPositions($pdf, $data);
        $this->ledger($pdf, $data);

        return $pdf->Output('S');
    }

    private function intro(OrganizationPdfDocument $pdf, array $data): void
    {
        $contract = $data['contract'];
        $this->paragraph($pdf, 'Vertrag '.($contract['number'] ?? ''), 17, 'B', 7.5);
        $this->paragraph($pdf, collect([$contract['property'] ?? null, $contract['unit'] ?? null])->filter()->join(' · '), 9, '', 4.8);
        $this->paragraph($pdf, 'Mietparteien: '.($contract['tenant'] ?? '-'));
        $this->paragraph($pdf, 'Vertragslaufzeit: '.($contract['period'] ?? '-'));
        $pdf->Ln(4);
        $this->paragraph($pdf, 'Leistungsmonate: '.data_get($data, 'period.serviceLabel', data_get($data, 'period.label', '')), 11, 'B', 5.7);
        $this->paragraph($pdf, 'Zeitraumauswahl: '.data_get($data, 'period.label', '-'));
        $this->paragraph($pdf, 'Buchungsstand: '.($data['balanceAsOfLabel'] ?? $data['generatedAt'] ?? '-'));
        $pdf->Ln(3);
        $this->paragraph($pdf, 'Sollstellungen der gewählten Leistungsmonate mit ihren derzeit zugeordneten Zahlungen. Der offene Betrag entspricht dem Stand bei Erstellung. Spätere Zahlungseingänge können bereits zugeordnet sein; die Auswahl begrenzt nicht das Zahlungsdatum.', 8.4, '', 4.5);
        $pdf->Ln(1);
        $this->paragraph($pdf, 'Auszahlungen und Guthaben erscheinen mit negativem Vorzeichen. Kautionen sind nicht enthalten. Noch nicht erzeugte Sollstellungen werden getrennt als Vorschau ausgewiesen und sind nicht Teil der Kontosummen.', 8.4, '', 4.5);
    }

    private function overview(OrganizationPdfDocument $pdf, array $data): void
    {
        $repeat = $this->tableSection($pdf, 'Kontoübersicht nach Kostenart', self::SUMMARY_LABELS, self::SUMMARY_WIDTHS);
        foreach ($data['accounts'] ?? [] as $account) {
            $this->tableRow($pdf, $this->summaryRow($account, (string) $account['label']), self::SUMMARY_WIDTHS, ['L', 'R', 'R', 'R'], false, $repeat);
        }
        $this->tableRow($pdf, $this->summaryRow($data['totals'], 'Gesamtsumme'), self::SUMMARY_WIDTHS, ['L', 'R', 'R', 'R'], true, $repeat);
        $pdf->Ln(2);
        $this->paragraph($pdf, 'Im Ist enthalten: reguläre Zuordnungen '.$this->decimalMoney(data_get($data, 'totals.payments')).' und Überzahlungen '.$this->decimalMoney(data_get($data, 'totals.overpayments')).'.');
        $this->paragraph($pdf, 'Rechnerischer Saldo (Soll minus Ist): '.$this->decimalMoney(data_get($data, 'totals.saldo')).'. Der gespeicherte offene Stand kann durch Überzahlungen oder ältere Ausgleichsbuchungen davon abweichen.');

        if (($data['months'] ?? []) === []) {
            $pdf->Ln(3);
            $this->paragraph($pdf, 'Für die gewählten Leistungsmonate sind keine wirksamen Forderungen erfasst.');

            return;
        }

        $repeat = $this->tableSection($pdf, 'Monatsübersicht', ['Leistungsmonat', 'Soll', 'Ist (zugeordnet)', 'Offen heute'], self::SUMMARY_WIDTHS);
        foreach ($data['months'] as $month) {
            $this->tableRow($pdf, $this->summaryRow($month['totals'], (string) $month['label']), self::SUMMARY_WIDTHS, ['L', 'R', 'R', 'R'], false, $repeat);
        }
        $this->tableRow($pdf, $this->summaryRow($data['totals'], 'Gesamtsumme'), self::SUMMARY_WIDTHS, ['L', 'R', 'R', 'R'], true, $repeat);
    }

    private function missingPositions(OrganizationPdfDocument $pdf, array $data): void
    {
        $rows = $data['missingPositions'] ?? [];
        if ($rows === []) {
            return;
        }
        $this->section($pdf, 'Noch nicht erzeugte Sollstellungen');
        $this->paragraph($pdf, 'Vorschau des Sollstellungslaufs für derzeit aktive Verträge. Diese Beträge sind noch nicht gebucht und nicht in den Kontosummen enthalten. Die Vorschau ist kein Nachweis einer vollständigen historischen Sollstellung.');
        $labels = ['Leistungsmonat / Kostenart', 'Fällig am', 'Vorschau'];
        $widths = [108, 31, 35];
        $repeat = $this->tableSection($pdf, 'Sollstellungsvorschau', $labels, $widths, ['L', 'L', 'R']);
        foreach ($rows as $row) {
            $this->tableRow($pdf, [
                $this->displayDate($row['serviceMonth'] ?? null).' · '.($row['accountLabel'] ?? $row['description'] ?? 'Sollstellung'),
                $this->displayDate($row['dueDate'] ?? null),
                $this->decimalMoney($row['amount'] ?? 0),
            ], $widths, ['L', 'L', 'R'], false, $repeat);
        }
    }

    private function ledger(OrganizationPdfDocument $pdf, array $data): void
    {
        foreach ($data['months'] ?? [] as $month) {
            $monthLabel = (string) $month['label'];
            $firstRow = isset($month['receivables'][0]) ? $this->receivableRow($month['receivables'][0]) : null;
            $repeat = $this->tableSection($pdf, 'Sollstellungen · '.$monthLabel, self::ITEM_LABELS, self::ITEM_WIDTHS, ['L', 'L', 'R', 'R', 'R'], $firstRow);
            foreach ($month['receivables'] ?? [] as $row) {
                $this->tableRow($pdf, $this->receivableRow($row), self::ITEM_WIDTHS, ['L', 'L', 'R', 'R', 'R'], false, $repeat);
            }
            $this->tableRow($pdf, [
                'Monatssumme', '',
                $this->decimalMoney($month['totals']['soll'] ?? 0),
                $this->decimalMoney($month['totals']['coverage'] ?? 0),
                $this->decimalMoney($month['totals']['open'] ?? 0),
            ], self::ITEM_WIDTHS, ['L', 'L', 'R', 'R', 'R'], true, $repeat);
            $this->bookings($pdf, $monthLabel, $month['bookings'] ?? [], array_column($month['receivables'] ?? [], 'number', 'id'));
        }
    }

    private function bookings(OrganizationPdfDocument $pdf, string $monthLabel, array $bookings, array $receivableNumbers): void
    {
        if ($bookings === []) {
            $pdf->Ln(2);
            $this->paragraph($pdf, 'Diesen Forderungen sind bislang keine Zahlungen zugeordnet.');

            return;
        }
        $labels = ['Zahlung / Forderungszuordnung', 'Zahlungstag', 'Betrag'];
        $widths = [112, 31, 31];
        $repeat = $this->tableSection($pdf, 'Zahlungszuordnungen · '.$monthLabel, $labels, $widths, ['L', 'L', 'R'], $this->bookingRow($bookings[0], $receivableNumbers));
        foreach ($bookings as $row) {
            $this->tableRow($pdf, $this->bookingRow($row, $receivableNumbers), $widths, ['L', 'L', 'R'], false, $repeat);
        }
    }

    private function receivableRow(array $row): array
    {
        $identity = collect([$row['number'] ?? null, $row['accountLabel'] ?? null])->filter()->join(' · ');
        if (! empty($row['description']) && $row['description'] !== ($row['number'] ?? null)) {
            $identity .= "\n".$row['description'];
        }

        return [$identity, $this->displayDate($row['dueDate'] ?? null), $this->decimalMoney($row['soll'] ?? 0), $this->decimalMoney($row['coverage'] ?? 0), $this->decimalMoney($row['open'] ?? 0)];
    }

    private function bookingRow(array $row, array $receivableNumbers): array
    {
        $kind = ($row['isOverpayment'] ?? false) ? 'Überzahlung' : (($row['isPayout'] ?? false) ? 'Auszahlung' : 'Zahlung');
        $identity = collect([$kind, $receivableNumbers[$row['receivableId']] ?? $row['receivableLabel'] ?? null, $row['accountLabel'] ?? null])->filter()->join(' · ');
        $details = collect([
            $row['counterparty'] ?? null,
            $row['iban'] ?? null,
            $row['purpose'] ?? null,
            ! empty($row['bookedAt']) ? 'Zuordnung: '.$row['bookedAt'] : null,
        ])->filter()->join(' · ');

        return [$identity.($details !== '' ? "\n".$details : ''), ($row['date'] ?? '-')."\n".($row['dateLabel'] ?? 'Zahlungsbuchung'), $this->decimalMoney($row['amount'] ?? 0)];
    }

    private function summaryRow(array $row, string $label): array
    {
        return [$label, $this->decimalMoney($row['soll'] ?? 0), $this->decimalMoney($row['coverage'] ?? 0), $this->decimalMoney($row['open'] ?? 0)];
    }
}
