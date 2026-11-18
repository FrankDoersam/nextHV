<?php

namespace App\Reports;

use App\Reports\Support\OrganizationPdfDocument;
use App\Services\Documents\OrganizationDocumentProfile;

class ContractDepositPdfReport
{
    public function render(array $payload, string $contractLabel = ''): string
    {
        $deposit = (array) ($payload['data'] ?? []);
        $summary = (array) ($payload['summary'] ?? []);
        $rows = [
            ...array_map(fn ($row): array => ['type' => 'Einzahlung', ...((array) $row)], (array) ($deposit['installments'] ?? [])),
            ...array_map(fn ($row): array => ['type' => (($row['type'] ?? '') === 'retention' ? 'Einbehalt' : 'Auszahlung'), ...((array) $row)], (array) ($deposit['settlements'] ?? [])),
        ];

        $organization = app(OrganizationDocumentProfile::class)->current();
        $pdf = new class($organization, trim('Kautionsreport · '.$contractLabel)) extends OrganizationPdfDocument {
            public function Header(): void {}
        };

        $pdf->SetTitle($this->text('Kautionsreport '.$contractLabel));
        $pdf->SetMargins(18, 18, 18);
        $pdf->configureFooter(18.0);
        $pdf->SetAutoPageBreak(true, $pdf->minimumBottomMargin(24.0));
        $pdf->AddPage();

        $this->headline($pdf, 'Kautionsreport', $contractLabel ?: 'Mietkaution');
        $this->section($pdf, 'Vereinbarung');
        $this->infoRows($pdf, [
            ['Vertrag', $contractLabel ?: (string) ($deposit['contractId'] ?? '-')],
            ['Status', (string) ($deposit['status'] ?? 'Keine Vereinbarung')],
            ['Fällig ab', $this->date($deposit['dueFrom'] ?? null)],
            ['Rückzahlung geplant', $this->date($deposit['plannedRefundOn'] ?? null)],
            ['Referenz', (string) ($deposit['reference'] ?? '-')],
            ['Sicherungsform', $this->custody((string) ($deposit['custodyType'] ?? ''))],
            ['Verwahrkonto', (string) ($deposit['custodyAccountLabel'] ?? 'Nicht hinterlegt')],
            ['Getrennt angelegt', $this->date($deposit['segregatedOn'] ?? null)],
            ['Nachweis Verwahrung', (string) ($deposit['custodyEvidenceReference'] ?? '—')],
        ]);

        if (! empty($deposit['securityProvider']) || ! empty($deposit['securityPolicyNumber'])) {
            $this->section($pdf, 'Bürgschaft / Kautionsversicherung (keine Geldeinzahlung)');
            $this->infoRows($pdf, [
                ['Anbieter / Bürge', (string) ($deposit['securityProvider'] ?? '—')],
                ['Policen-/Urkundennr.', (string) ($deposit['securityPolicyNumber'] ?? '—')],
                ['Urkunde erhalten', $this->date($deposit['securityReceivedOn'] ?? null)],
                ['Gültig bis', $this->date($deposit['securityValidUntil'] ?? null)],
                ['Freigegeben', $this->date($deposit['securityReleasedOn'] ?? null)],
                ['Belegreferenz', (string) ($deposit['securityEvidenceReference'] ?? '—')],
            ]);
        }

        $this->section($pdf, 'Aktueller Buchungsstand');
        $this->summary($pdf, [
            ['Vereinbart', $this->money($summary['agreed'] ?? 0)],
            ['Angefordert', $this->money($summary['requested'] ?? 0)],
            ['Bezahlt', $this->money($summary['paid'] ?? 0)],
            ['Einzahlung offen', $this->money($summary['open'] ?? 0)],
            ['Verfügbar inkl. Zinsen', $this->money($summary['available'] ?? 0)],
            ['Auszahlung offen', $this->money($summary['refundOpen'] ?? 0)],
            ['Einbehaltsreserve', $this->money($summary['retained'] ?? 0)],
            ['Noch zu disponieren', $this->money($summary['remainingToAllocate'] ?? 0)],
        ]);

        $this->section($pdf, 'Kautionsbewegungen');
        $this->tableHeader($pdf, ['Typ', 'Vorgang', 'Fällig', 'Betrag', 'Offen'], [28, 74, 26, 23, 23]);
        if ($rows === []) {
            $this->tableRow($pdf, ['—', 'Keine Kautionsbewegungen vorhanden', '—', $this->money(0), $this->money(0)], [28, 74, 26, 23, 23]);
        }
        foreach ($rows as $row) {
            $label = (string) ($row['description'] ?? $row['label'] ?? (($row['installmentNumber'] ?? null) ? 'Rate '.$row['installmentNumber'] : '-'));
            $this->tableRow($pdf, [
                (string) ($row['type'] ?? '-'),
                $label,
                $this->date($row['dueDate'] ?? null),
                $this->money($row['amount'] ?? 0),
                $this->money($row['openAmount'] ?? 0),
            ], [28, 74, 26, 23, 23]);
        }

        if (isset($payload['period'])) {
            $this->section($pdf, 'Geldbewegungen und Verrechnungen');
            $this->infoRows($pdf, [
                ['Zeitraum', $this->date($payload['period']['from'] ?? null).' – '.$this->date($payload['period']['to'] ?? null)],
                ['Buchungsstand', 'Aktueller Stand, unabhängig vom ausgewählten Detailzeitraum'],
            ]);
            $headers = ['Valuta', 'Vorgang', 'Beleg / OP', 'Beschreibung', 'Betrag'];
            $widths = [25, 38, 35, 52, 24];
            $this->tableHeader($pdf, $headers, $widths);
            if (empty($payload['movements'])) {
                $this->tableRow($pdf, ['—', 'Keine Bewegungen', '—', '—', $this->money(0)], $widths, $headers);
            }
            foreach ($payload['movements'] ?? [] as $row) {
                $this->tableRow($pdf, [
                    $this->date($row['date'] ?? null),
                    $row['type'] ?? '—',
                    $row['reference'] ?? '—',
                    $row['description'] ?? '—',
                    $this->money($row['amount'] ?? 0),
                ], $widths, $headers);
            }
        }

        if (! empty($deposit['interestProjection'])) {
            $projection = $deposit['interestProjection'];
            $this->section($pdf, 'Zinsnachweis / Berechnung');
            $this->infoRows($pdf, [
                ['Berechnet bis', $this->date($projection['asOf'] ?? null)],
                ['Zinsberechnung', (string) ($projection['calculationMethod'] ?? '—')],
                ['Bankgebuchte Zinsen', $this->money($projection['postedInterest'] ?? 0)],
                ['Altbestand (ohne Datum)', $this->money($projection['legacyInterest'] ?? 0)],
                ['Zinsprognose', $this->money($projection['estimatedInterest'] ?? 0)],
                ['Differenz', $this->money($projection['differenceToRecorded'] ?? 0)],
                ['Fehlende Zinsperioden', ! empty($projection['missingRatePeriods']) ? 'Ja – Prognose nicht vollständig' : 'Keine'],
            ]);
            $rates = (array) ($deposit['interestRates'] ?? []);
            if ($rates) {
                $this->tableHeader($pdf, ['Ab Datum', 'Bankzinssatz p.a.', 'Nachweis'], [35, 50, 89]);
                foreach ($rates as $rate) {
                    $this->tableRow($pdf, [
                        $this->date($rate['effectiveFrom'] ?? null),
                        number_format((float) ($rate['annualRatePercent'] ?? 0), 5, ',', '.').' %',
                        $rate['reference'] ?? '—',
                    ], [35, 50, 89], ['Ab Datum', 'Bankzinssatz p.a.', 'Nachweis']);
                }
            }
            $pdf->Ln(2);
            $pdf->SetFont('Arial', '', 8);
            $pdf->MultiCell(0, 4, $this->text('Die Zinsprognose ist keine Bankbuchung. Maßgeblich sind die tatsächlich nachgewiesenen Kapitalerträge des insolvenzgeschützt angelegten Guthabens.'));
        }

        return $pdf->Output('S');
    }

