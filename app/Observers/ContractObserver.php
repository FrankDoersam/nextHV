<?php

namespace App\Observers;

use App\Domain\Contract\Actions\ValidateContract;
use App\Models\Contract;

class ContractObserver
{
    public function saving(Contract $contract): void
    {
        app(ValidateContract::class)->handle($contract);
    }

}
