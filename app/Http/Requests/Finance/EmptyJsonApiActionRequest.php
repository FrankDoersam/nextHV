<?php

namespace App\Http\Requests\Finance;

final class EmptyJsonApiActionRequest extends JsonApiActionRequest
{
    public function rules(): array
    {
        return $this->commandRules([]);
    }
}
