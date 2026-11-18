<?php

namespace App\Reports;

use App\Reports\Support\OrganizationPdfDocument;
use App\Reports\Support\OrganizationReport;

/**
 * One layout for property- and contract-scoped meter comparisons.
 * Shares the measured page/footer/row wrapping of contract and property reports.
 */
class MeterConsumptionPdfReport extends OrganizationReport
{
    private const METER_WIDTHS = [31, 29, 35, 26, 26, 27];
    private const METER_LABELS = ['Messart / Einheit', 'Zählernummer', 'Einbauort', 'Stand 1', 'Stand 2', 'Differenz'];
    private const TYPE_WIDTHS = [58, 24, 30, 30, 32];
    private const TYPE_LABELS = ['Messart / Einheit', 'Zähler', 'Stand 1', 'Stand 2', 'Verbrauch'];

    /** @param array<string, mixed> $data */
    public function render(array $data): string
    {
        $property = (array) ($data['property'] ?? []);
        $scope = (array) ($data['scope'] ?? ['type' => 'property']);
        $summary = (array) ($data['summary'] ?? []);
        $isContract = ($scope['type'] ?? '') === 'contract';
        $reference = $isContract
            ? 'Vertrag '.(string) ($scope['contractNumber'] ?? '')
            : (string) ($property['label'] ?? 'Objekt');
        $title = 'Zählerverbrauch · Stichtagsvergleich';
        $complete = ((int) ($summary['missingReadingCount'] ?? 0)) === 0;

        $pdf = $this->document(
            $title,
            $reference,
            'Zählerverbrauch · '.$reference,
            'Bezugsdaten '.(string) ($data['referenceDate1'] ?? '').' bis '.(string) ($data['referenceDate2'] ?? ''),
            $complete,
        );

        $this->introduction($pdf, $data, $isContract);
        $this->unitTables($pdf, $data);
        $this->typeSummary($pdf, $data);

        return $pdf->Output('S');
    }

    private function introduction(OrganizationPdfDocument $pdf, array $data, bool $isContract): void
    {
        $property = (array) ($data['property'] ?? []);
        $scope = (array) ($data['scope'] ?? []);
        $summary = (array) ($data['summary'] ?? []);
        $reference = $isContract
            ? 'Vertrag '.(string) ($scope['contractNumber'] ?? '')
            : (string) ($property['label'] ?? 'Objekt');

        $this->paragraph($pdf, $reference, 17, 'B', 7.5);
        $this->paragraph($pdf, (string) ($property['label'] ?? ''), 9, '', 4.8);
        if (($property['address'] ?? '') !== '') {
            $this->paragraph($pdf, (string) $property['address']);
        }
        $pdf->Ln(3);
        $this->paragraph(
            $pdf,
            'Bezugsdaten: '.(string) ($data['referenceDate1Label'] ?? '-').' – '.(string) ($data['referenceDate2Label'] ?? '-'),
            11,
            'B',
            5.7,
        );
        $this->paragraph(
            $pdf,
            (int) ($summary['unitCount'] ?? 0).' Einheiten · '.
            (int) ($summary['meterCount'] ?? 0).' Zähler · '.
            (int) ($summary['missingReadingCount'] ?? 0).' fehlende Stände · '.
            (int) ($summary['completeMeterCount'] ?? 0).' vollständig vergleichbare Zähler',
        );
        $pdf->Ln(2);
        $this->paragraph(
            $pdf,
            'Die Differenz ist ausschließlich Stand 2 minus Stand 1 für denselben Zähler und dieselbe Maßeinheit. '
            .'Die Bezugsdaten sind gespeicherte Stichtage und nicht zwingend die tatsächlichen Ablesetage. '
            .'Fehlende Werte werden nicht geschätzt oder interpoliert.',
        );
        if ($isContract) {
            $this->paragraph(
                $pdf,
                'Vertragsbezogen werden nur Zähler der zugeordneten Einheit innerhalb der wirksamen Vertragszeit gezeigt. '
                .'Das Dokument ist keine verbrauchsabhängige Kosten- oder Heizkostenabrechnung.',
            );
        } else {
            $this->paragraph(
                $pdf,
                'Objektbezogen sind die Wohnungszähler für Wärmemenge, Warm- und Kaltwasser enthalten; '
                .'Allgemeinzähler gehören nicht zu dieser Übersicht.',
            );
        }
        if (! (int) ($summary['meterCount'] ?? 0)) {
            $pdf->Ln(2);
            $this->paragraph($pdf, 'Für den ausgewählten Zeitraum wurden keine passenden Zähler gefunden.');
        }
    }

