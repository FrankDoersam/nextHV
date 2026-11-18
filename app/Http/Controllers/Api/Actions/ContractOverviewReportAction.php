<?php

namespace App\Http\Controllers\Api\Actions;

use App\Http\Controllers\Controller;
use App\Models\Contract;
use App\Reports\ContractOverviewPdfReport;
use App\Services\Contracts\Reports\ContractOverviewReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\HeaderUtils;

class ContractOverviewReportAction extends Controller
{
    public function __invoke(
        Request $request,
        Contract $contract,
        ContractOverviewReportService $service,
        ContractOverviewPdfReport $pdfReport,
    ): JsonResponse|Response {
        $this->authorize('view', $contract);

        $values = $request->validate([
            'from' => ['missing'], // A lifecycle snapshot has no arbitrary observation period.
            'to' => ['missing'],
            'include_bank_details' => ['missing'], // The report API never permits unmasked bank details.
            'op_details' => ['sometimes', 'in:exceptions,last12,last24,all'],
            'format' => ['nullable', 'in:json,pdf'],
            'download' => ['sometimes', 'boolean'],
        ]);

        $data = $service->build($contract, $values['op_details'] ?? 'exceptions');

        if (($values['format'] ?? 'json') !== 'pdf') {
            return response()->json(['data' => $data], 200, ['Cache-Control' => 'private, no-store']);
        }

        return response($pdfReport->render($data), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => HeaderUtils::makeDisposition(
                $request->boolean('download') ? 'attachment' : 'inline',
                (string) ($data['filename'] ?? 'Vertragsreport.pdf'),
                'Vertragsreport.pdf',
            ),
            'Cache-Control' => 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
