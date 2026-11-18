<?php

namespace App\Http\Requests\Finance;

final class EndOpenItemPaymentAgreementRequest extends JsonApiActionRequest
{
    public function rules(): array
    {
        return $this->commandRules([
            'agreementId' => ['required', 'uuid'],
            'reason' => ['required', 'string', 'max:2000'],
        ]);
    }
}
