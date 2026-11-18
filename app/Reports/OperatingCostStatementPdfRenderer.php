<?php

namespace App\Reports;

use App\Reports\Concerns\OperatingCostStatementPdfFormatting;
use App\Reports\Concerns\OperatingCostStatementPdfPages;
use App\Reports\Concerns\OperatingCostStatementPdfTables;
use App\Services\OperatingCosts\OperatingCostPaymentQrCode;
use App\Services\Documents\Concerns\OrganizationProfilePdfLayout;
use App\Services\Documents\OrganizationDocumentProfile;
use FPDF;
use Illuminate\Validation\ValidationException;

final class OperatingCostStatementPdfRenderer extends FPDF
{
    use OperatingCostStatementPdfFormatting;
    use OperatingCostStatementPdfPages;
    use OperatingCostStatementPdfTables;
    use OrganizationProfilePdfLayout;

    private array $organization;
    private array $profileFooter;
    private float $pageBottom;

    private const LEFT = 25.0;
    private const RIGHT = 20.0;
    private const CONTENT_W = 165.0;
    private const DETAIL_BODY_TOP = 55.0;
    private const PAGE_BOTTOM = 262.0;
    private const AMOUNT_W = 35.0;
    private const CELL_PAD_X = 3.0;
    private const CELL_PAD_R = 3.0;
    private const LINE_RGB = [226, 226, 226];
    private const HEADER_FILL_RGB = [238, 238, 238];
    private const SUBLINE_RGB = [78, 78, 78];
    // Includes the mandatory four-module white quiet zone (EPC v3.1).
    private const PAYMENT_QR_SIZE = 32.0;
    private const PAYMENT_QR_GAP = 5.0;
    private const PAYMENT_QR_LINE_HEIGHT = 4.2;
    private const PAYMENT_QR_BLOCK_HEIGHT = 37.0;

    public function __construct(private readonly array $data)
    {
        parent::__construct('P', 'mm', 'A4');
        $this->SetMargins(self::LEFT, 12.0, self::RIGHT);
        $this->SetAutoPageBreak(false);
        $this->SetTitle($this->encode((string) ($data['title'] ?? 'Betriebskostenabrechnung')));
        $this->AliasNbPages();
        // This is an already captured issuer snapshot. Never fetch today's
        // settings/logo while rendering or reprinting an old statement.
        $this->organization = (new OrganizationDocumentProfile())->normalize((array) ($data['organization'] ?? []));
        $this->profileFooter = $this->measureOrganizationProfileFooter($this->organization, 111.0, [], [
            'reference' => implode(' · ', array_filter([
                trim('Abrechnung '.($data['reference'] ?? '')),
                filled(data_get($data, 'contract.number')) ? 'Vertrag '.data_get($data, 'contract.number') : '',
            ])),
            'payment' => (float) data_get($data, 'summary.balance', 0) > 0.004 ? (array) ($data['payment'] ?? []) : [],
        ]);
        $this->pageBottom = min(self::PAGE_BOTTOM, (float) $this->profileFooter['bodyBottom']);
    }

    public function renderDocument(): void
    {
        $this->coverPage();
        $this->overviewPage();
        if ($this->shouldRenderSection('water')) {
            $this->waterPage();
        }
        if ($this->shouldRenderSection('waste')) {
            $this->wastePage();
        }
        if ($this->shouldRenderSection('services')) {
            $this->servicesPage();
        }
        if ($this->shouldRenderSection('heating')) {
            $this->heatingPage();
        }
        $this->allocationPage();
        $this->advancePaymentsPage();
    }

