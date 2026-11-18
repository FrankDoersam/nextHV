<?php

namespace App\Reports;

use App\Reports\Support\OrganizationPdfDocument;
use App\Reports\Support\OrganizationReport;

class ContractOverviewPdfReport extends OrganizationReport
{
    public function render(array $data): string
    {
        $number = (string) data_get($data, 'contract.number', '');
        $pdf = $this->document('Vertragsreport', 'Vertrag '.$number, 'Vertragsreport · '.$number, 'Vertragsübersicht zum '.$this->date($data['snapshotDate']));

        $this->intro($pdf, $data);
        $this->accountSummary($pdf, $data);
        $this->currentRent($pdf, $data['currentRent']);
        $this->recurringTrend($pdf, $data['recurringPayments']);
        $this->warnings($pdf, $data['warnings'] ?? []);
        $this->contract($pdf, $data);
        $this->parties($pdf, $data);
        $this->banks($pdf, $data['bankAccounts'] ?? []);
        $this->conditions($pdf, $data['conditions'] ?? []);
        $this->operatingCosts($pdf, $data['operatingCosts']);
        $this->deposit($pdf, $data);
        $this->paymentBehavior($pdf, $data['paymentBehavior']);
        $this->itemLedger($pdf, $data['itemLedger']);
        $this->dunning($pdf, $data['dunning']);

        return $pdf->Output('S');
    }

    private function intro(OrganizationPdfDocument $pdf, array $data): void
    {
        $this->paragraph($pdf, 'Vertrag '.data_get($data, 'contract.number', ''), 17, 'B', 7.5);
        $this->paragraph($pdf, collect([
            data_get($data, 'property.name'),
            data_get($data, 'unit.number') ? 'Einheit '.data_get($data, 'unit.number') : null,
            data_get($data, 'unit.typeLabel'),
        ])->filter()->join(' · '), 9, '', 4.8);
        if (data_get($data, 'property.address')) {
            $this->paragraph($pdf, (string) data_get($data, 'property.address'));
        }
        $pdf->Ln(3);
        $this->paragraph($pdf, 'Gesamtanalyse des Mietverhältnisses · Stand '.$this->date($data['snapshotDate']), 11, 'B', 5.7);
        $pdf->Ln(2);
        $this->paragraph($pdf, 'Vertrag, Kaution, Kontostand und Zahlungsmoral umfassen alle erfassten Jahre. Nur die OP-Einzelzeilen folgen der gewählten Darstellung. Sollstellungen ohne Buchung werden nicht geschätzt; Beträge zeigen den aktuellen Buchungsstand, keinen rückwirkend rekonstruierten Saldo.', 8.4, '', 4.5);
    }

    private function accountSummary(OrganizationPdfDocument $pdf, array $data): void
    {
        $summary = $data['currentOpenItems']['summary'];
        $widths = [69, 35, 35, 35];
        $repeat = $this->tableSection($pdf, 'Aktueller Kontostand', ['Stand bei Erstellung', 'Offene Forderungen', 'Offene Gutschriften', 'Saldo'], $widths);
        $this->tableRow($pdf, [
            $this->date($data['snapshotDate']).' · '.$summary['count'].' offene Posten',
            $this->money($summary['openDebitCents']),
            $this->money($summary['openCreditCents']),
            $this->money($summary['netOpenCents']),
        ], $widths, ['L', 'R', 'R', 'R'], true, $repeat);
        $pdf->Ln(2);
        $this->paragraph($pdf, 'Davon überfällige Forderungen: '.$this->money($summary['overdueDebitCents']).' · noch nicht überfällig: '.$this->money($summary['notYetDueDebitCents']).'.');
        if ($summary['unknownDueDebitCents'] > 0) {
            $this->paragraph($pdf, 'Forderungen ohne hinterlegte Fälligkeit: '.$this->money($summary['unknownDueDebitCents']).'.');
        }
        $this->paragraph($pdf, 'Saldo = offene Forderungen minus offene Gutschriften. Ein negativer Saldo bedeutet ein Guthaben. Kautionsforderungen sind enthalten; Mahnbelege werden nicht zusätzlich aufgeschlagen.');

        $rent = $data['recurringPayments']['summary'];
        $overall = $data['paymentBehavior']['summary'];
        $pdf->Ln(2);
        $rentShare = $rent['onTimeAllDuePercent'] === null ? 'nicht ermittelbar'
            : number_format((float) $rent['onTimeAllDuePercent'], 1, ',', '.').' %';
        $this->paragraph($pdf, 'Miete und Vorauszahlungen: '.$rent['onTimeCount'].' von '.$rent['dueCount']
            .' fälligen OP nachweislich pünktlich ('.$rentShare.'). Verspätet '.$rent['lateCount']
            .' · offen '.$rent['openCount'].' · nicht belegbar '.$rent['unverifiableCount'].'.', 8.5, 'B');
        $this->paragraph($pdf, 'Alle Forderungsarten (inkl. Kaution): '.$overall['dueCount']
            .' fällige OP · '.$overall['onTimeCount'].' pünktlich · '.$overall['lateCount']
            .' verspätet · '.$overall['unverifiableCount'].' nicht belegbar.', 7.8);
    }

