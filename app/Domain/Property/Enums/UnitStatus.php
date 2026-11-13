<?php

namespace App\Domain\Property\Enums;

enum UnitStatus: string
{
    case Ready = 'ready';
    case Maintenance = 'maintenance';
}
