<?php

namespace App\Http\Requests\Finance;

use App\Services\OperatingCosts\ExternalHeatingCostService;
use Illuminate\Validation\Rule;

final class ApplyExternalHeatingCostRequest extends JsonApiActionRequest
{
    public function rules(): array
    {
        return $this->commandRules([
            'amount' => ['required', 'numeric', 'min:0', 'max:99999999.99'],
            'advanceScope' => ['required', Rule::in(ExternalHeatingCostService::ADVANCE_SCOPES)],
        ]);
    }
}
