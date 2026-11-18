<?php

namespace App\Reports\Concerns;

use App\Support\Formatting\OperatingCostDisplayFormatter;

trait OperatingCostStatementPdfPages
{
    private function overviewPage(): void
    {
        $this->detailPage('Einzelaufstellung der Betriebskosten');
        $this->positionHeader('Bezeichnung', 'Betrag');

        $rows = $this->overviewRows();
        if ($rows === []) {
            $this->positionRow(
                'Keine Nebenkostenpositionen vorhanden',
                'Im gespeicherten Snapshot wurden keine allgemeinen Nebenkosten, Detailabrechnungen oder Leistungen gefunden.',
                0,
            );
        } else {
            foreach ($rows as $row) {
                $this->positionRow($row['title'], $row['subtitle'], $row['amount']);
            }
        }

        $this->positionTotal('Betriebskosten gesamt', (float) data_get($this->data, 'summary.costTotal', 0));
    }

    private function waterPage(): void
    {
        $this->detailPage('Übersicht der Wasserkosten');

        $meterRows = $this->meterRelationMatrixRows(
            ['water', 'hot_water', 'garden'],
            ['wasser', 'garten'],
        );
        if ($meterRows !== []) {
            $this->tableSection('Zählerstände', $this->meterRelationMatrixColumns(), $meterRows);
            $this->waterMeterConsumptionTotal($meterRows, $this->meterRelationMatrixRows(['water', 'hot_water', 'garden'], ['wasser', 'garten'], true));
            $waterGroups = collect((array) data_get($this->data, 'allocation.meters', []))
                ->only(['water', 'garden']);
            $excluded = $waterGroups->sum(fn (array $group): float => (float) ($group['wastewaterExcludedOwn'] ?? 0));
            if ($excluded > 0.0005) {
                $this->paragraph(
                    'Schmutzwasser-Abzug: '.OperatingCostDisplayFormatter::cubicMeters($excluded)
                    .' laut Zählerkennzeichnung (weiterhin im Frischwasserverbrauch enthalten).',
                    4.1, 8.0,
                );
            }
            $this->paragraph('Wassermengen in m³: drei Nachkommastellen. Gemeinschaftsanteile aus ungerundeten Werten; geringe Rundungsdifferenzen sind möglich.', 4.1, 8.0);
            $this->Ln(1.0);
        }

        $this->sectionCaption('Kosten für Wasser und Abwasser');
        $this->positionHeader('Position', 'Betrag');
        $rows = collect((array) ($this->data['costs'] ?? []))->where('category', 'water')->values();

        if ($rows->isEmpty()) {
            $this->positionRow('Keine Wasserkosten vorhanden', 'Im gespeicherten Snapshot wurden keine Wasserpositionen gefunden.', 0);
        } else {
            foreach ($rows as $row) {
                $row = (array) $row;
                $this->positionRow(
                    $this->waterPositionTitle($row),
                    $this->waterCostSubtitle($row),
                    (float) ($row['allocatedAmount'] ?? 0),
                );
            }
        }

        $this->positionTotal('Wasser und Abwasser gesamt', $rows->sum(fn ($row): float => (float) ($row['allocatedAmount'] ?? 0)));
    }

    private function wastePage(): void
    {
        $this->detailPage('Übersicht der Müllkosten');
        $waste = collect((array) ($this->data['costs'] ?? []))
            ->filter(fn ($row): bool => ($row['category'] ?? null) === 'waste' && ($row['sourceType'] ?? null) !== 'direct_allocation')
            ->values();

        if ($waste->isEmpty()) {
            $this->positionHeader('Position', 'Betrag');
            $this->positionRow('Keine Müllkosten vorhanden', 'Für den Abrechnungszeitraum wurden keine Mülltonnen, Leerungen oder Müllrechnungen ermittelt.', 0);
        } else {
            foreach ($waste->groupBy(fn ($row): string => $this->wasteGroupLabel((array) $row)) as $label => $rows) {
                $this->sectionCaption($label);
                $this->positionHeader('Position', 'Betrag');
                foreach ($rows as $row) {
                    $row = (array) $row;
                    $this->positionRow(
                        $this->wastePositionTitle($row),
                        $this->wasteCostSubtitle($row),
                        (float) ($row['allocatedAmount'] ?? 0),
                    );
                }
            }
        }

        $this->positionTotal(
            'Müllentsorgung gesamt',
            $waste
                ->unique(fn ($row) => ($row['sourceType'] ?? '').':'.($row['sourceId'] ?? '').':'.($row['allocationKey'] ?? ''))
                ->sum(fn ($row): float => (float) ($row['allocatedAmount'] ?? 0)),
        );
    }

    private function servicesPage(): void
    {
        $this->detailPage('Leistungen und Direktumlagen');
        $rows = $this->directServiceRows();

        $this->positionHeader('Position', 'Betrag');
        if ($rows->isEmpty()) {
            $this->positionRow('Keine Leistungen vorhanden', 'Im Abrechnungszeitraum wurden keine zusätzlichen Leistungen oder Direktumlagen ermittelt.', 0);
        } else {
            foreach ($rows as $row) {
                $row = (array) $row;
                $this->positionRow(
                    $this->servicePositionTitle($row),
                    $this->serviceCostSubtitle($row),
                    (float) ($row['allocatedAmount'] ?? 0),
                );
            }
        }

        $this->positionTotal('Leistungen und Direktumlagen gesamt', $rows->sum(fn ($row): float => (float) ($row['allocatedAmount'] ?? 0)));
    }