    private function coverPage(): void
    {
        $this->AddPage();
        $headerBottom = $this->senderHeader();
        $recipientBottom = $this->addressWindow();
        $this->rightInfo($this->coverInfo(), 125.0, max(25.0, $headerBottom + 4.0), 65.0, 8.0);
        $this->SetXY(self::LEFT, max(111.0, $recipientBottom + 8.0, $this->GetY() + 8.0));
        $this->paragraph((string) data_get($this->data, 'recipient.salutation', 'Sehr geehrte Damen und Herren,'), 5.0, 10.0);
        $this->paragraph((string) ($this->data['intro'] ?? ''), 5.0, 10.0);
        $this->Ln(1.5);

        $summary = (array) ($this->data['summary'] ?? []);
        $costs = collect((array) ($this->data['costs'] ?? []));
        $heating = $costs->where('category', 'heating')->sum(fn ($row): float => (float) ($row['allocatedAmount'] ?? 0));
        $operating = (float) ($summary['costTotal'] ?? 0) - $heating;
        $rows = [];
        if (abs($operating) >= 0.005 || $heating === 0.0) {
            $rows[] = ['title' => 'Betriebskosten (ohne Heizung)', 'subtitle' => 'Kostenanteil laut Aufstellung ab Seite 2', 'price' => $operating];
        }
        if ($this->shouldRenderSection('heating') && abs($heating) >= 0.005) {
            $rows[] = ['title' => 'Heizkosten', 'subtitle' => 'Interne Heiz- und Warmwasserkosten nach Zähler und Fläche', 'price' => $heating];
        }
        $rows = [...$rows, ...$this->advanceSummaryRows($summary)];
        $balance = (float) data_get($summary, 'balance', 0);
        $rows[] = [
            'title' => abs($balance) < 0.005 ? 'Ausgeglichen' : ($balance > 0 ? 'Nachzahlung' : 'Gutschrift'),
            'subtitle' => '',
            'price' => abs($balance),
            'isResult' => true,
        ];
        $this->summaryTable('Kostenübersicht', $rows);

        $warnings = collect((array) ($summary['warnings'] ?? []))->filter()->values();
        if ($warnings->isNotEmpty()) {
            $this->Ln(3);
            $this->paragraph('Hinweise: '.$warnings->join(' · '), 4.2, 8.5);
        }

        if (! $this->shouldRenderSection('heating') || abs($heating) < 0.005) {
            $this->paragraph('Heiz- und Warmwasserkosten sind in dieser Abrechnung nicht enthalten.', 4.2, 8.3);
        }
        $this->paragraph('Belegeinsicht: Die der Abrechnung zugrunde liegenden Belege können Sie auf Wunsch einsehen. Bitte wenden Sie sich an den Absender.', 4.2, 8.3);

        $footerText = (string) ($this->data['footerText'] ?? '');
        $qrPng = null;
        if (($this->data['paymentQrCodeEnabled'] ?? false) === true
            && $balance > 0.004
            && data_get($this->data, 'payment.purpose') === 'payment') {
            $qrPng = (new OperatingCostPaymentQrCode())->png(
                (array) $this->data['payment'], $balance, (string) ($this->data['reference'] ?? ''),
            );
        }

        if ($footerText !== '' || $qrPng !== null) {
            $this->Ln(3);
            if ($qrPng === null) {
                $this->paragraph($footerText, 4.65, 9.0);
            } else {
                $this->paymentFooterWithQr($footerText, $qrPng);
            }
        }
    }

    /**
     * Keep the entire editable closing text beside the QR code. Splitting
     * the introduction from the bank details previously made the QR start
     * below the text and pushed it onto a second cover page.
     */
    private function paymentFooterWithQr(string $footerText, string $qrPng): void
    {
        $textWidth = self::CONTENT_W - self::PAYMENT_QR_SIZE - self::PAYMENT_QR_GAP;
        $lines = $footerText === '' ? [] : $this->profileWrappedLines(
            trim($footerText),
            $textWidth,
            '',
            8.5,
        );

        // Extremely long custom closing text remains complete and can flow
        // over pages. Only the normal compact case uses side-by-side columns.
        if (count($lines) * self::PAYMENT_QR_LINE_HEIGHT
            > $this->pageBottom - self::DETAIL_BODY_TOP - 4.0) {
            $this->paragraph($footerText, self::PAYMENT_QR_LINE_HEIGHT, 8.5);
            $lines = [];
        }

        $this->paymentQrRow($lines, $qrPng);
    }

