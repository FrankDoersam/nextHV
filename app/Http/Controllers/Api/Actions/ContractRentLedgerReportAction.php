<?php

namespace App\Http\Controllers\Api\Actions;

use App\Http\Controllers\Controller;
use App\Models\Contract;
use App\Reports\ContractRentLedgerPdfReport;
use App\Services\Contracts\Reports\ContractRentLedgerReportService;
use App\Services\Finance\ReceivableGenerationService;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\HeaderUtils;

class ContractRentLedgerReportAction extends Controller
{
    public function __invoke(
        Request $request,
        Contract $contract,
        ContractRentLedgerReportService $service,
        ReceivableGenerationService $generationService,
        ContractRentLedgerPdfReport $pdfReport,
    ): JsonResponse|Response {
        $this->authorize('view', $contract);

        $values = $request->validate([
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
            'include_bank_details' => ['missing'], // The report API never permits unmasked bank details.
            'format' => ['nullable', 'in:json,pdf'],
            'download' => ['sometimes', 'boolean'],
        ]);

        $from = CarbonImmutable::parse($values['from']);
        $to = CarbonImmutable::parse($values['to']);
        $data = $service->build($contract, $from, $to);
        $data['missingPositions'] = $this->missingPositions($generationService, $contract, $from, $to);
        $data['missingPositionsLabel'] = 'Noch nicht erzeugte Sollstellungen (Vorschau)';
        $data['totals']['missingCount'] = count($data['missingPositions']);

        if (($values['format'] ?? 'json') === 'pdf') {
            return response($pdfReport->render($data), 200, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => HeaderUtils::makeDisposition(
                    $request->boolean('download') ? 'attachment' : 'inline',
                    (string) ($data['filename'] ?? 'Mietkonto.pdf'),
                    'Mietkonto.pdf',
                ),
                'Cache-Control' => 'private, no-store',
                'X-Content-Type-Options' => 'nosniff',
            ]);
        }

        return response()->json(['data' => $data], 200, ['Cache-Control' => 'private, no-store']);
    }

    /** @return array<int, array<string, mixed>> */
    private function missingPositions(
        ReceivableGenerationService $service,
        Contract $contract,
        CarbonImmutable $from,
        CarbonImmutable $to,
    ): array {
        return collect($service->preview(
            $from->startOfMonth(),
            $to->startOfMonth(),
            [$contract->id],
        ))
            ->filter(fn (array $row): bool => ! ($row['exists'] ?? false) && blank($row['skipReason'] ?? null) && (float) ($row['amount'] ?? 0) > 0)
            ->map(fn (array $row): array => [
                'key' => $row['key'],
                'serviceMonth' => $row['serviceMonth'],
                'dueDate' => $row['dueDate'],
                'contractNumber' => $row['contractNumber'],
                'description' => $row['description'],
                'costArea' => $row['costArea'],
                'accountLabel' => $this->accountLabel((string) ($row['costArea'] ?? 'other')),
                'amount' => round((float) $row['amount'], 2),
            ])
            ->values()
            ->all();
    }

    private function accountLabel(string $costArea): string
    {
        return match ($costArea) {
            'base_rent' => 'Grundmiete',
            'operating_costs' => 'Betriebskosten-Vorauszahlung',
            'heating_costs' => 'Heizkosten-Vorauszahlung',
            'garage' => 'Garage',
            'parking' => 'Stellplatz',
            'settlement' => 'Abrechnung',
            default => 'Sonstige Forderung',
        };
    }
}