    private function unitTables(OrganizationPdfDocument $pdf, array $data): void
    {
        foreach ((array) ($data['units'] ?? []) as $unit) {
            $unit = (array) $unit;
            $rows = (array) ($unit['meters'] ?? []);
            $title = 'Einheit '.(string) ($unit['label'] ?? 'ohne Bezeichnung');
            $first = isset($rows[0]) ? $this->meterValues((array) $rows[0]) : null;
            $repeat = $this->tableSection(
                $pdf,
                $title,
                self::METER_LABELS,
                self::METER_WIDTHS,
                ['L', 'L', 'L', 'R', 'R', 'R'],
                $first,
            );
            foreach ($rows as $row) {
                $this->tableRow(
                    $pdf,
                    $this->meterValues((array) $row),
                    self::METER_WIDTHS,
                    ['L', 'L', 'L', 'R', 'R', 'R'],
                    false,
                    $repeat,
                    7.2,
                );
            }
            if ((int) ($unit['missingMeterCount'] ?? 0) > 0) {
                $this->paragraph($pdf, 'Unvollständige Werte: '.(int) $unit['missingMeterCount'].' Zähler dieser Einheit sind nicht durchgehend vergleichbar.', 7.7);
            }
        }
    }

    /** @return list<string> */
    private function meterValues(array $row): array
    {
        return [
            trim((string) ($row['typeLabel'] ?? 'Zähler').' · '.(string) ($row['unitOfMeasure'] ?? ''), ' ·'),
            (string) ($row['meterNumber'] ?? ''),
            (string) ($row['location'] ?? ''),
            ($row['reading1Missing'] ?? true) ? 'FEHLT' : $this->decimal($row['reading1'] ?? null),
            ($row['reading2Missing'] ?? true) ? 'FEHLT' : $this->decimal($row['reading2'] ?? null),
            ($row['difference'] ?? null) === null ? '—' : $this->decimal($row['difference']),
        ];
    }

    private function typeSummary(OrganizationPdfDocument $pdf, array $data): void
    {
        $groups = (array) ($data['typeSummaries'] ?? []);
        if ($groups === []) {
            return;
        }

        $first = (array) $groups[0];
        $repeat = $this->tableSection(
            $pdf,
            'Zusammenfassung nach Messart und Maßeinheit',
            self::TYPE_LABELS,
            self::TYPE_WIDTHS,
            ['L', 'R', 'R', 'R', 'R'],
            $this->typeValues($first),
        );
        foreach ($groups as $group) {
            $this->tableRow(
                $pdf,
                $this->typeValues((array) $group),
                self::TYPE_WIDTHS,
                ['L', 'R', 'R', 'R', 'R'],
                false,
                $repeat,
            );
        }
        if (collect($groups)->contains(fn (array $group): bool => ! (bool) ($group['complete'] ?? false))) {
            $pdf->Ln(2);
            $this->paragraph(
                $pdf,
                '„—“ bedeutet: Mindestens ein Zähler hat an einem der Bezugsdaten keinen Stand. '
                .'Teilwerte werden nicht zu einem vermeintlich vollständigen Verbrauch addiert.',
            );
        }
        $pdf->Ln(2);
        $this->paragraph($pdf, 'Erstellt: '.(string) ($data['generatedAt'] ?? '-'), 7.8);
    }

    /** @return list<string> */
    private function typeValues(array $group): array
    {
        return [
            trim((string) ($group['typeLabel'] ?? 'Zähler').' · '.(string) ($group['unitOfMeasure'] ?? ''), ' ·'),
            (string) (int) ($group['meterCount'] ?? 0),
            ($group['reading1Complete'] ?? false) ? $this->decimal($group['reading1'] ?? null) : '—',
            ($group['reading2Complete'] ?? false) ? $this->decimal($group['reading2'] ?? null) : '—',
            ($group['complete'] ?? false) ? $this->decimal($group['consumption'] ?? null) : '—',
        ];
    }

    private function decimal(mixed $value): string
    {
        if ($value === null || ! is_numeric($value)) {
            return '—';
        }

        return rtrim(rtrim(number_format((float) $value, 3, ',', '.'), '0'), ',');
    }
}