    /** @param list<string> $lines */
    private function paymentQrRow(array $lines, string $qrPng): void
    {
        $height = max(self::PAYMENT_QR_BLOCK_HEIGHT, count($lines) * self::PAYMENT_QR_LINE_HEIGHT);
        $this->ensureSpace($height + 1.0);
        $top = $this->GetY();
        $textWidth = self::CONTENT_W - self::PAYMENT_QR_SIZE - self::PAYMENT_QR_GAP;

        $this->font('', 8.5);
        foreach ($lines as $line) {
            $this->SetX(self::LEFT);
            $this->Cell($textWidth, self::PAYMENT_QR_LINE_HEIGHT, $line, 0, 1);
        }

        $x = self::LEFT + self::CONTENT_W - self::PAYMENT_QR_SIZE;
        // The locally encoded PNG already includes the EPC four-module quiet zone.
        $this->Image(
            'data://application/octet-stream;base64,'.base64_encode($qrPng),
            $x, $top, self::PAYMENT_QR_SIZE, self::PAYMENT_QR_SIZE, 'PNG',
        );
        // Use the same precise baseline as the letter QR: a Cell introduces
        // leading between the bitmap edge and its caption.
        $this->font('', 7.0, self::SUBLINE_RGB);
        $caption = $this->encode('Mit Banking-App scannen');
        $captionX = $x + (self::PAYMENT_QR_SIZE - $this->GetStringWidth($caption)) / 2.0;
        $this->Text($captionX, $top + self::PAYMENT_QR_SIZE + 1.5, $caption);
        $this->SetY($top + $height + 1.0);
    }

    private function allocationPage(): void
    {
        $this->detailPage('Verteilung der Betriebskosten');
        $this->paragraph('Je nach Kostenart gelten unterschiedliche Umlageschlüssel. Der jeweils verwendete Schlüssel ist im Rechenweg der Kostenposition erkennbar. Maßgeblich bleiben die wirksamen vertraglichen Vereinbarungen und die gesetzlichen Vorgaben.', 4.55, 9.0);
        $this->paragraph('So lesen Sie die Rechenwege: Bei Verteilungskosten wird der Grundbetrag mit dem Anteil Ihrer Wohnung multipliziert (z. B. eigene Wohnfläche / gesamte Wohnfläche oder eigene Personentage / alle Personentage). Bei Verbrauchskosten gilt: zugerechnete Menge × Preis je Einheit. Grundgebühren können nach der Anzahl der Wohnungen verteilt werden. Rechts vom Gleichheitszeichen steht jeweils Ihr Kostenanteil.', 4.35, 8.6);
        $this->paragraph('Rundung: Geldbeträge werden in Euro mit zwei Nachkommastellen ausgewiesen. Die Berechnung kann genauere Zwischenwerte verwenden; daher sind kleine Rundungsabweichungen bei einer Nachrechnung anhand der angezeigten Werte möglich.', 4.2, 8.2);

        $this->distributionHeading('1. Wohnfläche');
        $this->paragraph('Bei nach Wohnfläche umgelegten Kosten, etwa Grundsteuer und Gebäudeversicherung, richtet sich der Anteil dieser Wohnung nach ihrer Wohnfläche im Verhältnis zur Gesamtwohnfläche des Hauses. Abweichende Schlüssel werden bei den betreffenden Positionen angegeben.', 4.55, 9.0);
        $this->allocationBox('Haus gesamt / Ihre Wohnung', (array) data_get($this->data, 'allocation.areas', []), 'm²');

        $this->distributionHeading('2. Verbrauch und weitere Schlüssel');
        $consumptionText = 'Bei verbrauchsabhängigen Kosten werden die erfassten Verbrauchsmengen und der zugehörige Kostenansatz verwendet.';
        if ($this->shouldRenderSection('water')) {
            $consumptionText .= ' Die Wasserzählerstände und Wassergebühren finden Sie in der Wasserkostenaufstellung.';
            $excludedWater = collect((array) data_get($this->data, 'allocation.meters', []))
                ->only(['water', 'garden'])
                ->sum(fn (array $group): float => (float) ($group['wastewaterExcludedOwn'] ?? 0));
            if ($excludedWater > 0.0005) {
                $consumptionText .= ' Ein eigens erfasster, nicht eingeleiteter Wasseranteil wird nur beim Schmutzwasser abgezogen; die volle Frischwassermenge bleibt bestehen. Die genaue Menge zeigt die Wasseraufstellung.';
            }
        }
        if ($this->shouldRenderSection('heating')) {
            $consumptionText .= ' Soweit Heiz- und Warmwasserkosten enthalten sind, werden sie in der Heizkostenaufstellung erläutert.';
        }
        if (collect((array) ($this->data['costs'] ?? []))->contains(fn ($row): bool => in_array(($row['allocationKey'] ?? ''), ['units', 'residential_units'], true))) {
            $consumptionText .= ' Bei einer Verteilung nach Wohnungen ist die Anzahl der berücksichtigten Einheiten in der Kostenposition ausgewiesen.';
        }
        $this->paragraph($consumptionText, 4.55, 9.0);

        $this->distributionHeading('3. Personentage');
        $this->paragraph('Bei einer Umlage nach Personentagen zählen je Zeitraum die berücksichtigten Personen × Kalendertage. Die folgenden Zeitabschnitte zeigen die Belegung des gesamten Hauses; der Anteil Ihrer Wohnung steht in der Summenzeile. Kurze Abwesenheiten wie Urlaub werden nicht abgezogen. Namen werden nicht ausgewiesen.', 4.55, 9.0);
        $personDays = (array) data_get($this->data, 'allocation.personDays', []);
        $this->allocationBox('Haus gesamt / Ihre Wohnung', [
            'total' => (float) ($personDays['total'] ?? 0),
            'own' => (float) ($personDays['own'] ?? 0),
            'rows' => $this->personDayPeriodRows($personDays),
        ], 'P-Tage');

        $direct = $this->directServiceRows();
        if ($direct->isNotEmpty()) {
            $this->distributionHeading('4. Direktkonten und Leistungen');
            $this->simpleInfoBox($direct->map(fn ($row): string => trim(collect([data_get($row, 'account.number'), $row['label'] ?? 'Direktkonto', $this->money((float) ($row['allocatedAmount'] ?? 0))])->filter()->join(' · ')))->unique()->values()->all());
        }
    }