    /** Twelve-column fixed-width status chart; chart segments count due rent/advance OPs, not transfers. */
    private function recurringTrend(OrganizationPdfDocument $pdf, array $insights): void
    {
        $this->section($pdf, 'Mietzahlungen · Verlauf der letzten 12 Monate');
        $this->paragraph($pdf, 'Die Säulen zeigen den Status der im jeweiligen Monat fälligen Miet- und Vorauszahlungs-OP. '
            .'Jede Säule stellt 100 % der dort erfassten OP dar; die Zahl darunter ist die Anzahl. '
            .'Kautionsforderungen sind nicht enthalten.', 7.7, '', 4.0);

        $months = $insights['months'];
        if (array_sum(array_column($months, 'dueCount')) === 0) {
            $this->paragraph($pdf, 'Im dargestellten Jahr wurden keine fälligen Miet- oder Vorauszahlungs-OP erfasst. '
                .'Aus fehlenden Sollstellungen wird keine Zahlungspünktlichkeit abgeleitet.', 7.7);
            return;
        }
        $this->ensure($pdf, 52);
        $top = $pdf->GetY() + 2.5;
        $barWidth = 10.5;
        $barHeight = 17.0;
        $stride = 14.5;
        $colors = [
            'onTimeCount' => [42, 82, 124],
            'lateCount' => [196, 139, 60],
            'openCount' => [175, 83, 75],
            'unverifiableCount' => [111, 122, 135],
        ];
        foreach ($months as $index => $month) {
            $x = self::LEFT + $index * $stride + 2.0;
            $count = (int) $month['dueCount'];
            $pdf->SetFillColor(238, 240, 243);
            $pdf->Rect($x, $top, $barWidth, $barHeight, 'F');
            if ($count > 0) {
                $drawn = 0.0;
                foreach ($colors as $field => $rgb) {
                    $share = (int) $month[$field] / $count;
                    $height = $barHeight * $share;
                    if ($height <= 0) continue;
                    $pdf->SetFillColor(...$rgb);
                    $pdf->Rect($x, $top + $barHeight - $drawn - $height, $barWidth, $height, 'F');
                    $drawn += $height;
                }
            }
            $pdf->SetFont('Arial', '', 6.9);
            $pdf->SetTextColor(63, 69, 76);
            $pdf->SetXY($x - 1, $top + $barHeight + 1);
            $pdf->Cell($barWidth + 2, 3.7, $pdf->encodeText($month['label']), 0, 0, 'C');
            $pdf->SetXY($x - 1, $top + $barHeight + 5);
            $pdf->Cell($barWidth + 2, 3.7, $pdf->encodeText($count ? $count.' OP' : '-'), 0, 0, 'C');
        }

        $legend = [
            ['Pünktlich', 'onTimeCount'], ['Verspätet', 'lateCount'],
            ['Offen', 'openCount'], ['Nicht belegbar', 'unverifiableCount'],
        ];
        $legendY = $top + 28.0;
        foreach ($legend as $index => [$label, $key]) {
            $x = self::LEFT + $index * 43.5;
            $pdf->SetFillColor(...$colors[$key]);
            $pdf->Rect($x, $legendY + 1, 3.4, 3.4, 'F');
            $pdf->SetFont('Arial', '', 7.3);
            $pdf->SetTextColor(65, 72, 79);
            $pdf->SetXY($x + 5.2, $legendY);
            $pdf->Cell(37, 5.4, $pdf->encodeText($label));
        }
        $pdf->SetY($legendY + 9);
        $this->paragraph($pdf, 'Monate ohne erzeugte Sollstellungen bleiben leer und sind ausdrücklich keine bestätigten Zahlungen. '
            .'Die vollständige Zahlungsbewertung reicht über diese zwölf Monate hinaus.', 7.4, '', 3.8);
    }

