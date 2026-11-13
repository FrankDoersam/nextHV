<?php

namespace App\Support\Permissions;

use App\Contracts\PermissionAdapter;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

final class AllowAllAdapter implements PermissionAdapter
{
    public function allows(User $user, string $ability, ?Model $model = null): bool
    {
        return true;
    }
}
