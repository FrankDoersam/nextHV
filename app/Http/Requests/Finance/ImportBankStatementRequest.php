<?php

namespace App\Http\Requests\Finance;

use App\Http\Requests\Imports\CsvImportRequest;

final class ImportBankStatementRequest extends CsvImportRequest
{
    public function rules(): array
    {
        return $this->commandRules($this->csvRules() + [
            'bankAccountId' => ['nullable', 'uuid', 'exists:business_partner_bank_accounts,id'],
        ]);
    }
}
