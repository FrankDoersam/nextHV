<?php

namespace App\Http\Controllers\Api\Actions;

use App\Http\Controllers\Controller;
use App\Http\Requests\Finance\AllocatePaymentRequest;
use App\Models\Payment;
use App\Services\Finance\PaymentAllocationService;
use Illuminate\Http\Response;

final class AllocatePaymentAction extends Controller
{
    public function __invoke(AllocatePaymentRequest $request, Payment $payment, PaymentAllocationService $service): Response
    {
        $service->allocate($payment, $request->validated('allocations'), $request->user()?->id);
        return response()->noContent();
    }
}