    private function heatingPage(): void
    {
        $this->detailPage('Übersicht der Heizkosten');

        $meterRows = $this->meterRelationMatrixRows(
            ['heating', 'hot_water'],
            ['heiz', 'wärme', 'waerme', 'warmwasser'],
        );
        if ($meterRows !== []) {
            $this->tableSection('Zählerstände', $this->meterRelationMatrixColumns(), $meterRows);
        }

        $rows = collect((array) ($this->data['costs'] ?? []))->where('category', 'heating')->values();
        $this->tableSection('Heizkosten-Aufstellung der Liegenschaft', [
            ['label' => 'Energiekosten', 'width' => 76, 'align' => 'L'],
            ['label' => 'Konto', 'width' => 31, 'align' => 'L'],
            ['label' => 'Gesamtkosten', 'width' => 34, 'align' => 'R'],
            ['label' => 'Mein Anteil', 'width' => 34, 'align' => 'R'],
        ], $rows->map(fn ($row): array => [
            (string) ($row['label'] ?? 'Heizkosten'),
            trim(collect([data_get($row, 'account.number'), data_get($row, 'account.group')])->filter()->join(' · ')),
            $this->money((float) ($row['totalAmount'] ?? 0)),
            $this->money((float) ($row['allocatedAmount'] ?? 0)),
        ])->all());

        $warmWater = $rows->filter(
            fn ($row): bool => $this->containsAny(
                mb_strtolower((string) ($row['label'] ?? '')),
                ['warmwasser', 'wassererwärmung', 'wassererwaermung'],
            ),
        )->values();
        $this->tableSection('Anteil Warmwasserkosten nach § 9 HKVO (gemessen)', [
            ['label' => 'Kostenart / Umlage', 'width' => 72, 'align' => 'L'],
            ['label' => 'Schlüssel', 'width' => 45, 'align' => 'L'],
            ['label' => 'Gesamtkosten', 'width' => 29, 'align' => 'R'],
            ['label' => 'Kostenanteil', 'width' => 29, 'align' => 'R'],
        ], $warmWater->map(fn ($row): array => [
            (string) ($row['label'] ?? 'Warmwasser'),
            (string) ($row['allocationKeyName'] ?? $row['allocationKey'] ?? '-'),
            $this->money((float) ($row['totalAmount'] ?? 0)),
            $this->money((float) ($row['allocatedAmount'] ?? 0)),
        ])->all());

        $this->tableSection('Heizkosten Aufteilung', [
            ['label' => 'Position', 'width' => 60, 'align' => 'L'],
            ['label' => 'Gesamt Betrag', 'width' => 31, 'align' => 'R'],
            ['label' => 'Umlageschlüssel', 'width' => 36, 'align' => 'L'],
            ['label' => 'Faktor', 'width' => 20, 'align' => 'R'],
            ['label' => 'Mein Anteil', 'width' => 28, 'align' => 'R'],
        ], $rows->map(fn ($row): array => [
            (string) ($row['label'] ?? 'Heizkosten'),
            $this->money((float) ($row['totalAmount'] ?? 0)),
            (string) ($row['allocationKeyName'] ?? $row['allocationKey'] ?? '-'),
            $this->percent((float) ($row['factor'] ?? 0)),
            $this->money((float) ($row['allocatedAmount'] ?? 0)),
        ])->all());
    }

    private function advancePaymentsPage(): void
    {
        // New snapshots contain one immutable summary per real payment. Keep
        // the historical payment/OP list for older issued snapshots unchanged.
        if (array_key_exists('paymentReceipts', (array) ($this->data['summary'] ?? []))) {
            $this->advancePaymentReceiptBreakdownPage();

            return;
        }

        $this->detailPage('Vorauszahlungen · Zahlungen');
        $this->paragraph('Hier finden Sie die einzelnen berücksichtigten Zahlungsbuchungen, soweit vorhanden. Die klein gedruckten Referenzen dienen ihrer eindeutigen Zuordnung.', 4.2, 8.4);
        $summary = (array) ($this->data['summary'] ?? []);
        $bookings = collect((array) ($summary['advanceMonths'] ?? []))
            ->flatMap(fn ($month): array => collect((array) ($month['bookings'] ?? []))->map(function (array $booking) use ($month): array {
                $booking['_month'] = (string) ($month['month'] ?? '');
                return $booking;
            })->all())
            ->filter(fn (array $booking): bool => abs((float) ($booking['allocatedAmount'] ?? 0)) >= 0.005)
            ->filter(function (array $booking): bool {
                $scope = (string) ($booking['scope'] ?? '');
                $hkaActive = (bool) data_get($this->data, 'property.hasHka', false);

                return $scope === 'operating_costs'
                    || ($hkaActive && $scope === 'heating_costs');
            })
            ->sortBy(fn (array $booking): string => implode('|', [
                (string) ($booking['_month'] ?? ''),
                (string) ($booking['bookingDate'] ?? ''),
                (string) ($booking['opNumber'] ?? ''),
                (string) ($booking['paymentNumber'] ?? ''),
            ]))
            ->values();

        $advanceTotal = (float) ($summary['advanceTotal'] ?? 0);

        if ($bookings->isEmpty()) {
            $this->tableSection('Zahlungen', [
                ['label' => 'Abrechnungsmonat / Beleg', 'width' => 92, 'align' => 'L'],
                ['label' => 'Gebucht am', 'width' => 32, 'align' => 'L'],
                ['label' => 'Angerechnet', 'width' => 41, 'align' => 'R'],
            ], [['Keine einzelnen Zahlungsbuchungen vorhanden', '—', '0,00 €']], false);
            $this->positionTotal('Tatsächlich berücksichtigte Vorauszahlungen', $advanceTotal);

            return;
        }

        $this->tableSection('Zahlungen', [
            ['label' => 'Abrechnungsmonat / Beleg', 'width' => 92, 'align' => 'L'],
            ['label' => 'Gebucht am', 'width' => 32, 'align' => 'L'],
            ['label' => 'Angerechnet', 'width' => 41, 'align' => 'R'],
        ], $bookings->map(fn (array $booking): array => [
            $this->advancePaymentPresentation($booking),
            $this->pdfDate($booking['bookingDate'] ?? null),
            $this->money((float) ($booking['allocatedAmount'] ?? 0)),
        ])->all());

        $this->positionTotal('Tatsächlich berücksichtigte Vorauszahlungen', $advanceTotal);
    }