    private function warnings(OrganizationPdfDocument $pdf, array $warnings): void
    {
        if ($warnings === []) {
            return;
        }
        $this->section($pdf, 'Datenhinweise');
        foreach ($warnings as $warning) {
            $this->paragraph($pdf, (string) $warning['message']);
            $pdf->Ln(1);
        }
    }

    private function contract(OrganizationPdfDocument $pdf, array $data): void
    {
        $contract = $data['contract'];
        $rows = [
            ['Vertragsart / Status', $contract['typeLabel'].' · '.$contract['statusLabel']],
            ['Objekt / Einheit', collect([data_get($data, 'property.number'), data_get($data, 'unit.number'), data_get($data, 'unit.typeLabel')])->filter()->join(' · ') ?: 'Nicht hinterlegt'],
            ['Einheitenzuordnung', $this->validity(data_get($data, 'unit.validFrom'), data_get($data, 'unit.validUntil'))],
            ['Vertragsabschluss', $this->displayDate($contract['concludedOn'])],
            ['Mietbeginn / bestätigtes Ende', $this->displayDate($contract['startsOn']).' / '.$this->displayDate($contract['confirmedEndOn'])],
            ['Laufzeit', $contract['termTypeLabel']],
            ['Mindestlaufzeit / Kündigungsfrist', $this->months($contract['minimumTermMonths']).' / '.$this->months($contract['noticePeriodMonths'])],
            ['Mietanpassung', $contract['rentAdjustmentModelLabel']],
            ['Übergabe / Rückgabe', $this->displayDate($contract['handedOverAt']).' / '.$this->displayDate($contract['returnedAt'])],
        ];
        if ($contract['termination']) {
            $termination = $contract['termination'];
            $rows[] = ['Kündigung / ausgehend von', $termination['typeLabel'].' · '.$termination['initiatedByLabel']];
            $rows[] = ['Zugang / Grundkategorie', $this->displayDate($termination['receivedOn']).' · '.$termination['reasonLabel']];
            $rows[] = ['Gewünschtes / rechnerisches Ende', $this->displayDate($termination['requestedEndOn']).' / '.$this->displayDate($termination['systemDeterminedEndOn'])];
            $rows[] = ['Bestätigtes Ende / Rückgabe', $this->displayDate($termination['confirmedEndOn']).' / '.$this->displayDate($contract['returnedAt'])];
        } else {
            $rows[] = ['Kündigung', 'Keine Kündigung hinterlegt'];
        }
        $this->keyValues($pdf, 'Vertragsdaten und Laufzeit', $rows);
    }

    /** Contractual recurring rates at generation date, never cash receipts. */
    /** Compact current contractual rent, keeping recurring values separate from paid money. */
    private function currentRent(OrganizationPdfDocument $pdf, ?array $rent): void
    {
        if (! $rent || ! $rent['monthly']) {
            $this->section($pdf, 'Mietkondition');
            $this->paragraph($pdf, $rent ? 'Einmalige Kondition – keine laufende Monatsmiete.'
                : 'Keine aktuell gültige Mietkondition hinterlegt.');
            return;
        }
        $month = $rent['monthly'];
        $year = $rent['yearly'];
        $rows = [['Grundmiete', 'baseRentCents']];
        $supplements = $month['coldRentCents'] - $month['baseRentCents'];
        if ($supplements !== 0) $rows[] = ['Weitere Kaltmietbestandteile', 'coldSupplements'];
        if ($supplements !== 0) $rows[] = ['Kaltmiete gesamt', 'coldRentCents'];
        if ($month['operatingCostsCents'] !== 0) $rows[] = ['Betriebskosten-Vorauszahlung', 'operatingCostsCents'];
        if ($month['heatingCostsCents'] !== 0) $rows[] = ['Heizkosten-Vorauszahlung', 'heatingCostsCents'];
        $rows[] = ['Gesamtmiete inkl. Nebenkosten', 'totalCents'];

        $widths = [76, 49, 49];
        $repeat = $this->tableSection($pdf, 'Aktuelle Miete · Monat / Jahr', ['Bestandteil', 'Pro Monat', 'Pro Jahr'], $widths, ['L', 'R', 'R']);
        foreach ($rows as [$label, $key]) {
            $monthly = $key === 'coldSupplements' ? $supplements : $month[$key];
            $yearly = $key === 'coldSupplements' ? $year['coldRentCents'] - $year['baseRentCents'] : $year[$key];
            $this->tableRow($pdf, [$label, $this->money($monthly), $this->money($yearly)],
                $widths, ['L', 'R', 'R'], $key === 'totalCents', $repeat);
        }
        $this->paragraph($pdf, 'Vereinbarte Rate ab '.$this->displayDate($rent['validFrom']).' · kein Zahlungseingang. Jahreswerte sind hochgerechnete laufende Raten.', 7.5, '', 3.9);
    }

