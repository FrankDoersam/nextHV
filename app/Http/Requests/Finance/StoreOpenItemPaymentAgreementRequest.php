<?php

namespace App\Http\Requests\Finance;

final class StoreOpenItemPaymentAgreementRequest extends JsonApiActionRequest
{
    public function rules(): array
    {
        return $this->commandRules([
            'payableOn' => ['required', 'date_format:Y-m-d'],
            'reason' => ['required', 'string', 'max:2000'],
        ]);
    }
}
