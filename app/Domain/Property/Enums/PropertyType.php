<?php

namespace App\Domain\Property\Enums;

enum PropertyType: string
{
    case Residential = 'residential';
    case Commercial = 'commercial';
    case Mixed = 'mixed';
}
