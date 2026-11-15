<?php

use App\Rest\Resources\BusinessPartnerResource;
use App\Rest\Resources\ContractResource;
use App\Rest\Resources\PropertyResource;
use App\Rest\Resources\UnitResource;

// Opt-in capabilities. Unregistered resources are never exposed by shared tools.
return [
    'properties' => ['resource' => PropertyResource::class, 'label' => 'Objekte', 'audit' => ['code', 'name', 'status', 'city', 'street', 'house_number', 'postal_code'], 'search' => ['subtitle' => ['code', 'city']]],
    'units' => ['resource' => UnitResource::class, 'label' => 'Einheiten', 'audit' => ['code', 'name', 'property_id', 'type', 'status', 'area'], 'search' => ['subtitle' => ['property.name', 'property.city', 'code']]],
    'business-partners' => ['resource' => BusinessPartnerResource::class, 'label' => 'Geschäftspartner', 'audit' => ['code', 'display_name', 'kind'], 'search' => ['subtitle' => ['code']]],
    'contracts' => ['resource' => ContractResource::class, 'label' => 'Verträge', 'audit' => ['code', 'unit_id', 'type', 'status', 'starts_on', 'ends_on'], 'search' => ['subtitle' => ['unit.name', 'unit.property.name']]],
];
