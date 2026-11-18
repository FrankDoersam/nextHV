<?php

namespace App\Services\Auth;

use Illuminate\Http\Request;

final class SecurityFingerprint
{
    public function subject(string $identifier): string
    {
        return hash_hmac(
            'sha256',
            mb_strtolower(trim($identifier)),
            $this->key(),
        );
    }

    public function ip(Request $request): ?string
    {
        $ip = trim((string) $request->ip());

        return $ip === '' ? null : hash_hmac('sha256', $ip, $this->key());
    }

    private function key(): string
    {
        $key = (string) config('app.key');

        return $key !== '' ? $key : 's4-security-fingerprint';
    }
}
