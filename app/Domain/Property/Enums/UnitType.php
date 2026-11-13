<?php

namespace App\Domain\Property\Enums;

enum UnitType: string
{
    case Apartment = 'apartment';
    case Commercial = 'commercial';
    case Garage = 'garage';
    case Parking = 'parking';
    case Storage = 'storage';
}
