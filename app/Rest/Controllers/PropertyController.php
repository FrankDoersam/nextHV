<?php

namespace App\Rest\Controllers;

use App\Rest\Resources\PropertyResource;
use Lomkit\Rest\Http\Controllers\Controller;

class PropertyController extends Controller
{
    public static string $resource = PropertyResource::class;
}
