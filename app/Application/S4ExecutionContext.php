<?php

namespace App\Application;

use App\Models\User;
use Carbon\CarbonImmutable;

final readonly class S4ExecutionContext
{
    public function __construct(
        public User $actor,
        public CarbonImmutable $now,
        public string $channel,
        public ?string $clientName = null,
    ) {}

    public static function fromUser(User $user, string $channel = 'application', ?string $clientName = null): self
    {
        return new self(
            $user,
            CarbonImmutable::now((string) config('app.timezone', 'Europe/Berlin')),
            $channel,
            $clientName,
        );
    }

    public function today(): string
    {
        return $this->now->toDateString();
    }
}
