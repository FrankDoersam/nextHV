<?php

namespace App\Policies;

use App\Contracts\PermissionAdapter;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

class ResourcePolicy
{
    protected function check(User $user, string $ability, ?Model $model = null): bool
    {
        // The adapter is deliberately not resolved or executed until explicitly enabled.
        return ! config('nexthv.permissions.enabled') || app(PermissionAdapter::class)->allows($user, $ability, $model);
    }

    public function viewAny(User $user): bool
    {
        return $this->check($user, 'viewAny');
    }

    public function view(User $user, Model $model): bool
    {
        return $this->check($user, 'view', $model);
    }

    public function create(User $user): bool
    {
        return $this->check($user, 'create');
    }

    public function update(User $user, Model $model): bool
    {
        return $this->check($user, 'update', $model);
    }

    public function delete(User $user, Model $model): bool
    {
        return $this->check($user, 'delete', $model);
    }

    public function restore(User $user, Model $model): bool
    {
        return $this->check($user, 'restore', $model);
    }

    public function forceDelete(User $user, Model $model): bool
    {
        return false;
    }
}
