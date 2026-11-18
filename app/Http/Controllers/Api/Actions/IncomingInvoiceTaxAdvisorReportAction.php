<?php

namespace App\Http\Controllers\Api\Actions;

use App\Http\Controllers\Controller;
use App\Models\IncomingInvoice;
use App\Reports\IncomingInvoiceTaxAdvisorPdfReport;
use App\Services\Finance\Reports\IncomingInvoiceTaxAdvisorReportService;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\HeaderUtils;

final class IncomingInvoiceTaxAdvisorReportAction extends Controller
{
    public function __invoke(
        Request $request,
        IncomingInvoiceTaxAdvisorReportService $service,
        IncomingInvoiceTaxAdvisorPdfReport $pdf,
    ): JsonResponse|Response {
        Gate::authorize('viewAny', IncomingInvoice::class);
        $values = $request->validate([
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
            'format' => ['nullable', 'in:json,pdf,csv'],
            'download' => ['sometimes', 'boolean'],
        ]);
        $from = CarbonImmutable::createFromFormat('!Y-m-d', $values['from']);
        $to = CarbonImmutable::createFromFormat('!Y-m-d', $values['to']);
        if ($to->greaterThanOrEqualTo($from->addYearsNoOverflow(3))) {
            throw ValidationException::withMessages(['to' => 'Der Bericht darf höchstens drei Jahre umfassen.']);
        }

        $data = $service->build($from, $to);
        $format = $values['format'] ?? 'json';
        if ($format === 'json') {
            return response()->json(['data' => $data], 200, ['Cache-Control' => 'private, no-store']);
        }

        if ($format === 'csv') {
            return response($this->csv($data), 200, [
                'Content-Type' => 'text/csv; charset=UTF-8',
                'Content-Disposition' => HeaderUtils::makeDisposition('attachment', $data['filename'].'.csv'),
                'Cache-Control' => 'private, no-store',
                'X-Content-Type-Options' => 'nosniff',
            ]);
        }
        return response($pdf->render($data), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => HeaderUtils::makeDisposition($request->boolean('download') ? 'attachment' : 'inline', $data['filename'].'.pdf'),
            'Cache-Control' => 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    private function csv(array $data): string
    {
        $file = fopen('php://temp', 'w+');
        if ($file === false) {
            throw ValidationException::withMessages(['format' => 'Der CSV-Export konnte nicht erstellt werden.']);
        }
        fwrite($file, "\xEF\xBB\xBF");
        fputcsv($file, [
            'Beleg-ID', 'Positions-ID', 'Interne Nummer', 'Externe Nummer',
            'Belegart', 'Ursprungsrechnung', 'Rechnungsdatum', 'Fälligkeit',
            'Leistungszeitraum von', 'Leistungszeitraum bis', 'Freigabestatus',
            'Lieferant', 'Objekt', 'Objektnummer', 'Position', 'Menge', 'Einheit',
            'USt.-Satz %', 'Steuerliche Vorprüfung', 'Ausgabenkategorie', 'Steuerlicher Hinweis',
            'Objektkonto', 'Umlagefähig', 'Umlagehinweis',
            'Netto EUR', 'USt. EUR', 'Brutto EUR', 'Belege in Ablage',
        ], ';', '"', '');
        foreach ($data['rows'] as $row) {
            fputcsv($file, [
                $this->safe($row['invoiceId']), $this->safe($row['itemId']),
                $this->safe($row['invoiceNumber']), $this->safe($row['externalNumber']),
                $row['documentType'], $this->safe($row['originalInvoiceNumber']),
                $row['invoiceDate'], $row['dueDate'],
                $row['servicePeriodFrom'], $row['servicePeriodUntil'], $row['workflowStatus'],
                $this->safe($row['supplier']), $this->safe($row['property']), $this->safe($row['propertyNumber']),
                $this->safe($row['position']), $row['quantity'], $this->safe($row['unit']),
                $row['taxRate'], $row['taxTreatment'], $this->safe($row['taxCategory']),
                $this->safe($row['taxNote']), $this->safe($row['propertyAccount']),
                $row['isAllocatable'] ? 'Ja' : 'Nein', $this->safe($row['allocationNote']),
                $this->decimal($row['netCents']), $this->decimal($row['taxCents']),
                $this->decimal($row['grossCents']), $row['documentCount'],
            ], ';', '"', '');
        }
        rewind($file);
        $content = stream_get_contents($file);
        fclose($file);
        return $content === false ? '' : $content;
    }

    private function decimal(int $cents): string
    {
        return ($cents < 0 ? '-' : '').intdiv(abs($cents), 100).','.str_pad((string) (abs($cents) % 100), 2, '0', STR_PAD_LEFT);
    }

    /** Prevent spreadsheet formulas originating in untrusted vendor text. */
    private function safe(?string $value): string
    {
        $value = trim((string) $value);
        return preg_match('/^[=+@\-\t\r\n]/u', $value) ? "'".$value : $value;
    }
}