    private function parties(OrganizationPdfDocument $pdf, array $data): void
    {
        $rows = $data['parties'] ?? [];
        if ($rows === []) {
            $this->section($pdf, 'Vertragsparteien');
            $this->paragraph($pdf, 'Keine Vertragsparteien hinterlegt.');

            return;
        }
        $widths = [73, 40, 61];
        $repeat = $this->tableSection($pdf, 'Vertragsparteien', ['Name', 'Rolle / Stand', 'Gültigkeit'], $widths, ['L', 'L', 'L']);
        foreach ($rows as $row) {
            $state = $row['isCurrent'] ? 'Aktuell' : (($row['validFrom'] ?? '') > $data['snapshotDate'] ? 'Geplant' : 'Historisch');
            $this->tableRow($pdf, [$row['name'], $row['roleLabel']."\n".$state, $this->validity($row['validFrom'], $row['validUntil'])], $widths, ['L', 'L', 'L'], false, $repeat);
        }
    }

    private function banks(OrganizationPdfDocument $pdf, array $accounts): void
    {
        if ($accounts === []) {
            $this->section($pdf, 'Bankverbindungen');
            $this->paragraph($pdf, 'Kein Zahlungsempfänger- oder Auszahlungskonto hinterlegt.');

            return;
        }
        $rows = [];
        foreach ($accounts as $account) {
            $details = collect([
                $account['accountHolder'],
                $account['bankName'],
                $account['iban'] !== '' ? 'IBAN: '.$account['iban'] : 'IBAN nicht hinterlegt',
                ! empty($account['bic']) ? 'BIC: '.$account['bic'] : null,
                $this->validity($account['validFrom'], $account['validUntil']),
                $account['isCurrent'] ? 'Aktuell gültig' : 'Außerhalb des Gültigkeitszeitraums',
            ])->filter()->join("\n");
            $rows[] = [$account['label'], $details];
        }
        $this->keyValues($pdf, 'Bankverbindungen', $rows);
    }

    private function conditions(OrganizationPdfDocument $pdf, array $conditions): void
    {
        $this->section($pdf, 'Konditionshistorie');
        if ($conditions === []) {
            $this->paragraph($pdf, 'Keine Konditionen hinterlegt.');
            return;
        }
        if (count($conditions) === 1) {
            $only = $conditions[0];
            $this->paragraph($pdf, 'Eine gespeicherte Konditionsfassung ab '.$this->displayDate($only['validFrom'])
                .' ('.$only['paymentIntervalLabel'].') · keine weitere Anpassung erfasst. '
                .'Beträge der laufenden Kondition stehen im Mietüberblick.');
            return;
        }
        $this->paragraph($pdf, count($conditions).' Vertragsfassungen · Beträge jeweils pro vereinbartem Zahlungsintervall, keine tatsächlichen Einnahmen.', 7.7);
        $widths = [47, 28, 33, 33, 33];
        $entries = array_map(fn (array $row): array => $this->conditionEntry($row), $conditions);
        $repeat = $this->tableSection($pdf, 'Vereinbarte Beträge je Intervall', ['Gültigkeit / Stand', 'Intervall', 'Kaltmiete', 'Nebenkosten', 'Gesamt'], $widths, ['L', 'L', 'R', 'R', 'R'], $entries[0]['values'], $this->conditionNotesHeight($pdf, $entries[0]['notes']));
        foreach ($entries as $entry) {
            $height = $this->tableRowLayout($pdf, $entry['values'], $widths, false, 8)['height'] + $this->conditionNotesHeight($pdf, $entry['notes']);
            $this->ensure($pdf, $height, $repeat);
            $this->tableRow($pdf, $entry['values'], $widths, ['L', 'L', 'R', 'R', 'R'], false, $repeat);
            foreach ($entry['notes'] as $note) {
                $this->paragraph($pdf, $note, 7.6, '', 3.7, $repeat);
            }
            $pdf->Ln(1.5);
        }
    }

