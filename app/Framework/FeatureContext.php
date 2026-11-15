<?php

namespace App\Framework;

use Illuminate\Contracts\Auth\Authenticatable;

/** Created at evaluation time; never cached with a resource definition. */
final readonly class FeatureContext
{
    public function __construct(public ?Authenticatable $actor, public string $locale) {}
}