    /**
     * Show the payment as received exactly once and distinguish it from its
     * allocations. Only NKA/HKA advances of the billed period reduce the
     * statement balance; rent and other payment uses never do.
     */
    private function advancePaymentReceiptBreakdownPage(): void
    {
        $this->detailPage('Zahlungseingänge und Vorauszahlungen');
        $summary = (array) ($this->data['summary'] ?? []);
        $receipts = collect((array) ($summary['paymentReceipts'] ?? []))->filter(fn ($row): bool => is_array($row))->values();
        $hasOperating = (bool) data_get($this->data, 'property.hasNka', true);
        $hasHeating = (bool) data_get($this->data, 'property.hasHka', false) && $this->shouldRenderSection('heating');
        $hasJoint = $receipts->contains(fn (array $r): bool => (float) ($r['jointAdvanceAmount'] ?? 0) > 0.005);

        $this->paragraph('Je Zahlungseingang mit angerechneter Vorauszahlung eine Zeile. Reine Mietzahlungen ohne Vorauszahlungsbezug sind nicht enthalten. Nur NKA (Betriebskosten) und ggf. HKA (Heizkosten) mindern den Abrechnungssaldo.', 4.2, 8.2);

        $compact = $hasJoint && $hasOperating && $hasHeating;
        $columns = [
            ['label' => 'Zahlung / Beleg', 'width' => $compact ? 39 : 49, 'align' => 'L'],
            ['label' => 'Betrag', 'width' => $compact ? 22 : 27, 'align' => 'R'],
            ['label' => 'Miete', 'width' => $compact ? 22 : 25, 'align' => 'R'],
        ];
        if ($hasOperating) $columns[] = ['label' => 'NKA', 'width' => $compact ? 20 : 22, 'align' => 'R'];
        if ($hasHeating) $columns[] = ['label' => 'HKA', 'width' => $compact ? 20 : 22, 'align' => 'R'];
        if ($hasJoint) $columns[] = ['label' => "NKA+HKA\ngemeinsam", 'width' => 22, 'align' => 'R'];
        $columns[] = ['label' => "Weitere /\noffen", 'width' => 20, 'align' => 'R'];

        $rows = $receipts->map(function (array $receipt) use ($hasOperating, $hasHeating, $hasJoint): array {
            $receiptDate = $this->pdfDate($receipt['bookingDate'] ?? null);
            $method = $this->receiptPaymentMethod((string) ($receipt['paymentMethod'] ?? ''));
            $markers = ($receipt['contractShareOnly'] ?? false) ? '*' : '';
            $number = trim((string) ($receipt['paymentNumber'] ?? ''));
            $months = array_values((array) ($receipt['advanceMonths'] ?? []));
            $monthLabel = count($months) === 1 && preg_match('/^\\d{4}-\\d{2}$/', (string) $months[0])
                ? substr((string) $months[0], 5, 2).'.'.substr((string) $months[0], 0, 4)
                : (count($months) > 1 ? count($months).' VZ-Monate' : '');
            $secondary = collect([$number !== '' ? $number : null, $monthLabel !== '' ? 'VZ '.$monthLabel : null])
                ->filter()->join(' · ');
            $cells = [
                ['primary' => $receiptDate.' · '.$method.$markers, 'secondary' => $secondary],
                $this->receiptAmount((float) ($receipt['displayAmount'] ?? 0)),
                $this->receiptAmount((float) ($receipt['rentAmount'] ?? 0)),
            ];
            if ($hasOperating) $cells[] = $this->receiptAmount((float) ($receipt['operatingAmount'] ?? 0));
            if ($hasHeating) $cells[] = $this->receiptAmount((float) ($receipt['heatingAmount'] ?? 0));
            if ($hasJoint) $cells[] = $this->receiptAmount((float) ($receipt['jointAdvanceAmount'] ?? 0));
            $cells[] = $this->receiptAmount((float) ($receipt['otherAmount'] ?? 0));

            return $cells;
        })->all();

        if ($rows !== []) {
            // The sum is over the displayed payments/contract shares, not
            // an additional advance credit. Shared receipts stay scoped.
            $totalCells = [
                ['primary' => 'Summe', 'secondary' => 'dargestellte Beträge'],
                $this->receiptAmount($receipts->sum(fn (array $r): float => (float) ($r['displayAmount'] ?? 0))),
                $this->receiptAmount($receipts->sum(fn (array $r): float => (float) ($r['rentAmount'] ?? 0))),
            ];
            if ($hasOperating) $totalCells[] = $this->receiptAmount($receipts->sum(fn (array $r): float => (float) ($r['operatingAmount'] ?? 0)));
            if ($hasHeating) $totalCells[] = $this->receiptAmount($receipts->sum(fn (array $r): float => (float) ($r['heatingAmount'] ?? 0)));
            if ($hasJoint) $totalCells[] = $this->receiptAmount($receipts->sum(fn (array $r): float => (float) ($r['jointAdvanceAmount'] ?? 0)));
            $totalCells[] = $this->receiptAmount($receipts->sum(fn (array $r): float => (float) ($r['otherAmount'] ?? 0)));
            $rows[] = $totalCells;
        }

        if ($rows === []) {
            $this->paragraph('Keine einzelnen Zahlungseingänge im gespeicherten Abrechnungsstand zuordenbar. Die nachstehend angerechneten Vorauszahlungen können auch aus historischen Salden stammen.', 4.2, 8.2);
        } else {
            $this->tableSection('Zahlung und Verteilung · Beträge in EUR', $columns, $rows);
        }

        if ($receipts->contains(fn (array $r): bool => (bool) ($r['contractShareOnly'] ?? false))) {
            $this->paragraph('* Bei Zahlungen mit Buchungen für weitere Verträge wird aus Datenschutzgründen nur der für diesen Vertrag zugeordnete Betrag gezeigt, nicht die gesamte Überweisung.', 4.1, 8.0);
        }
        if ($hasJoint) {
            $this->paragraph('NKA+HKA gemeinsam = angerechnete Betriebs-/Heizkostenvorauszahlungen, für die keine verlässliche Trennung nach Kostenarten vorliegt. Ein willkürlicher Aufteilungsschlüssel wird nicht angenommen.', 4.1, 8.0);
        }
        if ($receipts->contains(fn (array $r): bool => ! (bool) ($r['reconciled'] ?? true))) {
            $this->paragraph('Prüfhinweis: Mindestens ein Zahlungssplit übersteigt den erfassten Zahlungseingang. Bitte Buchungen und Rundungen vor Versand abgleichen.', 4.1, 8.0);
        }

        $this->paragraph('Weitere/offen = andere Buchungen/Zeiträume oder noch nicht zugeordnete Zahlungsteile; keine hier angerechneten Vorauszahlungen.', 4.1, 8.0);

        $groups = collect((array) ($summary['advanceGroups'] ?? []))
            ->filter(fn ($row): bool => is_array($row) && abs((float) ($row['amount'] ?? 0)) >= 0.005)
            ->values();
        $total = (float) ($summary['advanceTotal'] ?? 0);
        $receipted = $receipts->sum(fn (array $r): float => (float) ($r['operatingAmount'] ?? 0)
            + (float) ($r['heatingAmount'] ?? 0)
            + (float) ($r['jointAdvanceAmount'] ?? 0));
        $unlinked = round($total - $receipted, 2);

        // The receipt table already gives the per-column NKA/HKA totals.
        // Show a second breakdown only where non-receipted legacy amounts
        // need explanation, to keep twelve normal payments on one PDF page.
        if (abs($unlinked) >= 0.005 && $groups->isNotEmpty()) {
            $this->sectionCaption('In dieser Abrechnung angerechnete Vorauszahlungen');
            foreach ($groups as $group) {
                $this->positionRow((string) ($group['title'] ?? 'Vorauszahlung'), '', (float) ($group['amount'] ?? 0));
            }
        }
        $this->positionTotal('Angerechnete Vorauszahlungen gesamt', $total);
        if (abs($unlinked) >= 0.005) {
            $this->paragraph(
                'Davon '.OperatingCostDisplayFormatter::money($unlinked).' ohne auf dieser Seite belegte Einzelzahlung (z. B. historische Saldenübernahme oder nicht einzeln nachweisbare Zuordnung). Dies ist kein zusätzlicher Zahlungseingang.',
                4.1, 8.0,
            );
        }
        if (! $hasHeating && $hasOperating && $receipts->contains(fn (array $r): bool => (float) ($r['otherAmount'] ?? 0) > 0.005)) {
            $this->paragraph('Nicht enthaltene Heizkostenvorauszahlungen können unter Weitere/offen stehen; sie werden nicht als NKA angerechnet.', 4.1, 8.0);
        } elseif ($hasHeating && (string) data_get($this->data, 'property.statementBillingMode', '') === 'operating_only') {
            $this->paragraph('Die Heizkosten sind zwar enthalten, aber gemäß gewähltem Vorauszahlungsumfang werden nur NKA-Vorauszahlungen abgezogen.', 4.1, 8.0);
        }
    }