    private function conditionEntry(array $row): array
    {
        $amounts = $row['amounts'];
        $state = match ($row['state']) {
            'current' => 'Aktuell', 'planned' => 'Geplant', default => 'Historisch',
        };
        $parts = [];
        foreach (['baseRentCents' => 'Grundmiete', 'garageCents' => 'Garage', 'parkingCents' => 'Stellplatz', 'otherCents' => 'Sonstiges', 'operatingCostsCents' => 'Betriebskosten', 'heatingCostsCents' => 'Heizkosten'] as $key => $label) {
            if ($amounts[$key] !== 0) {
                $parts[] = $label.' '.$this->money($amounts[$key]);
            }
        }

        $notes = ['Änderung: '.$row['changeReasonLabel']];
        if ($row['paymentInterval'] === 'one_time') {
            $notes[] = 'Einmaliger Betrag, kein laufender Mietzins';
        }

        return [
            'values' => [$this->validity($row['validFrom'], $row['validUntil'])."\n".$state, $row['paymentIntervalLabel'], $this->money($amounts['coldRentCents']), $this->money($amounts['serviceChargesCents']), $this->money($amounts['totalCents'])],
            'notes' => array_values(array_filter($notes)),
        ];
    }

    private function conditionNotesHeight(OrganizationPdfDocument $pdf, array $notes): float
    {
        $pdf->SetFont('Arial', '', 7.6);

        return array_sum(array_map(fn (string $note): float => count($this->wrap($pdf, $note, self::WIDTH)) * 3.7, $notes)) + 0.3;
    }

    /** Separate cash-paid advances from real ancillary charge and credit OPs. */
    private function operatingCosts(OrganizationPdfDocument $pdf, array $data): void
    {
        $this->section($pdf, 'Betriebs- und Heizkosten · Zahlungsnachweis');
        $this->paragraph($pdf, 'Erfasste Vorauszahlungs- und Abrechnungs-OP nach Leistungsjahr, unabhängig vom Zahlungseingangsdatum. Nicht gebuchte Abrechnungen werden nicht geschätzt.', 7.7);
        if ($data['rows'] === []) {
            $this->paragraph($pdf, 'Keine zugehörigen Vorauszahlungs- oder Abrechnungs-OP gebucht.');
            return;
        }
        $widths = [29, 35, 37, 36, 37];
        $repeat = $this->tableSection($pdf, 'Nebenkostenvorauszahlungen', ['Jahr', 'Soll', 'Eingezahlt', 'Offen', 'Status'], $widths, ['L', 'R', 'R', 'R', 'L']);
        foreach ($data['rows'] as $row) {
            $state = $row['advanceDueCents'] === 0 ? 'Kein OP' : ($row['advanceOpenCents'] > 0 ? 'Teil / offen' : 'OP ausgeglichen');
            $this->tableRow($pdf, [$row['year'], $this->money($row['advanceDueCents']), $this->money($row['advanceReceivedCents']), $this->money($row['advanceOpenCents']), $state], $widths, ['L', 'R', 'R', 'R', 'L'], false, $repeat);
        }
        $this->tableRow($pdf, ['Gesamt', $this->money($data['totals']['advanceDueCents']), $this->money($data['totals']['advanceReceivedCents']), $this->money($data['totals']['advanceOpenCents']), ''], $widths, ['L', 'R', 'R', 'R', 'L'], true, $repeat);
        $totals = $data['totals'];
        if ($totals['settlementDueCents'] === 0 && $totals['creditDueCents'] === 0) {
            $this->paragraph($pdf, 'Keine Betriebskosten-Nachforderungen oder Abrechnungsguthaben als OP erfasst.', 7.7);
            return;
        }
        $secondWidths = [27, 30, 30, 29, 29, 29];
        $repeat = $this->tableSection($pdf, 'Abrechnungen · Nachzahlung und Guthaben', ['Jahr', 'Nachzahlung Soll', 'Eingegangen', 'Noch offen', 'Guthaben Soll', 'Ausgezahlt'], $secondWidths, ['L', 'R', 'R', 'R', 'R', 'R']);
        foreach ($data['rows'] as $row) {
            $this->tableRow($pdf, [
                $row['year'],
                $this->money($row['settlementDueCents']), $this->money($row['settlementReceivedCents']),
                $this->money($row['settlementOpenCents']), $this->money($row['creditDueCents']),
                $this->money($row['creditPaidOutCents']),
            ], $secondWidths, ['L', 'R', 'R', 'R', 'R', 'R'], false, $repeat, 7.5);
            if ($row['creditOpenCents'] > 0) {
                $this->paragraph($pdf, '  Guthaben noch nicht ausgezahlt: '.$this->money($row['creditOpenCents']), 7.5, '', 3.7, $repeat);
            }
        }
        $totals = $data['totals'];
        $this->tableRow($pdf, ['Gesamt', $this->money($totals['settlementDueCents']), $this->money($totals['settlementReceivedCents']), $this->money($totals['settlementOpenCents']), $this->money($totals['creditDueCents']), $this->money($totals['creditPaidOutCents'])], $secondWidths, ['L', 'R', 'R', 'R', 'R', 'R'], true, $repeat, 7.5);
        $this->paragraph($pdf, 'Abrechnungsguthaben insgesamt noch offen: '.$this->money($totals['creditOpenCents']).'. Diese Positionen sind im OP-Saldo berücksichtigt; Verrechnung ist nicht mit einer Bankauszahlung gleichzusetzen.');
    }

