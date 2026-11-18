<?php

namespace App\Http\Requests\Finance;

use Illuminate\Validation\Rule;

class AllocatePaymentRequest extends JsonApiActionRequest
{
    public function rules(): array
    {
        return $this->commandRules([
            'allocations' => ['required', 'array', 'min:1', 'max:200'],
            'allocations.*.targetType' => ['required', Rule::in(['openItem', 'incomingInvoice'])],
            'allocations.*.targetId' => ['required', 'uuid'],
            'allocations.*.amount' => ['required', 'numeric', 'gt:0', 'max:999999999999.99'],
            'allocations.*.allocationType' => ['nullable', Rule::in(['regular', 'overpayment'])],
            'allocations.*.discountAmount' => ['nullable', 'numeric', 'min:0', 'max:999999999999.99'],
            'allocations.*.notes' => ['nullable', 'string', 'max:1000'],
        ]);
    }

    public function attributes(): array
    {
        return [
            'allocations' => 'Zuweisungen',
            'allocations.*.amount' => 'Zuordnungsbetrag',
            'allocations.*.discountAmount' => 'Skontobetrag',
            'allocations.*.allocationType' => 'Buchungsart',
        ];
    }
}