    private function receiptAmount(float $amount): string
    {
        // Currency is declared once above the table to preserve column width.
        return OperatingCostDisplayFormatter::number($amount, 2);
    }

    private function receiptPaymentMethod(string $method): string
    {
        return match ($method) {
            'bank_transfer' => 'Überweisung',
            'direct_debit' => 'Lastschrift',
            'cash' => 'Bar',
            'card' => 'Karte',
            default => 'Zahlung',
        };
    }

    /** @return array{primary:string,secondary:string} */
    private function advancePaymentPresentation(array $booking): array
    {
        $month = (string) ($booking['_month'] ?? $booking['month'] ?? '');
        $monthLabel = $this->advancePaymentMonthLabel($month);
        $category = match ((string) ($booking['scope'] ?? '')) {
            'operating_costs' => 'Betriebskosten',
            'heating_costs' => 'Heizkosten',
            default => '',
        };
        $primary = collect([$monthLabel, $category])->filter()->join(' · ');
        if ($primary === '') $primary = trim((string) ($booking['opDescription'] ?? '')) ?: 'Vorauszahlung';

        $references = collect([
            trim((string) ($booking['opNumber'] ?? '')),
            trim((string) ($booking['paymentNumber'] ?? '')),
        ])->filter()->join(' · ');

        return [
            'primary' => $primary,
            'secondary' => $references !== '' ? $references : trim((string) ($booking['purpose'] ?? '')),
        ];
    }

    private function advancePaymentMonthLabel(string $month): string
    {
        if (! preg_match('/^(\\d{4})-(0[1-9]|1[0-2])$/', $month, $matches)) return trim($month);

        $months = [
            1 => 'Januar', 2 => 'Februar', 3 => 'März', 4 => 'April',
            5 => 'Mai', 6 => 'Juni', 7 => 'Juli', 8 => 'August',
            9 => 'September', 10 => 'Oktober', 11 => 'November', 12 => 'Dezember',
        ];

        return $months[(int) $matches[2]].' '.$matches[1];
    }

    private function advanceSourceLabel(string $source): string
    {
        return match ($source) {
            'actual_payment_allocations_with_legacy_fallback' => 'Es wurden tatsächliche Zahlungszuordnungen und ergänzend ein historischer Fallback berücksichtigt',
            'legacy_balance_fallback' => 'Es liegen keine einzelnen Zahlungszuordnungen vor; der Betrag stammt aus dem historischen Saldo-Fallback',
            default => 'Die Vorauszahlungen konnten nicht vollständig aus einzelnen Zahlungszuordnungen aufgeschlüsselt werden',
        };
    }

    private function pdfDate(mixed $value): string
    {
        if (!is_string($value) || trim($value) === '') return '—';
        $date = date_create($value);
        return $date ? $date->format('d.m.Y') : $value;
    }

    private function detailPage(string $title): void
    {
        $this->AddPage();
        $this->SetXY(self::LEFT, 12);
        $this->font('B', 10);
        $this->Cell(13.5, 5, $this->encode('Objekt:'));
        $this->font('', 10);
        $this->Cell(self::CONTENT_W - 13.5, 5, $this->encode($this->objectLine()), 0, 1);

        $location = trim(collect([
            data_get($this->data, 'property.postalCode'),
            data_get($this->data, 'property.city'),
        ])->filter()->join(' '));
        if ($location === '') {
            $location = trim((string) data_get($this->data, 'property.address', ''));
        }
        if ($location !== '') {
            $this->SetXY(self::LEFT + 13.5, 17);
            $this->font('', 8.2, [90, 90, 90]);
            $this->Cell(self::CONTENT_W - 13.5, 4, $this->encode($location), 0, 1);
        }

        $this->SetDrawColor(210, 210, 210);
        $this->Line(self::LEFT, 23, self::LEFT + self::CONTENT_W, 23);
        $this->rightInfo($this->detailInfo(), 125, 26, 65, 8);
        $this->SetY(self::DETAIL_BODY_TOP);
        $this->setFill(self::HEADER_FILL_RGB);
        $this->font('B', 10);
        $this->Cell(self::CONTENT_W, 7, $this->encode($title), 0, 1, 'L', true);
        $this->Ln(3);
    }

