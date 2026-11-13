<?php

namespace App\Domain\Property\Enums;

enum ManagementType: string
{
    case Rental = 'rental';
    case Condominium = 'condominium';
    case Mixed = 'mixed';
}
