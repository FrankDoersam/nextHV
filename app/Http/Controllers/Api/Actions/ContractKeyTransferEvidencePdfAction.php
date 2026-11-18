<?php

namespace App\Http\Controllers\Api\Actions;

use App\Models\Contract;
use App\Models\ContractKeyTransfer;
use App\Reports\ContractKeyTransferPdfReport;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Routing\Controller;

class ContractKeyTransferEvidencePdfAction extends Controller
{
    public function __invoke(
        Request $request,
        Contract $contract,
        ContractKeyTransfer $transfer,
        ContractKeyTransferPdfReport $report,
    ): Response {
        abort_unless((string) $transfer->contract_id === (string) $contract->id, 404);

        $disposition = $request->boolean('download') ? 'attachment' : 'inline';

        return response($report->render($contract, $transfer), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => $disposition.'; filename="'.$report->filename($contract, $transfer).'"',
            'Cache-Control' => 'private, no-store',
        ]);
    }
}
