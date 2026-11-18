<?php

namespace App\Http\Requests\Finance;

use App\Http\Requests\JsonApiActionRequest;
use Illuminate\Validation\Rule;

final class BookMonthlyAutoMatchingRequest extends JsonApiActionRequest
{
    public function rules(): array
    {
        return $this->commandRules([
            'month' => ['required', 'date_format:Y-m'],
            'includeAllSafe' => ['sometimes', 'boolean'],
            'expectedApprovalSnapshot' => ['nullable', 'string', 'regex:/^[a-f0-9]{64}$/'],
            'excludedPaymentIds' => ['sometimes', 'array', 'max:250'],
            'excludedPaymentIds.*' => ['required', 'uuid', 'distinct'],
            'items' => ['sometimes', 'array', 'max:40'],
            'items.*.paymentId' => ['required', 'uuid', 'distinct'],
            'items.*.approvalToken' => ['required', 'string', 'regex:/^[a-f0-9]{64}$/'],
            'manualItems' => ['sometimes', 'array', 'max:40'],
            'manualItems.*.paymentId' => ['required', 'uuid', 'distinct'],
            'manualItems.*.expectedRemaining' => ['required', 'numeric', 'gt:0', 'max:999999999999.99'],
            'manualItems.*.allocations' => ['required', 'array', 'min:1', 'max:200'],
            'manualItems.*.allocations.*.targetType' => ['required', Rule::in(['openItem', 'incomingInvoice'])],
            'manualItems.*.allocations.*.targetId' => ['required', 'uuid'],
            'manualItems.*.allocations.*.amount' => ['required', 'numeric', 'gt:0', 'max:999999999999.99'],
            'manualItems.*.allocations.*.allocationType' => ['nullable', Rule::in(['regular', 'overpayment'])],
            'manualItems.*.allocations.*.discountAmount' => ['nullable', 'numeric', 'min:0', 'max:999999999999.99'],
            'manualItems.*.allocations.*.notes' => ['nullable', 'string', 'max:1000'],
        ]);
    }
}