    private function personDayPeriodRows(array $personDays): array
    {
        return collect((array) ($personDays['contractPeriods'] ?? []))
            ->filter(fn ($row): bool => is_array($row))
            ->map(fn ($row): array => (array) $row)
            ->filter(fn (array $row): bool => (int) ($row['persons'] ?? 0) > 0 && (int) ($row['days'] ?? 0) > 0)
            ->sortBy(fn (array $row): string => implode('|', [
                (string) ($row['from'] ?? ''),
                (string) ($row['until'] ?? ''),
                (string) ($row['contractNumber'] ?? ''),
                (string) ($row['unit'] ?? ''),
            ]))
            ->map(function (array $row): array {
                $persons = (int) ($row['persons'] ?? 0);
                $personLabel = $persons === 1 ? '1 Person' : number_format($persons, 0, ',', '.').' Personen';

                return [
                    'unit' => $this->dateRangeLabel($row['from'] ?? null, $row['until'] ?? null)
                        .' · '.$personLabel
                        .' × '.number_format((float) ($row['days'] ?? 0), 0, ',', '.').' Tage',
                    'value' => (float) ($row['personDays'] ?? 0),
                ];
            })
            ->values()
            ->all();
    }

    private function dateRangeLabel(mixed $from, mixed $until): string
    {
        $format = static function (mixed $value): string {
            if (! is_string($value) || trim($value) === '') return '-';
            $date = date_create($value);
            return $date ? $date->format('d.m.Y') : $value;
        };

        return $format($from).'–'.$format($until);
    }

    public function Header(): void
    {
        if ($this->PageNo() === 1) {
            $this->SetDrawColor(180, 180, 180);
            $this->SetLineWidth(0.1);
            $this->Line(5, 105, 10, 105);
            $this->Line(5, 148.5, 8, 148.5);
            $this->Line(5, 210, 10, 210);
        }
    }

    public function Footer(): void
    {
        $this->renderOrganizationProfileFooter($this->profileFooter, '{nb}');
    }

