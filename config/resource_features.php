<?php

use App\Rest\Resources\BusinessPartnerResource;
use App\Rest\Resources\ContractResource;
use App\Rest\Resources\PropertyResource;
use App\Rest\Resources\UnitResource;

// Opt-in capabilities. Unregistered resources are never exposed by shared tools.
return [
    'properties' => ['resource' => PropertyResource::class, 'label' => 'Objekte', 'search' => ['subtitle' => ['code', 'city']]],
    'units' => ['resource' => UnitResource::class, 'label' => 'Einheiten', 'search' => ['subtitle' => ['property.name', 'property.city', 'code']]],
    'business-partners' => ['resource' => BusinessPartnerResource::class, 'label' => 'Geschäftspartner', 'search' => ['subtitle' => ['code']]],
    'contracts' => ['resource' => ContractResource::class, 'label' => 'Verträge', 'search' => ['subtitle' => ['unit.name', 'unit.property.name']]],
];
