<?php

namespace App\Contracts\Framework;

use App\Framework\AuditDefinition;

interface HasAuditTrail
{
    public static function auditTrail(): AuditDefinition;
}
