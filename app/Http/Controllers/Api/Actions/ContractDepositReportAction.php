<?php

namespace App\Http\Controllers\Api\Actions;

use App\Http\Controllers\Controller;
use App\Models\Contract;
use App\Reports\ContractDepositPdfReport;
use App\Services\Contracts\Reports\ContractDepositReportService;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\HeaderUtils;

final class ContractDepositReportAction extends Controller
{
    public function __invoke(
        Request $request,
        Contract $contract,
        ContractDepositReportService $service,
        ContractDepositPdfReport $pdfReport,
    ): JsonResponse|Response {
        $this->authorize('view', $contract);
        $values = $request->validate([
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
            'format' => ['nullable', 'in:json,pdf'],
            'download' => ['sometimes', 'boolean'],
            'include_bank_details' => ['missing'],
        ]);

        $from = CarbonImmutable::parse($values['from']);
        $to = CarbonImmutable::parse($values['to']);
        if ($from->diffInYears($to) > 50) {
            throw ValidationException::withMessages(['to' => 'Ein Kautionsreport umfasst höchstens 50 Jahre.']);
        }

        $data = $service->build($contract, $from, $to);
        if (($values['format'] ?? 'json') !== 'pdf') {
            return response()->json(['data' => $data], 200, ['Cache-Control' => 'private, no-store']);
        }

        return response($pdfReport->render($data, (string) $contract->contract_number), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => HeaderUtils::makeDisposition(
                $request->boolean('download') ? 'attachment' : 'inline',
                (string) ($data['filename'] ?? 'Kautionsreport.pdf'),
                'Kautionsreport.pdf',
            ),
            'Cache-Control' => 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
