<?php

namespace App\Contracts\Framework;

use App\Framework\Feature;
use App\Framework\FeatureContext;

/** Additional availability restriction, never a substitute for REST policies. */
interface HasFeatureAvailability
{
    public function featureAvailable(Feature $feature, FeatureContext $context): bool;
}
