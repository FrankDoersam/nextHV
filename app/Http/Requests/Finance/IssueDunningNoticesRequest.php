<?php

namespace App\Http\Requests\Finance;

use App\Models\DunningNotice;
use Illuminate\Validation\Rule;

final class IssueDunningNoticesRequest extends JsonApiActionRequest
{
    public function rules(): array
    {
        return $this->commandRules([
            'requestId' => ['required', 'uuid'],
            'receivableIds' => ['required', 'array', 'min:1', 'max:500'],
            'receivableIds.*' => ['required', 'uuid', Rule::exists('receivables', 'id')->whereNull('deleted_at')],
            'level' => ['required', Rule::in(DunningNotice::LEVELS)],
            'issuedOn' => ['required', 'date_format:Y-m-d'],
            // Zahlungsfrist und Gebühr kommen aus den zentralen Mahnwesen-Einstellungen.
            'paymentDueOn' => ['prohibited'],
            'feeAmount' => ['prohibited'],
        ]);
    }
}