    private function deposit(OrganizationPdfDocument $pdf, array $data): void
    {
        $deposit = $data['deposit'];
        $ledger = $data['depositLedger'];
        if (! $deposit || ! $ledger) {
            $this->section($pdf, 'Kaution');
            $this->paragraph($pdf, 'Keine Kautionsvereinbarung hinterlegt.');
            return;
        }
        $summary = $ledger['summary'];
        $money = fn (int $cents): string => $deposit['currency'] === 'EUR'
            ? $this->money($cents) : str_replace(' €', ' '.$deposit['currency'], $this->money($cents));
        $rows = [
            ['Vereinbart / Status', $money($deposit['agreedCents']).' · '.$deposit['statusLabel']],
            ['Sicherungsform', $deposit['custodyTypeLabel'].' · Anlage '.$this->displayDate($deposit['segregatedOn'] ?? null)],
            ['Rate / Fälligkeit', $deposit['installmentCount'].' × '.$money($deposit['installmentAmountCents']).' · ab '.$this->displayDate($deposit['dueFrom'])],
            ['Erzeugte Forderungen / OP-offen (EUR)', $this->money($summary['requestedCents']).' / '.$this->money($summary['openCents'])],
            ['Belegte Einzahlungen (EUR)', $this->money($summary['actualIncomingCents'])],
            ['Belegte Auszahlungen / noch offen (EUR)', $this->money($summary['actualOutgoingCents']).' / '.$this->money($summary['refundOpenCents'])],
            ['Rücklage / mit OP verrechnet (EUR)', $this->money($summary['retainedCents']).' / '.$this->money($summary['offsetCents'])],
            ['Zinsen in Vertragswährung / verfügbar (EUR)', $money($deposit['interestCents']).' / '.$this->money($summary['availableCents'])],
        ];
        if ($summary['unverifiedReceiptCents'] > 0) {
            $rows[] = ['Belege fehlen für erledigte OP (EUR)', $this->money($summary['unverifiedReceiptCents'])];
        }
        if ($summary['refundCommittedCents'] > $summary['actualOutgoingCents']) {
            $rows[] = ['Auszahlung verfügt / OP-seitig ausgeglichen (EUR)',
                $this->money($summary['refundCommittedCents']).' / '.$this->money($summary['refundedCents'])];
        }
        if ($summary['remainingToAllocateCents'] > 0 || $summary['remainingToRefundCents'] > 0) {
            $rows[] = ['Noch zu disponieren / zur Rückzahlung übrig (EUR)',
                $this->money($summary['remainingToAllocateCents']).' / '.$this->money($summary['remainingToRefundCents'])];
        }
        if ($deposit['plannedRefundOn'] || $deposit['refundedOn']) {
            $rows[] = ['Rückzahlung geplant / erfasst',
                $this->displayDate($deposit['plannedRefundOn']).' / '.$this->displayDate($deposit['refundedOn'])];
        }
        $this->keyValues($pdf, 'Kaution · Sicherheit und tatsächliche Bewegungen', $rows);
        $this->paragraph($pdf, 'Ein als ausgeglichen gebuchter Kautions-OP ist ohne Zahlungsbeleg keine Einzahlung. '
            .'Reserve und OP-Verrechnung sind keine Bankauszahlung. Externe Bürgschaften werden nicht als Geldzufluss gewertet.', 7.6, '', 3.9);
        if ($ledger['movements'] === []) {
            return;
        }
        $widths = [29, 53, 58, 34];
        $repeat = $this->tableSection($pdf, 'Kautionsbewegungen · gesamte Historie', ['Valuta', 'Vorgang', 'OP / Referenz', 'Betrag'], $widths, ['L', 'L', 'L', 'R']);
        foreach ($ledger['movements'] as $row) {
            $this->tableRow($pdf, [$this->displayDate($row['date']), $row['type'],
                $row['reference'] ?: '–', $this->money($row['amountCents'])],
                $widths, ['L', 'L', 'L', 'R'], false, $repeat);
        }
    }

