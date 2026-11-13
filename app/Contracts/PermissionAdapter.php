<?php

namespace App\Contracts;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

interface PermissionAdapter
{
    public function allows(User $user, string $ability, ?Model $model = null): bool;
}
