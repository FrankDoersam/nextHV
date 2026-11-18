<?php

namespace App\Http\Controllers\Api\Actions;

use App\Http\Controllers\Controller;
use App\Models\Property;
use App\Reports\MeterConsumptionPdfReport;
use App\Services\Metering\Reports\MeterConsumptionReportService;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\HeaderUtils;

class MeterConsumptionReportAction extends Controller
{
    public function __invoke(
        Request $request,
        Property $property,
        MeterConsumptionReportService $service,
        MeterConsumptionPdfReport $pdfReport,
    ): JsonResponse|Response {
        $this->authorize('viewMeters', $property);

        $values = $request->validate([
            'referenceDate1' => ['required', 'date_format:Y-m-d'],
            'referenceDate2' => ['required', 'date_format:Y-m-d', 'after:referenceDate1'],
            'format' => ['nullable', 'in:json,pdf'],
            'download' => ['sometimes', 'boolean'],
        ], [
            'referenceDate1.date_format' => 'Ablesung 1 muss im Format JJJJ-MM-TT angegeben werden.',
            'referenceDate2.date_format' => 'Ablesung 2 muss im Format JJJJ-MM-TT angegeben werden.',
            'referenceDate2.after' => 'Ablesung 2 muss nach Ablesung 1 liegen.',
        ]);

        $referenceDate1 = CarbonImmutable::createFromFormat('!Y-m-d', $values['referenceDate1']);
        $referenceDate2 = CarbonImmutable::createFromFormat('!Y-m-d', $values['referenceDate2']);
        $data = $service->build($property, $referenceDate1, $referenceDate2);

        if (($values['format'] ?? 'json') === 'pdf') {
            return response($pdfReport->render($data), 200, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => HeaderUtils::makeDisposition(
                    $request->boolean('download') ? 'attachment' : 'inline',
                    (string) ($data['filename'] ?? 'Zaehler-Verbrauch.pdf'),
                    'Zaehler-Verbrauch.pdf',
                ),
                'X-Content-Type-Options' => 'nosniff',
                'Cache-Control' => 'private, no-store',
            ]);
        }

        return response()->json(['data' => $data], 200, ['Cache-Control' => 'private, no-store']);
    }
}