    private function rightInfo(array $items, float $x, float $y, float $width, float $size): void
    {
        $cursor = $y;
        foreach ($items as $item) {
            $this->SetXY($x, $cursor);
            $this->font('B', $size);
            $this->MultiCell($width, 3.55, $this->encode((string) ($item['label'] ?? '')), 0, 'R');
            $this->SetX($x);
            $this->font('', $size);
            $this->MultiCell($width, 3.55, $this->encode((string) ($item['value'] ?? '')), 0, 'R');
            $cursor = $this->GetY() + 1.15;
        }
    }

    private function overviewRows(): array
    {
        $costs = collect((array) ($this->data['costs'] ?? []));
        $directRows = $this->directServiceRows($costs);
        // Keep the overview in sync with the waste detail page and exclude
        // waste direct allocations, which are already listed under services.
        $wasteRows = $costs
            ->filter(fn ($row): bool => ($row['category'] ?? null) === 'waste' && ($row['sourceType'] ?? null) !== 'direct_allocation')
            ->unique(fn ($row): string => ($row['sourceType'] ?? '').':'.($row['sourceId'] ?? '').':'.($row['allocationKey'] ?? ''))
            ->values();
        $rows = [];

        foreach ($costs->where('category', 'general')->values() as $row) {
            $row = (array) $row;
            $rows[] = [
                'title' => (string) ($row['label'] ?? 'Nebenkosten'),
                'subtitle' => $this->costSubtitle($row),
                'amount' => (float) ($row['allocatedAmount'] ?? 0),
            ];
        }

        $categoryRows = [
            ['rows' => $costs->where('category', 'water')->values(), 'title' => 'Wasser und Abwasser', 'subtitle' => 'Zusammensetzung siehe Detailseite Wasser und Abwasser'],
            ['rows' => $wasteRows, 'title' => 'Müllentsorgung', 'subtitle' => 'Zusammensetzung siehe Detailseite Müllkosten'],
            ['rows' => $costs->where('category', 'heating')->values(), 'title' => 'Heiz- und Warmwasserkosten', 'subtitle' => 'siehe Heizkostenaufstellung'],
            ['rows' => $costs->filter(fn ($row): bool => ! in_array(($row['category'] ?? ''), ['general', 'water', 'waste', 'direct', 'heating'], true) && ($row['sourceType'] ?? null) !== 'direct_allocation')->values(), 'title' => 'Weitere Betriebskosten', 'subtitle' => 'siehe Einzelpositionen und Rechnungsbelege'],
            ['rows' => $directRows, 'title' => 'Leistungen / Direktumlagen', 'subtitle' => 'siehe Detailabrechnung Leistungen und Direktumlagen'],
        ];

        foreach ($categoryRows as $entry) {
            $amount = $entry['rows']->sum(fn ($row): float => (float) ($row['allocatedAmount'] ?? 0));
            if (abs($amount) >= 0.005) {
                $rows[] = ['title' => $entry['title'], 'subtitle' => $entry['subtitle'], 'amount' => $amount];
            }
        }

        return $rows;
    }

    private function waterPositionTitle(array $row): string
    {
        $label = trim((string) ($row['label'] ?? 'Wasserkosten'));

        return $label !== '' ? $label : 'Wasserkosten';
    }

    private function waterMeterConsumptionTotal(array $rows, array $rawRows = []): void
    {
        $totals = $this->waterMeterConsumptionTotals($rows, $rawRows);
        $rawTotal = (float) ($totals['raw'] ?? 0);
        $allocatedTotal = (float) ($totals['allocated'] ?? 0);
        $hasDistribution = (bool) ($totals['hasDistribution'] ?? false);

        if ($rawTotal <= 0) return;

        $relevantTotal = $hasDistribution ? $allocatedTotal : $rawTotal;
        if ($relevantTotal <= 0) return;

        $this->ensureSpace(8);
        $y = $this->GetY();
        $leftW = self::CONTENT_W - self::AMOUNT_W;
        $this->drawRule($y);

        $this->SetXY(self::LEFT + 3, $y + 1.8);
        $this->font('B', 8.4);
        $this->Cell($leftW - 6, 4, $this->encode(
            $hasDistribution ? 'Verbrauchsanteil dieser Wohnung' : 'Summe Wasserverbrauch',
        ));
        $this->SetXY(self::LEFT + $leftW, $y + 1.8);
        $this->Cell(self::AMOUNT_W - 3, 4, $this->encode(OperatingCostDisplayFormatter::cubicMeters($relevantTotal)), 0, 0, 'R');

        $this->drawRule($y + 7);
        $this->SetY($y + 7.5);
    }

    /** @return array{raw:float,allocated:float,hasDistribution:bool} */
    private function waterMeterConsumptionTotals(array $rows, array $rawRows = []): array
    {
        if ($rawRows !== []) {
            return $this->waterMeterConsumptionTotalsFromRawRows($rawRows);
        }

        $rawTotal = 0.0;
        $allocatedTotal = 0.0;
        $hasDistribution = false;

        foreach ($rows as $row) {
            $text = (string) ($row[3] ?? '');
            if (! preg_match('/^([0-9.,]+)\s+m³(?:\R|$)/u', $text, $matches)) continue;

            $raw = (float) str_replace(',', '.', str_replace('.', '', (string) ($matches[1] ?? '0')));
            $rawTotal += $raw;
            $allocated = $raw;

            if (preg_match('/\R\/\s*\d+\s+Einheiten\s*=\s*([0-9.,]+)\s+m³/u', $text, $allocationMatch)) {
                $allocated = (float) str_replace(',', '.', str_replace('.', '', (string) ($allocationMatch[1] ?? '0')));
                $hasDistribution = true;
            }

            $allocatedTotal += $allocated;
        }

        return [
            'raw' => $rawTotal,
            'allocated' => $allocatedTotal,
            'hasDistribution' => $hasDistribution,
        ];
    }

