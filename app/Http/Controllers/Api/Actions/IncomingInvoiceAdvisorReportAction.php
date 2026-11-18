<?php

namespace App\Http\Controllers\Api\Actions;

use App\Models\IncomingInvoice;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpFoundation\StreamedResponse;

final class IncomingInvoiceAdvisorReportAction
{
    public function __invoke(Request $request): StreamedResponse
    {
        Gate::authorize('viewAny', IncomingInvoice::class);
        $data = $request->validate([
            'from' => ['required', 'date_format:Y-m-d'],
            'until' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
        ]);
        abort_if(CarbonImmutable::parse($data['from'])->diffInYears(CarbonImmutable::parse($data['until'])) > 10, 422, 'Der Zeitraum darf zehn Jahre nicht überschreiten.');

        return response()->streamDownload(function () use ($data): void {
            $stream = fopen('php://output', 'wb');
            // UTF-8 BOM for German Excel; semicolon-delimited and quoted by fputcsv.
            fwrite($stream, "\xEF\xBB\xBF");
            fputcsv($stream, ['Belegart', 'Ursprungsrechnung ID', 'Rechnung intern', 'Lieferantenbeleg', 'Datum', 'Lieferant', 'Objekt', 'Status', 'Zahlungsstatus', 'Position', 'Beschreibung', 'Netto EUR', 'USt EUR', 'Brutto EUR', 'Steuersatz %', 'Objektkonto', 'Umlagefähig', 'Steuerliche Prüfklasse', 'Beraterhinweis', 'Prüfung offen'], ';');

            IncomingInvoice::query()
                ->whereDate('invoice_date', '>=', $data['from'])
                ->whereDate('invoice_date', '<=', $data['until'])
                ->with(['supplier:id,display_name', 'property:id,name', 'items.propertyAccount.costType'])
                ->orderBy('id')
                ->chunkById(200, function ($invoices) use ($stream): void {
                    foreach ($invoices as $invoice) {
                        foreach ($invoice->items->sortBy('sort_order') as $index => $item) {
                            $category = $item->tax_category ?: 'unclassified';
                            $values = [
                                in_array($invoice->document_type, ['credit', 'supplier_credit'], true) ? 'Gutschrift' : 'Rechnung', $invoice->original_invoice_id, $invoice->number, $invoice->external_number, $invoice->invoice_date?->format('Y-m-d'),
                                $invoice->supplier?->display_name, $invoice->property?->name,
                                $invoice->workflow_status, $invoice->payment_status, $index + 1,
                                $item->description, in_array($invoice->document_type, ['credit', 'supplier_credit'], true) ? - (float) $item->net_amount : $item->net_amount, in_array($invoice->document_type, ['credit', 'supplier_credit'], true) ? - (float) $item->tax_amount : $item->tax_amount, in_array($invoice->document_type, ['credit', 'supplier_credit'], true) ? - (float) $item->gross_amount : $item->gross_amount,
                                $item->tax_rate, $item->propertyAccount?->custom_label ?: $item->propertyAccount?->costType?->name,
                                $item->is_allocatable ? 'Ja' : 'Nein', $category, $item->tax_review_note,
                                $category === 'unclassified' ? 'Ja' : 'Nein',
                            ];
                            // Spreadsheet formula injection protection, preserving input as literal text.
                            $values = array_map(static fn ($value) => is_string($value) && preg_match('/^[\s]*[=+@\-]/u', $value) ? "'".$value : $value, $values);
                            fputcsv($stream, $values, ';');
                        }
                    }
                }, 'id');
            fclose($stream);
        }, 'eingangsrechnungen-berater-'.$data['from'].'-'.$data['until'].'.csv', [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Cache-Control' => 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