    private function paymentBehavior(OrganizationPdfDocument $pdf, array $behavior): void
    {
        $summary = $behavior['summary'];
        $this->section($pdf, 'Zahlungsmoral · alle erfassten Forderungsarten');
        $this->paragraph($pdf, 'Vollständige Historie zum Erstellungsstand, auch Kaution und Sonderforderungen. '
            .'Gutschriften, Reserven und zukünftige Fälligkeiten sind keine Mietrückstände; die Monatsgrafik betrachtet nur Miete und Vorauszahlungen.', 7.8);
        $share = $summary['onTimeSharePercent'] === null ? 'Nicht ermittelbar'
            : number_format((float) $summary['onTimeSharePercent'], 1, ',', '.').' %';
        $allShare = $summary['onTimeAllDuePercent'] === null ? 'Nicht ermittelbar'
            : number_format((float) $summary['onTimeAllDuePercent'], 1, ',', '.').' %';
        $this->keyValues($pdf, 'Nachweisliche OP-Zahlungsbewertung', [
            ['Fällige / davon belegbar vollständig erledigte OP',
                $summary['dueCount'].' / '.$summary['verifiableSettledCount']],
            ['Pünktlich / verspätet', $summary['onTimeCount'].' / '.$summary['lateCount']],
            ['Pünktlich über alle fälligen OP', $allShare],
            ['Pünktlich innerhalb belegter Ausgleiche', $share],
            ['Offen / davon überfällig', $summary['openCount'].' / '.$summary['overdueOpenCount']],
            ['Nicht belegbar / Fälligkeit fehlt', $summary['unverifiableCount'].' / '.$summary['missingDueCount']],
            ['Noch nicht fällig', (string) $summary['futureDueCount']],
            ['Median / spätester Vollausgleich', $this->timing($summary['medianSettlementDelayDays'])
                .' / '.$this->timing($summary['maxSettlementDelayDays'])],
        ]);
        $this->paragraph($pdf, 'Quote über alle fälligen OP = nachweislich pünktliche OP / alle fälligen OP. '
            .'Die zweite Quote verwendet nur belegbar vollständig ausgeglichene OP als Nenner. '
            .'Wertstellung vor Buchungsdatum; Teilzahlungen werden erst beim Vollausgleich bewertet. '
            .'Offene und unbelegbare Fälle bleiben zusätzlich ausgewiesen.', 7.5, '', 3.9);
    }

    private function itemLedger(OrganizationPdfDocument $pdf, array $ledger): void
    {
        $summary = $ledger['summary'];
        $this->section($pdf, 'OP-Nachweise · '.$ledger['detailScopeLabel']);
        $this->paragraph($pdf, 'Gesamtes Vertragskonto: '.$ledger['totalCount'].' erfasste OP, davon '
            .$summary['paidCount'].' erledigt, '.$summary['partialCount'].' teilbeglichen, '
            .$summary['openCount'].' offen und '.$summary['cancelledCount'].' storniert. '
            .'Einzelbelege angezeigt: '.$ledger['visibleCount'].'; weggelassen: '.$ledger['omittedCount'].'.', 8, 'B');
        if ($ledger['detailScope'] === 'last12' || $ledger['detailScope'] === 'last24') {
            $this->paragraph($pdf, 'Einzelbelege mit Fälligkeit ab '.$this->date($ledger['windowFrom'])
                .' sowie '.$ledger['exceptionOutsideWindowCount'].' Auffälligkeiten außerhalb des Fensters. '
                .'Offene, stornierte, verspätete und nicht belegbare OP bleiben immer sichtbar.', 7.6);
        }
        if ($ledger['rows'] === []) {
            $this->paragraph($pdf, $ledger['totalCount'] === 0
                ? 'Keine OP zu diesem Vertrag erfasst.'
                : 'Keine Auffälligkeiten. Alle regulären, vollständig ausgeglichenen OP bleiben in den Gesamtkennzahlen enthalten. '
                    .'Für Einzelnachweise die OP-Auswahl in der PDF-Vorschau auf 12/24 Monate oder Alle umstellen.', 8);
            return;
        }
        $widths = [47, 27, 25, 25, 25, 25];
        $repeat = $this->tableSection($pdf, 'Gebuchte OP · Detailauswahl', ['Beleg / Bereich / Status', 'Fällig', 'Soll', 'Erledigt', 'Geldfluss', 'Offen'],
            $widths, ['L', 'L', 'R', 'R', 'R', 'R']);
        foreach ($ledger['rows'] as $row) {
            $desc = $row['number']."\n".$row['costAreaLabel'].' · '.$row['state'];
            $this->tableRow($pdf, [
                $desc, $this->displayDate($row['dueDate']),
                $this->money($row['amountCents']), $this->money($row['coveredCents']),
                $this->money($row['cashCents']), $this->money($row['openCents']),
            ], $widths, ['L', 'L', 'R', 'R', 'R', 'R'], false, $repeat, 7.4);
            $needsEvidence = $ledger['detailScope'] === 'all'
                || $row['cancelled'] || $row['openCents'] !== 0
                || $row['coveredCents'] !== $row['cashCents']
                || in_array($row['state'], ['Verspätet bezahlt', 'Ausgleich nicht belegbar'], true);
            if (! $needsEvidence) continue;
            foreach ($row['movements'] as $movement) {
                $this->paragraph($pdf, '  '.($movement['date'] ? $this->date($movement['date']) : 'Datum fehlt')
                    .' · '.($movement['paymentNumber'] ?: 'Keine Zahlungsnummer')
                    .' · '.$movement['label'].' · '.$this->money($movement['amountCents']),
                    7.1, '', 3.6, $repeat);
            }
        }
        $this->paragraph($pdf, 'Erledigt und offen = OP-Buchungsstand; Geldfluss = belegte, zugeordnete Zahlungen. '
            .'Gutschriften und Auszahlungen erscheinen negativ. Einbehaltsreserven sind keine Zahlung.', 7.5, '', 3.8);
    }