    /** Add using structured readings, not two-decimal PDF cell strings. */
    private function waterMeterConsumptionTotalsFromRawRows(array $rows): array
    {
        $total = 0.0;
        $allocated = 0.0;
        $hasDistribution = false;

        foreach ($rows as $row) {
            $unit = mb_strtolower((string) ($row['unitOfMeasure'] ?? ''));
            if (! in_array($unit, ['m3', 'm³', 'cbm'], true) || ! is_numeric($row['consumption'] ?? null)) continue;

            $consumption = (float) $row['consumption'];
            $group = (array) ($row['_group'] ?? []);
            $allocation = $this->meterGroupAllocationRow($row, $group);
            $divisor = $this->meterDistributionDivisor($row, $group);
            $share = 1.0;
            if ($allocation !== null && is_numeric($allocation['share'] ?? null)) {
                $share = (float) $allocation['share'];
            } elseif ($divisor !== null && $divisor > 1) {
                $share = 1.0 / $divisor;
            }
            $total += $consumption;
            $allocated += $consumption * $share;
            if (abs($share - 1.0) > 0.00000001) $hasDistribution = true;
        }

        return ['raw' => $total, 'allocated' => $allocated, 'hasDistribution' => $hasDistribution];
    }

    private function waterCostSubtitle(array $row): string
    {
        $presentation = (array) ($row['waterPresentation'] ?? []);
        $merged = [...$row, ...$presentation];
        $invoiceLines = $this->invoicePresentationLines($merged);
        $details = $this->splitPdfLines((string) ($merged['details'] ?? ''));

        $details = array_values(array_filter(
            $details,
            fn (string $line): bool => ! $this->isInvoicePresentationDetailLine($line)
                && ! str_starts_with(trim($line), 'Schlüssel:')
                && ! str_starts_with(trim($line), 'Berechnung:')
                && ! str_starts_with(trim($line), 'Rechenweg:'),
        ));

        $usageLine = $this->invoiceUsagePeriodLine($merged);
        if ($usageLine !== null && ! $this->hasLinePrefix($details, 'Nutzung:')) {
            $details[] = $usageLine;
        }

        $adjustment = (array) ($merged['wastewaterAdjustment'] ?? []);
        if ((float) ($adjustment['excludedConsumption'] ?? 0) > 0.0005) {
            $details[] = 'Schmutzwasser: '
                .OperatingCostDisplayFormatter::cubicMeters((float) ($adjustment['freshwaterConsumption'] ?? 0))
                .' - '.OperatingCostDisplayFormatter::cubicMeters((float) $adjustment['excludedConsumption'])
                .' = '.OperatingCostDisplayFormatter::cubicMeters((float) ($adjustment['chargeableConsumption'] ?? 0));
        }

        $calculation = trim((string) ($merged['calculationLine'] ?? $merged['berechnung'] ?? ''));
        if ($calculation !== '') {
            $details[] = $this->normalizeMeasurementPrecision($calculation);
        } else {
            $key = trim((string) ($merged['schluessel'] ?? $merged['allocationKeyName'] ?? $merged['allocationKey'] ?? ''));
            $fallback = $this->allocationCalculationLine($merged);
            if ($key !== '' && $fallback !== null) {
                $details[] = $fallback;
            }
        }

        return implode("\n", array_values(array_filter($invoiceLines === [] && $details === [] ? [''] : [...$invoiceLines, ...$details])));
    }

    private function quantityPricedWaterSubtitle(array $merged, string $key): ?string
    {
        if ((string) ($merged['allocationKey'] ?? '') !== 'consumption') return null;

        $calculation = trim((string) ($merged['calculationLine'] ?? $merged['berechnung'] ?? ''));
        return $calculation !== '' ? $this->normalizeMeasurementPrecision($calculation) : null;
    }

    private function wastePositionTitle(array $row): string
    {
        return (string) ($row['label'] ?? 'Müllkosten');
    }

    private function wasteCostSubtitle(array $row): string
    {
        $lines = $this->splitPdfLines((string) ($row['details'] ?? ''));
        $calculation = trim((string) ($row['calculationLine'] ?? ''));

        if ($calculation !== '') {
            $sourceLines = array_values(array_filter(
                $lines,
                fn (string $line): bool => ! str_starts_with(trim($line), 'Schlüssel:')
                    && ! str_starts_with(trim($line), 'Rechenweg:'),
            ));

            return implode("\n", [...$sourceLines, $this->normalizeMeasurementPrecision($calculation)]);
        }

        return $this->costSubtitle($row);
    }

    private function wasteAllocationLine(float $base, ?float $totalDays, ?float $ownDays, string $key): string
    {
        $totalDays ??= 2437.0;
        $ownDays ??= 730.0;
        $factor = $totalDays > 0 ? $ownDays / $totalDays : 0.0;

        return implode("\n", [
            'Schlüssel: '.$key,
            OperatingCostDisplayFormatter::number($ownDays, 2).' P-Tage ÷ '.OperatingCostDisplayFormatter::number($totalDays, 2).' P-Tage = '.$this->percent($factor),
            'Rechenweg: '.$this->money($base).' ÷ '.OperatingCostDisplayFormatter::number($totalDays, 2).' P-Tage × '.OperatingCostDisplayFormatter::number($ownDays, 2).' P-Tage',
        ]);
    }

    private function wastePersonDaysTotal(array $row, array $lines): ?float
    {
        $details = (string) ($row['details'] ?? '');
        if (preg_match('/\/\s*([\d.]+)\s+P-Tage\s+\(Gesamt\)/iu', $details, $m)) {
            return (float) str_replace('.', '', $m[1]);
        }

        return null;
    }

    private function wastePersonDaysOwn(array $row, array $lines): ?float
    {
        $details = (string) ($row['details'] ?? '');
        if (preg_match('/×\s*([\d.]+)\s+P-Tage\s+\(Eigenanteil\)/iu', $details, $m)) {
            return (float) str_replace('.', '', $m[1]);
        }

        return null;
    }

    private function wastePriceLine(string $price): string
    {
        if (preg_match('/^(\d+)\s*[x×]\s*([0-9.,]+)\s*(?:EUR|€)\s*=\s*([0-9.,]+)\s*(?:EUR|€)$/iu', trim($price), $m)) {
            $unit = (float) str_replace(',', '.', str_replace('.', '', $m[2]));
            $total = (float) str_replace(',', '.', str_replace('.', '', $m[3]));

            return (int) $m[1].' × '.OperatingCostDisplayFormatter::money($unit).' = '.$this->money($total);
        }

        return $price;
    }