    private function headline(OrganizationPdfDocument $pdf, string $title, string $subtitle): void
    {
        $pdf->SetFont('Arial', 'B', 9);
        $pdf->SetTextColor(37, 99, 235);
        $pdf->Cell(0, 5, $this->text(mb_strtoupper($subtitle)), 0, 1);
        $pdf->SetFont('Arial', 'B', 22);
        $pdf->SetTextColor(15, 23, 42);
        $pdf->Cell(0, 10, $this->text($title), 0, 1);
        $pdf->Ln(4);
    }

    private function section(OrganizationPdfDocument $pdf, string $title): void
    {
        if ($pdf->GetY() + 21.0 > $pdf->bodyBottom()) $pdf->AddPage();
        $pdf->Ln(5);
        $pdf->SetFont('Arial', 'B', 12);
        $pdf->SetTextColor(15, 23, 42);
        $pdf->Cell(0, 8, $this->text($title), 0, 1);
        $pdf->SetDrawColor(226, 232, 240);
        $pdf->Line(18, $pdf->GetY(), 192, $pdf->GetY());
        $pdf->Ln(2);
    }

    private function infoRows(OrganizationPdfDocument $pdf, array $rows): void
    {
        foreach ($rows as [$label, $value]) {
            $pdf->SetFont('Arial', '', 9);
            $pdf->SetTextColor(100, 116, 139);
            $pdf->Cell(42, 6, $this->text($label), 0, 0);
            $pdf->SetTextColor(15, 23, 42);
            $pdf->Cell(0, 6, $this->text((string) $value), 0, 1);
        }
    }