    private function dunning(OrganizationPdfDocument $pdf, array $dunning): void
    {
        $this->section($pdf, 'Mahnhistorie');
        $summary = $dunning['summary'];
        if (($dunning['rows'] ?? []) === []) {
            $this->paragraph($pdf, 'Keine Mahnungen hinterlegt.');
            return;
        }
        $this->paragraph($pdf, $summary['count'].' historische Belege, davon '.$summary['cancelledCount']
            .' storniert. Mahnsummen sind Dokumentstände und dürfen nicht noch einmal auf den offenen OP-Saldo aufgeschlagen werden.', 7.8);
        $widths = [49, 30, 30, 30, 35];
        $repeat = $this->tableSection($pdf, 'Mahnbelege', ['Beleg / Stufe / Status', 'Ausgestellt / Zahlungsziel', 'Hauptforderung', 'Gebühr', 'Belegsumme'], $widths, ['L', 'L', 'R', 'R', 'R']);
        foreach ($dunning['rows'] as $row) {
            $identity = $row['number']."\n".$row['levelLabel'].' · '.$row['statusLabel'];
            if ($row['cancelledAt']) {
                $identity .= "\nStorno ".$this->date($row['cancelledAt']);
            }
            $this->tableRow($pdf, [
                $identity,
                $this->displayDate($row['issuedOn'])."\n".$this->displayDate($row['paymentDueOn']),
                $this->money($row['principalCents']),
                $this->money($row['feeCents']),
                $this->money($row['totalCents']),
            ], $widths, ['L', 'L', 'R', 'R', 'R'], false, $repeat);
        }
    }

    private function keyValues(OrganizationPdfDocument $pdf, string $title, array $rows): void
    {
        $widths = [69, 105];
        $repeat = $this->tableSection($pdf, $title, ['Merkmal', 'Angabe'], $widths, ['L', 'L'], $rows[0] ?? null);
        foreach ($rows as $row) {
            $this->tableRow($pdf, $row, $widths, ['L', 'L'], false, $repeat);
        }
    }

    private function validity(?string $from, ?string $to): string
    {
        return ($from ? 'Ab '.$this->date($from) : 'Beginn nicht hinterlegt').($to ? ' bis '.$this->date($to) : ' · ohne Enddatum');
    }

    private function months(?int $months): string
    {
        return $months === null ? 'Nicht hinterlegt' : $months.' Monate';
    }

    private function timing(float|int|null $days): string
    {
        if ($days === null) {
            return 'Nicht ermittelbar';
        }
        if ($days == 0) {
            return 'Am Fälligkeitstag';
        }
        $number = number_format(abs($days), floor(abs($days)) === (float) abs($days) ? 0 : 1, ',', '.');

        return $number.' '.(abs($days) === 1 || abs($days) === 1.0 ? 'Tag' : 'Tage').($days < 0 ? ' vor Fälligkeit' : ' nach Fälligkeit');
    }
}
