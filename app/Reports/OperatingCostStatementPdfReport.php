<?php

namespace App\Reports;

use App\Models\OperatingCostStatementUnit;
use App\Services\OperatingCosts\OperatingCostStatementTemplateService;
use RuntimeException;

final class OperatingCostStatementPdfReport
{
    private const SUPPORTED_CALCULATION_SCHEMA_VERSIONS = [9, 10];

    public function render(OperatingCostStatementUnit $row): string
    {
        $row->loadMissing('statement');
        $payload = $this->payload($row);
        $pdf = new OperatingCostStatementPdfRenderer($payload);
        $pdf->renderDocument();

        return $pdf->Output('S');
    }

    public function filename(OperatingCostStatementUnit $row): string
    {
        $calculation = (array) ($row->calculation_snapshot ?? []);
        $statementNumber = preg_replace('/[^A-Za-z0-9_-]+/', '-', (string) ($row->statement?->number ?? $row->id));
        $contractNumber = preg_replace('/[^A-Za-z0-9_-]+/', '-', (string) data_get($calculation, 'contract.number', 'Vertrag'));

        return "Betriebskostenabrechnung-{$statementNumber}-{$contractNumber}.pdf";
    }

    /** @return array<string,mixed> */
    private function payload(OperatingCostStatementUnit $row): array
    {
        $calculation = (array) ($row->calculation_snapshot ?? []);
        $document = (array) ($row->document_snapshot ?? []);
        $this->assertCalculationSnapshot($calculation);
        $this->assertDocumentSnapshot($document);

        $summary = (array) data_get($calculation, 'summary', []);
        $recipient = (array) data_get($calculation, 'recipient', []);
        $recipient['salutation'] = (string) data_get($document, 'salutation');

        return [
            'calculationSchemaVersion' => (int) data_get($calculation, 'schemaVersion', 0),
            'title' => (string) data_get($calculation, 'title', 'Betriebskostenabrechnung'),
            'reference' => (string) data_get($document, 'reference'),
            'period' => (array) data_get($calculation, 'period', []),
            'usagePeriod' => (array) data_get($calculation, 'usagePeriod', []),
            'createdOn' => data_get($document, 'createdOn'),
            'dueOn' => data_get($document, 'dueOn'),
            'organization' => (array) data_get($document, 'organization'),
            // Only an actual payment claim receives the captured collection
            // account. Credits and balanced statements never publish a tenant
            // refund account as though it were the issuer's payment account.
            'payment' => ($document['kind'] ?? '') === 'payment' && (float) ($summary['balance'] ?? 0) > 0.004
                ? [...(array) ($document['settlementAccount'] ?? []), 'purpose' => 'payment']
                : [],
            'property' => (array) data_get($calculation, 'property', []),
            'unit' => (array) data_get($calculation, 'unit', []),
            'contract' => (array) data_get($calculation, 'contract', []),
            'recipient' => $recipient,
            'sections' => (array) data_get($calculation, 'sections', []),
            'allocation' => (array) data_get($calculation, 'allocation', []),
            'costs' => array_values((array) data_get($calculation, 'costs', [])),
            'summary' => [
                'costTotal' => (float) ($summary['costTotal'] ?? 0),
                'advanceTotal' => (float) ($summary['advanceTotal'] ?? 0),
                'advanceDetails' => array_values((array) ($summary['advanceDetails'] ?? [])),
                'advanceGroups' => array_values((array) ($summary['advanceGroups'] ?? [])),
                'advanceMonths' => array_values((array) ($summary['advanceMonths'] ?? [])),
                // Older immutable snapshots had no receipt breakdown; retain their old PDF view.
                ...(array_key_exists('paymentReceipts', $summary) ? [
                    'paymentReceipts' => array_values((array) $summary['paymentReceipts']),
                ] : []),
                'advanceSource' => (string) ($summary['advanceSource'] ?? ''),
                'warnings' => array_values((array) ($summary['warnings'] ?? [])),
                'balance' => (float) ($summary['balance'] ?? 0),
                'label' => (string) data_get($document, 'resultLabel'),
            ],
            'intro' => (string) data_get($document, 'headerText'),
            'footerText' => (string) data_get($document, 'footerText'),
            'paymentQrCodeEnabled' => (bool) data_get($document, 'policy.paymentQrCodeEnabled', false),
        ];
    }

    /** @param array<string,mixed> $snapshot */
    private function assertCalculationSnapshot(array $snapshot): void
    {
        $version = (int) ($snapshot['schemaVersion'] ?? 0);
        if (in_array($version, self::SUPPORTED_CALCULATION_SCHEMA_VERSIONS, true)) return;

        throw new RuntimeException(
            'Nicht unterstützte Betriebskosten-Snapshot-Version '
            .$version
            .'; unterstützt werden die Versionen '
            .implode(', ', self::SUPPORTED_CALCULATION_SCHEMA_VERSIONS)
            .'. Die Abrechnung muss neu erstellt werden.',
        );
    }

    /** @param array<string,mixed> $snapshot */
    private function assertDocumentSnapshot(array $snapshot): void
    {
        $version = (int) ($snapshot['schemaVersion'] ?? 0);
        if ($version !== OperatingCostStatementTemplateService::DOCUMENT_SCHEMA_VERSION) {
            throw new RuntimeException(
                'Nicht unterstützte Betriebskosten-Dokument-Snapshot-Version '
                .$version
                .'; erwartet wird Version '
                .OperatingCostStatementTemplateService::DOCUMENT_SCHEMA_VERSION
                .'. Die Abrechnung muss neu erstellt werden.',
            );
        }

        $requiredStrings = ['kind', 'resultLabel', 'createdOn', 'dueOn', 'reference', 'salutation', 'headerText', 'footerText'];
        foreach ($requiredStrings as $field) {
            if (! array_key_exists($field, $snapshot) || ! is_string($snapshot[$field])) {
                throw new RuntimeException('Der eingefrorene Betriebskosten-Dokumentstand ist unvollständig. Die Abrechnung muss neu erstellt werden.');
            }
        }
        if (! is_array($snapshot['policy'] ?? null)
            || ! is_array($snapshot['context'] ?? null)
            || ! is_array($snapshot['organization'] ?? null)) {
            throw new RuntimeException('Der eingefrorene Betriebskosten-Dokumentstand ist unvollständig. Die Abrechnung muss neu erstellt werden.');
        }
    }
}
