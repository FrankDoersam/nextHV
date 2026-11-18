<?php

namespace App\Http\Requests\Imports;

use App\Http\Requests\JsonApiActionRequest;

class CsvImportRequest extends JsonApiActionRequest
{
    public function rules(): array
    {
        return $this->commandRules($this->csvRules());
    }

    /** @return array<string, mixed> */
    protected function csvRules(): array
    {
        return [
            'fileName' => ['required', 'string', 'max:255'],
            'fileHash' => ['required', 'string', 'size:64', 'regex:/^[a-fA-F0-9]{64}$/'],
            'source' => ['nullable', 'string', 'max:32'],
            'csv' => ['required', 'string', 'max:5242880'],
            'preview' => ['required', 'boolean'],
        ];
    }
}
