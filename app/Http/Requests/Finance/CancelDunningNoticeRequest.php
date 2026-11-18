<?php

namespace App\Http\Requests\Finance;

final class CancelDunningNoticeRequest extends JsonApiActionRequest
{
    public function rules(): array
    {
        return $this->commandRules([
            'reason' => ['required', 'string', 'min:3', 'max:1000'],
        ]);
    }
}
