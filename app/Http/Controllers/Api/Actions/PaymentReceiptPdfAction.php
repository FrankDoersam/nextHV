<?php

namespace App\Http\Controllers\Api\Actions;

use App\Application\Numbering\NumberSequenceService;
use App\Http\Controllers\Controller;
use App\Models\Payment;
use App\Reports\PaymentReceiptPdfReport;
use Illuminate\Http\Response;

final class PaymentReceiptPdfAction extends Controller
{
    public function __invoke(Payment $payment, PaymentReceiptPdfReport $report, NumberSequenceService $numbering): Response
    {
        abort_unless($payment->payment_method === 'cash', 404);

        if (! $payment->receipt_number) {
            /** @var Payment $payment */
            $payment = $numbering->assignPersisted($payment, 'payment_receipt');
        }

        return response($report->render($payment), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'inline; filename="'.$report->filename($payment).'"',
            'Cache-Control' => 'private, no-store',
        ]);
    }
}
