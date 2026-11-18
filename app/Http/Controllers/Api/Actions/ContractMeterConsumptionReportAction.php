<?php

namespace App\Http\Controllers\Api\Actions;

use App\Http\Controllers\Controller;
use App\Models\Contract;
use App\Reports\MeterConsumptionPdfReport;
use App\Services\Metering\Reports\MeterConsumptionReportService;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\HeaderUtils;

/** Contract-scoped read of the same authoritative meter comparison report. */
final class ContractMeterConsumptionReportAction extends Controller
{
    public function __invoke(
        Request $request,
        Contract $contract,
        MeterConsumptionReportService $service,
        MeterConsumptionPdfReport $pdfReport,
    ): JsonResponse|Response {
        $this->authorize('view', $contract);

        $values = $request->validate([
            'referenceDate1' => ['required', 'date_format:Y-m-d'],
            'referenceDate2' => ['required', 'date_format:Y-m-d', 'after:referenceDate1'],
            'format' => ['nullable', 'in:json,pdf'],
            'download' => ['sometimes', 'boolean'],
        ]);

        $property = $service->propertyForContract($contract);
        $this->authorize('viewMeters', $property);

        $data = $service->build(
            $property,
            CarbonImmutable::createFromFormat('!Y-m-d', $values['referenceDate1']),
            CarbonImmutable::createFromFormat('!Y-m-d', $values['referenceDate2']),
            $contract,
        );

        if (($values['format'] ?? 'json') === 'pdf') {
            return response($pdfReport->render($data), 200, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => HeaderUtils::makeDisposition(
                    $request->boolean('download') ? 'attachment' : 'inline',
                    (string) ($data['filename'] ?? 'Zaehler-Verbrauch-Vertrag.pdf'),
                    'Zaehler-Verbrauch-Vertrag.pdf',
                ),
                'Cache-Control' => 'private, no-store',
                'X-Content-Type-Options' => 'nosniff',
            ]);
        }

        return response()->json(['data' => $data], 200, ['Cache-Control' => 'private, no-store']);
    }
}
