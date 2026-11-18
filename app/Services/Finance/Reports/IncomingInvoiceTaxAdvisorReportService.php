<?php

namespace App\Services\Finance\Reports;

use App\Models\IncomingInvoice;
use Carbon\CarbonImmutable;
use Illuminate\Validation\ValidationException;

/**
 * Read-only, invoice-date based pre-accounting projection. No tax deduction,
 * input-VAT eligibility or payment-period recognition is decided here.
 */
final class IncomingInvoiceTaxAdvisorReportService
{
    public const MAX_INVOICES = 2000;
    public const MAX_ITEMS = 10000;

    /** @return array<string, mixed> */
    public function build(CarbonImmutable $from, CarbonImmutable $to): array
    {
        $invoices = IncomingInvoice::query()
            ->select([
                'id', 'number', 'external_number', 'document_type', 'original_invoice_id',
                'supplier_id', 'property_id', 'invoice_date', 'due_date',
                'service_period_from', 'service_period_until', 'workflow_status',
            ])
            ->whereBetween('invoice_date', [$from->toDateString(), $to->toDateString()])
            ->where('workflow_status', '!=', 'cancelled')
            ->withCount(['items', 'documents'])
            ->orderBy('invoice_date')->orderBy('id')
            ->limit(self::MAX_INVOICES + 1)
            ->get();

        if ($invoices->count() > self::MAX_INVOICES
            || $invoices->sum('items_count') > self::MAX_ITEMS) {
            throw ValidationException::withMessages([
                'from' => 'Der Bericht umfasst zu viele Belege oder Positionen. Bitte den Zeitraum eingrenzen.',
            ]);
        }

        // One bounded set of eager-loaded relations; no query per position.
        $invoices->load([
            'supplier:id,display_name',
            'property:id,property_number,name',
            'originalInvoice:id,number,external_number',
            'items' => fn ($query) => $query->orderBy('sort_order'),
            'items.propertyAccount.costType',
        ]);

        $rows = [];
        $counts = [
            'invoices' => 0, 'creditNotes' => 0, 'positions' => 0,
            'review' => 0, 'relevant' => 0, 'notRelevant' => 0, 'withoutDocuments' => 0,
        ];
        $totals = [
            'net' => 0, 'tax' => 0, 'gross' => 0,
            'reviewGross' => 0, 'relevantGross' => 0, 'notRelevantGross' => 0,
        ];
        $categories = [];

        foreach ($invoices as $invoice) {
            $credit = in_array($invoice->document_type, ['supplier_credit', 'credit'], true);
            $sign = $credit ? -1 : 1;
            $counts[$credit ? 'creditNotes' : 'invoices']++;
            if ($invoice->documents_count === 0) $counts['withoutDocuments']++;

            foreach ($invoice->items as $item) {
                $treatment = in_array($item->tax_treatment, ['relevant', 'not_relevant'], true)
                    ? $item->tax_treatment : 'review';
                $category = $treatment === 'relevant' ? ($item->tax_category ?: 'other') : null;
                $net = $sign * (int) round((float) $item->net_amount * 100);
                $tax = $sign * (int) round((float) $item->tax_amount * 100);
                $gross = $sign * (int) round((float) $item->gross_amount * 100);
                $account = $item->propertyAccount;
                $accountLabel = $account
                    ? ($account->custom_label ?: trim(($account->costType?->number ?? '').' '.($account->costType?->name ?? '')))
                    : null;

                $rows[] = [
                    'invoiceId' => (string) $invoice->id,
                    'itemId' => (string) $item->id,
                    'invoiceNumber' => (string) $invoice->number,
                    'externalNumber' => $invoice->external_number,
                    'documentType' => $invoice->document_type,
                    'originalInvoiceId' => $invoice->original_invoice_id,
                    'originalInvoiceNumber' => $invoice->originalInvoice?->external_number ?: $invoice->originalInvoice?->number,
                    'invoiceDate' => $invoice->invoice_date->toDateString(),
                    'dueDate' => $invoice->due_date?->toDateString(),
                    'servicePeriodFrom' => $invoice->service_period_from?->toDateString(),
                    'servicePeriodUntil' => $invoice->service_period_until?->toDateString(),
                    'workflowStatus' => $invoice->workflow_status,
                    'supplier' => $invoice->supplier?->display_name,
                    'property' => $invoice->property?->name,
                    'propertyNumber' => $invoice->property?->property_number,
                    'position' => (string) $item->description,
                    'quantity' => (float) $item->quantity,
                    'unit' => $item->unit,
                    'taxRate' => (float) $item->tax_rate,
                    'taxTreatment' => $treatment,
                    'taxCategory' => $category,
                    'taxNote' => $item->tax_note,
                    'propertyAccount' => $accountLabel,
                    'isAllocatable' => (bool) $item->is_allocatable,
                    'allocationNote' => $item->allocation_note,
                    'netCents' => $net,
                    'taxCents' => $tax,
                    'grossCents' => $gross,
                    'documentCount' => (int) $invoice->documents_count,
                ];
                $counts['positions']++;
                $totals['net'] += $net;
                $totals['tax'] += $tax;
                $totals['gross'] += $gross;
                if ($treatment === 'relevant') {
                    $counts['relevant']++;
                    $totals['relevantGross'] += $gross;
                    $categories[$category] = ($categories[$category] ?? 0) + $gross;
                } elseif ($treatment === 'not_relevant') {
                    $counts['notRelevant']++;
                    $totals['notRelevantGross'] += $gross;
                } else {
                    $counts['review']++;
                    $totals['reviewGross'] += $gross;
                }
            }
        }
        ksort($categories);

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'generatedAt' => now()->toIso8601String(),
            'selectionBasis' => 'invoice_date',
            'counts' => $counts,
            'totalsCents' => $totals,
            'categoriesCents' => $categories,
            'rows' => $rows,
            'filename' => 'Eingangsrechnungen-Steuerberater-'.$from->toDateString().'-'.$to->toDateString(),
            'disclaimer' => 'Steuerliche Vorprüfung, keine Buchungs- oder Steuerentscheidung. Vorsteuerabzug, Erhaltungs-/Herstellungsaufwand, AfA, Privatanteile und zeitliche Zuordnung prüft die Steuerberatung. Lieferantengutschriften werden als negative Beträge ausgewiesen; es erfolgt keine automatische Zahlungs- oder Rechnungsverrechnung.',
        ];
    }
}