    private function wasteGroupLabel(array $row): string
    {
        $source = (string) ($row['sourceType'] ?? '');
        if ($source === 'waste_container') return 'Mülltonnen · Grundgebühren';
        if ($source === 'waste_collection') return 'Mülltonnen · Leerungen';

        $label = (string) ($row['label'] ?? 'Müllkosten');
        $prefix = trim((string) preg_replace('/\s*·.*$/u', '', $label));

        return $prefix !== '' ? $prefix : 'Müllkosten';
    }

    private function servicePositionTitle(array $row): string
    {
        return (string) ($row['label'] ?? 'Leistung');
    }

    private function serviceCostSubtitle(array $row): string
    {
        return $this->costSubtitle($row);
    }

    private function directServiceRows(mixed $costs = null)
    {
        $costs ??= collect((array) ($this->data['costs'] ?? []));
        $costs = $costs instanceof \Illuminate\Support\Collection ? $costs : collect((array) $costs);

        return $costs
            ->filter(fn ($row): bool => ($row['category'] ?? null) === 'direct' || ($row['sourceType'] ?? null) === 'direct_allocation')
            ->values();
    }

    private function meterRelationMatrixColumns(): array
    {
        return [
            ['label' => "Zählernummer /\nStandort", 'width' => 45, 'align' => 'L'],
            ['label' => "Anfangsstand /\nAblesedatum /\nHinweis", 'width' => 38, 'align' => 'L'],
            ['label' => "Endstand /\nAblesedatum /\nHinweis", 'width' => 38, 'align' => 'L'],
            ['label' => "Verbrauch /\nUmlageanteil", 'width' => 44, 'align' => 'R'],
        ];
    }

    private function meterRelationMatrixRows(array $keys, array $labelNeedles, bool $raw = false): array
    {
        $rows = collect((array) data_get($this->data, 'allocation.meters', []))
            ->filter(function ($group, string $key) use ($keys, $labelNeedles): bool {
                if (in_array($key, $keys, true)) return true;

                return $this->containsAny(
                    mb_strtolower((string) data_get($group, 'label', '')),
                    $labelNeedles,
                );
            })
            ->flatMap(function ($group, string $key): array {
                $group = (array) $group;
                $matrixRows = collect((array) ($group['matrixRows'] ?? []))
                    ->filter(fn ($row): bool => is_array($row))
                    ->map(fn ($row): array => [...(array) $row, '_group' => $group, '_key' => $key])
                    ->values();

                if ($matrixRows->isNotEmpty()) return $matrixRows->all();

                return collect((array) ($group['rows'] ?? []))
                    ->filter(fn ($row): bool => is_array($row))
                    ->map(function ($row) use ($group, $key): array {
                        $row = (array) $row;
                        $reading = (array) ($row['reading'] ?? []);

                        return [
                            'meterId' => $row['meterId'] ?? null,
                            'unitId' => data_get($this->data, 'unit.id'),
                            'unit' => collect([data_get($this->data, 'unit.number'), data_get($this->data, 'unit.name')])->filter()->join(' · '),
                            'meterNumber' => $row['meterNumber'] ?? '-',
                            'meterType' => $row['label'] ?? $group['label'] ?? $key,
                            'location' => $row['location'] ?? null,
                            'startValue' => $reading['startValue'] ?? null,
                            'startDate' => $reading['startDate'] ?? null,
                            'startNote' => $reading['startNote'] ?? null,
                            'endValue' => $reading['endValue'] ?? null,
                            'endDate' => $reading['endDate'] ?? null,
                            'endNote' => $reading['endNote'] ?? null,
                            'consumption' => $row['totalConsumption'] ?? $row['allocatedConsumption'] ?? null,
                            'unitOfMeasure' => $row['unit'] ?? $group['unit'] ?? '',
                            'wastewaterRelevant' => $row['wastewaterRelevant'] ?? true,
                            'distributionText' => $row['distributionText'] ?? $row['allocationLabel'] ?? null,
                            'distributionDivisor' => $row['distributionDivisor'] ?? null,
                            '_group' => $group,
                            '_key' => $key,
                        ];
                    })->all();
            })
            ->filter(fn ($row): bool => is_array($row))
            ->values();

        return $rows
            ->filter(fn (array $row): bool => $this->meterRelationMatrixRowVisible(
                $row,
                (array) ($row['_group'] ?? []),
            ))
            ->unique(function (array $row): string {
                $meterId = trim((string) ($row['meterId'] ?? ''));
                if ($meterId !== '') return $meterId;

                return implode('|', [
                    (string) ($row['meterNumber'] ?? ''),
                    (string) ($row['startDate'] ?? ''),
                    (string) ($row['endDate'] ?? ''),
                    (string) ($row['unitOfMeasure'] ?? ''),
                ]);
            })
            ->sortBy(fn (array $row): string => (string) ($row['unit'] ?? '').'|'.(string) ($row['meterNumber'] ?? ''))
            ->map(fn (array $row): array => $raw ? $row : $this->meterRelationMatrixRow(
                $row,
                (array) ($row['_group'] ?? []),
                (string) ($row['_key'] ?? ''),
            ))
            ->values()
            ->all();
    }

    private function meterRelationMatrixRowVisible(array $row, array $group): bool
    {
        $currentUnitId = trim((string) data_get($this->data, 'unit.id', ''));
        $rowUnitId = trim((string) ($row['unitId'] ?? ''));

        if ($currentUnitId === '' && $rowUnitId === '') return true;

        if ($currentUnitId !== '' && $rowUnitId !== '') {
            if ($rowUnitId === $currentUnitId) return true;

            $allocatedRow = $this->meterGroupAllocationRow($row, $group);
            if ($allocatedRow === null) return false;

            $mode = (string) ($allocatedRow['allocationMode'] ?? 'individual');
            $share = (float) ($allocatedRow['share'] ?? 0);

            return ! in_array($mode, ['individual', 'not_allocated'], true) && $share > 0;
        }

        if ($rowUnitId !== '') {
            return $currentUnitId === '';
        }

        $allocatedRow = $this->meterGroupAllocationRow($row, $group);
        if ($allocatedRow !== null) {
            $mode = (string) ($allocatedRow['allocationMode'] ?? 'individual');
            if ($mode === 'not_allocated') return false;
            if ($mode !== 'individual' && (float) ($allocatedRow['share'] ?? 0) > 0) return true;
        }

        $distribution = mb_strtolower(trim((string) ($row['distributionText'] ?? '')));
        if (str_contains($distribution, 'nicht umgelegt')) return false;
        if (str_contains($distribution, 'gemeinschaft')) return true;
        if ($this->meterDistributionDivisor($row, $group) !== null) return true;

        return mb_strtolower(trim((string) ($row['contractNumber'] ?? ''))) === 'gemeinschaft';
    }