    private function senderHeader(): float
    {
        $senderName = $this->organization['senderName'] !== ''
            ? $this->organization['senderName']
            : (string) data_get($this->data, 'property.name', 'Betriebskostenabrechnung');
        $bottom = $this->renderOrganizationProfileHeader(
            $this->organization,
            $senderName,
            $this->organizationAddress($this->organization) ?? '',
        );
        return $this->finishOrganizationProfileHeader($this->organization, $bottom);
    }

    private function addressWindow(): float
    {
        $senderLine = collect([
            $this->organization['senderName'],
            $this->organizationAddress($this->organization),
        ])->filter()->join(' · ');
        $senderLines = $this->profileWrappedLines($senderLine, 85.0, '', 6.5);
        if (count($senderLines) > 4) {
            throw ValidationException::withMessages(['statement' => 'Die Absenderzeile ist zu umfangreich für das Anschriftenfenster. Bitte prüfen Sie die Firmierung und die Absenderanschrift.']);
        }
        $this->font('', 6.5, [90, 90, 90]);
        $this->SetXY(20.0, 45.0);
        foreach ($senderLines as $line) {
            $this->SetX(20.0);
            $this->Cell(85.0, 2.7, $line, 0, 2);
        }
        $this->font('', 10, [0, 0, 0]);
        $this->SetXY(20.0, max(55.0, $this->GetY() + 1.0));
        $lines = (array) data_get($this->data, 'recipient.lines', []);
        if ($lines === []) $lines = [(string) data_get($this->data, 'contract.tenant', '-')];
        foreach (array_slice($lines, 0, 7) as $line) {
            $this->SetX(20);
            $this->Cell(85, 5, $this->encode((string) $line), 0, 2);
        }

        return $this->GetY();
    }

    private function advanceSummaryRows(array $summary): array
    {
        $groups = collect((array) ($summary['advanceGroups'] ?? []))
            ->filter(fn ($group): bool => is_array($group) && abs((float) ($group['amount'] ?? 0)) >= 0.005)
            ->values();

        if ($groups->isNotEmpty()) {
            return $groups->map(fn (array $group): array => [
                'title' => (string) ($group['title'] ?? 'Vorauszahlung'),
                'subtitle' => collect((array) ($group['details'] ?? []))->filter()->join('; '),
                'price' => -((float) ($group['amount'] ?? 0)),
            ])->all();
        }

        return [[
            'title' => 'Vorauszahlungen',
            'subtitle' => $this->advanceSummaryText($summary),
            'price' => -((float) ($summary['advanceTotal'] ?? 0)),
        ]];
    }

    private function advanceSummaryText(array $summary): string
    {
        $advanceDetails = collect((array) ($summary['advanceDetails'] ?? []))->filter()->join('; ');

        return $advanceDetails !== '' ? $advanceDetails : 'Keine Vorauszahlungen im Abrechnungszeitraum angesetzt.';
    }

    private function organizationAddress(array $organization): ?string
    {
        $street = trim(collect([$organization['street'] ?? null, $organization['houseNumber'] ?? null])->filter()->join(' '));
        $city = trim(collect([$organization['postalCode'] ?? null, $organization['city'] ?? null])->filter()->join(' '));
        $value = collect([$street, $city])->filter()->join(', ');

        return $value !== '' ? $value : null;
    }

    private function shouldRenderSection(string $section): bool
    {
        $configured = data_get($this->data, 'sections.'.$section);
        if ($configured !== null) {
            return (bool) $configured;
        }

        $costs = collect((array) ($this->data['costs'] ?? []));
        return match ($section) {
            'water' => $costs->where('category', 'water')->isNotEmpty()
                || collect((array) data_get($this->data, 'allocation.meters', []))->filter(
                    fn ($group, string $key): bool => in_array($key, ['water', 'hot_water', 'garden'], true),
                )->isNotEmpty(),
            'waste' => $costs->filter(fn ($row): bool => ($row['category'] ?? null) === 'waste' && ($row['sourceType'] ?? null) !== 'direct_allocation')->isNotEmpty(),
            'services' => $this->directServiceRows($costs)->isNotEmpty(),
            'heating' => $costs->where('category', 'heating')->isNotEmpty(),
            default => true,
        };
    }
}
