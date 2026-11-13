<?php

namespace App\Policies;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

class ContractPolicy extends ResourcePolicy
{
    public function update(User $user, Model $model): bool
    {
        return parent::update($user, $model);
    }
}
