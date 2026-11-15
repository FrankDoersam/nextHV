<?php

use App\Rest\Resources\BusinessPartnerResource;
use App\Rest\Resources\ContractResource;
use App\Rest\Resources\PropertyResource;
use App\Rest\Resources\UnitResource;

// Opt-in capabilities. Unregistered resources are never exposed by shared tools.
return [
    'properties' => ['resource' => PropertyResource::class, 'label' => 'Objekte', 'import' => ['fields' => ['code', 'name', 'type', 'management_type', 'status', 'street', 'house_number', 'postal_code', 'city', 'country', 'construction_year', 'land_area', 'management_started_on', 'next_inspection_on']], 'audit' => ['code', 'name', 'status', 'city', 'street', 'house_number', 'postal_code'], 'search' => ['subtitle' => ['code', 'city']]],
    'units' => ['resource' => UnitResource::class, 'label' => 'Einheiten', 'import' => ['fields' => ['property_id', 'code', 'name', 'type', 'status', 'floor', 'area', 'rooms', 'has_balcony', 'barrier_free'], 'relations' => ['property_id' => ['resource' => PropertyResource::class, 'match' => ['code', 'name']]]], 'audit' => ['code', 'name', 'property_id', 'type', 'status', 'area'], 'search' => ['subtitle' => ['property.name', 'property.city', 'code']]],
    'business-partners' => ['resource' => BusinessPartnerResource::class, 'label' => 'Geschäftspartner', 'audit' => ['code', 'display_name', 'kind'], 'search' => ['subtitle' => ['code']]],
    'contracts' => ['resource' => ContractResource::class, 'label' => 'Verträge', 'audit' => ['code', 'unit_id', 'type', 'status', 'starts_on', 'ends_on'], 'search' => ['subtitle' => ['unit.name', 'unit.property.name']]],
];
