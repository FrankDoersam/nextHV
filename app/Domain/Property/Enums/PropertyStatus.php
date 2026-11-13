<?php

namespace App\Domain\Property\Enums;

enum PropertyStatus: string
{
    case Active = 'active';
    case Archived = 'archived';
}