    private function meterGroupAllocationRow(array $row, array $group): ?array
    {
        $meterId = trim((string) ($row['meterId'] ?? ''));
        if ($meterId === '') return null;

        $candidate = collect((array) ($group['rows'] ?? []))->first(function ($candidate) use ($meterId): bool {
            return is_array($candidate) && (string) ($candidate['meterId'] ?? '') === $meterId;
        });

        return is_array($candidate) ? $candidate : null;
    }

    private function meterRelationMatrixRow(array $row, array $group, string $key): array
    {
        $unit = $this->displayMeterUnit((string) ($row['unitOfMeasure'] ?? $group['unit'] ?? ''));
        $meterNumber = trim((string) ($row['meterNumber'] ?? ''));
        $location = trim((string) ($row['location'] ?? ''));
        $meter = collect([
            $meterNumber !== '' ? $meterNumber : 'Zähler',
            $location !== '' ? $location : null,
            ($row['wastewaterRelevant'] ?? true) === false ? 'Ohne Schmutzwasser' : null,
        ])->filter()->join("\n");

        return [
            $meter,
            $this->meterValueWithDateAndNote($row['startValue'] ?? null, $row['startDate'] ?? null, $row['startNote'] ?? null, $unit),
            $this->meterValueWithDateAndNote($row['endValue'] ?? null, $row['endDate'] ?? null, $row['endNote'] ?? null, $unit),
            $this->meterDifferenceText(
                $row['consumption'] ?? null,
                $unit,
                $this->meterDistributionDivisor($row, $group),
            ),
        ];
    }

    private function meterValueWithDateAndNote(mixed $value, mixed $date, mixed $note, string $unit): string
    {
        $lines = [is_numeric($value) ? OperatingCostDisplayFormatter::quantity((float) $value, $unit) : '-'];
        if (is_string($date) && trim($date) !== '') {
            $parsed = date_create($date);
            $lines[] = $parsed ? $parsed->format('d.m.Y') : $date;
        }
        $cleanNote = $this->meterNoteForPdf($note);
        if ($cleanNote !== null) $lines[] = $cleanNote;

        return implode("\n", $lines);
    }

    private function meterNoteForPdf(mixed $note): ?string
    {
        if (! is_string($note) || trim($note) === '') return null;

        $cleaned = trim($note);
        $cleaned = preg_replace('/\s*Legacy-Status:\s*[A-Za-z0-9_.-]+/iu', '', $cleaned) ?? $cleaned;
        $cleaned = preg_replace('/\s*Legacy-Bild:\s*\S+/iu', '', $cleaned) ?? $cleaned;
        $cleaned = preg_replace('/[ \t]{2,}/u', ' ', $cleaned) ?? $cleaned;
        $cleaned = preg_replace('/\n{3,}/u', "\n\n", $cleaned) ?? $cleaned;
        $cleaned = trim($cleaned);

        return $cleaned !== '' ? $cleaned : null;
    }

    private function meterDistributionDivisor(array $row, array $group): ?int
    {
        $direct = $row['distributionDivisor'] ?? null;
        if (is_numeric($direct) && (int) $direct > 1) return (int) $direct;

        $meterId = trim((string) ($row['meterId'] ?? ''));
        if ($meterId !== '') {
            $legacy = collect((array) ($group['rows'] ?? []))->first(function ($candidate) use ($meterId): bool {
                if (! is_array($candidate)) return false;

                return (string) ($candidate['meterId'] ?? '') === $meterId
                    && (string) ($candidate['allocationMode'] ?? '') === 'shared_equal';
            });
            if (is_array($legacy)) {
                $weight = (int) round((float) ($legacy['totalWeight'] ?? 0));
                if ($weight > 1) return $weight;
            }
        }

        $text = trim((string) ($row['distributionText'] ?? ''));
        if ($text !== '' && preg_match('/verteilt auf\s+(\d+)\s+aktive\s+Wohneinheiten?/iu', $text, $matches)) {
            $count = (int) ($matches[1] ?? 0);
            if ($count > 1) return $count;
        }

        return null;
    }

    private function meterDifferenceText(mixed $value, mixed $unit, ?int $distributionDivisor = null): string
    {
        if (! is_numeric($value)) return '-';

        $displayUnit = $this->displayMeterUnit((string) $unit);
        $consumption = (float) $value;
        $lines = [OperatingCostDisplayFormatter::quantity($consumption, $displayUnit)];
        if ($distributionDivisor !== null && $distributionDivisor > 1) {
            $allocated = $consumption / $distributionDivisor;
            $lines[] = '/ '.$distributionDivisor.' Einheiten = '.OperatingCostDisplayFormatter::quantity($allocated, $displayUnit);
        }

        return implode("\n", $lines);
    }

    private function normalizeMeasurementPrecision(string $value): string
    {
        if ($value === '') return '';

        return preg_replace_callback(
            '/(?<![\d.,])(\d+(?:\.\d{3})*,\d+|\d+,\d+|\d+\.\d+)\s+(m³|m²|kWh|MWh)(?=\s|$|×|·|\/)/u',
            function (array $matches): string {
                $raw = (string) ($matches[1] ?? '0');
                if (str_contains($raw, ',')) {
                    $numeric = (float) str_replace(',', '.', str_replace('.', '', $raw));
                } else {
                    $numeric = (float) $raw;
                }

                return OperatingCostDisplayFormatter::quantity($numeric, (string) ($matches[2] ?? ''));
            },
            $value,
        ) ?? $value;
    }

    private function displayMeterUnit(string $unit): string
    {
        return OperatingCostDisplayFormatter::unit($unit);
    }

}