    private function summary(OrganizationPdfDocument $pdf, array $rows): void
    {
        foreach (array_chunk($rows, 4) as $chunk) {
            if ($pdf->GetY() + 19.0 > $pdf->bodyBottom()) $pdf->AddPage();
            foreach ($chunk as [$label, $value]) {
                $pdf->SetFont('Arial', '', 8);
                $pdf->SetTextColor(100, 116, 139);
                $pdf->Cell(43, 5, $this->text($label), 0, 0);
            }
            $pdf->Ln(5);
            foreach ($chunk as [$label, $value]) {
                $pdf->SetFont('Arial', 'B', 10);
                $pdf->SetTextColor(15, 23, 42);
                $pdf->Cell(43, 6, $this->text($value), 0, 0);
            }
            $pdf->Ln(8);
        }
    }

    private function tableHeader(OrganizationPdfDocument $pdf, array $headers, array $widths): void
    {
        if ($pdf->GetY() + 13.0 > $pdf->bodyBottom()) $pdf->AddPage();
        $pdf->SetFillColor(248, 250, 252);
        $pdf->SetDrawColor(226, 232, 240);
        $pdf->SetTextColor(100, 116, 139);
        $pdf->SetFont('Arial', 'B', 8);
        foreach ($headers as $index => $header) {
            $pdf->Cell($widths[$index], 7, $this->text($header), 1, 0, $index === count($headers) - 1 ? 'R' : 'L', true);
        }
        $pdf->Ln();
    }

    private function tableRow(OrganizationPdfDocument $pdf, array $values, array $widths, array $headers = ['Typ', 'Vorgang', 'Fällig', 'Betrag', 'Offen']): void
    {
        if ($pdf->GetY() + 6.0 > $pdf->bodyBottom()) {
            $pdf->AddPage();
            $this->tableHeader($pdf, $headers, $widths);
        }
        $pdf->SetFont('Arial', '', 8);
        $pdf->SetTextColor(15, 23, 42);
        foreach ($values as $index => $value) {
            $maxCharacters = max(12, (int) floor(($widths[$index] ?? 20) / 2.1));
            $pdf->Cell($widths[$index], 6, $this->text(mb_strimwidth((string) $value, 0, $maxCharacters, '…', 'UTF-8')), 1, 0, $index === count($values) - 1 ? 'R' : 'L');
        }
        $pdf->Ln();
    }

    private function custody(string $value): string
    {
        return match ($value) {
            'deposit_account' => 'Mietkautionskonto',
            'savings_account' => 'Sparkonto',
            'bank_guarantee' => 'Bankbürgschaft',
            'insurance_guarantee' => 'Kautionsversicherung',
            'pledged_savings' => 'Verpfändetes Mietersparbuch',
            'cash' => 'Barannahme (separate Anlage nachweisen)',
            'other' => 'Andere Vereinbarung',
            default => 'Nicht dokumentiert',
        };
    }

    private function money(mixed $value): string
    {
        return number_format((float) $value, 2, ',', '.').' €';
    }

    private function date(mixed $value): string
    {
        if (! $value) return '—';
        $time = strtotime((string) $value);
        return $time ? date('d.m.Y', $time) : (string) $value;
    }

    private function text(string $value): string
    {
        return iconv('UTF-8', 'windows-1252//TRANSLIT', $value) ?: $value;
    }
}
