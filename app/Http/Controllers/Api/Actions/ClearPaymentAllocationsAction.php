<?php

namespace App\Http\Controllers\Api\Actions;

use App\Http\Controllers\Controller;
use App\Models\Payment;
use App\Services\Finance\PaymentAllocationService;
use Illuminate\Http\Response;

final class ClearPaymentAllocationsAction extends Controller
{
    public function __invoke(Payment $payment, PaymentAllocationService $service): Response
    {
        $service->removeAll($payment);
        return response()->noContent();
    }
}
