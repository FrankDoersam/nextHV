<?php

namespace App\Rest\Actions;

use App\Models\BusinessPartner;

final class CloneBusinessPartner extends CloneConfiguredResource
{
    protected string $cloneModel = BusinessPartner::class;

    protected string $nameField = 'display_name';

    protected string $resourceSlug = 'business-partners';
}
