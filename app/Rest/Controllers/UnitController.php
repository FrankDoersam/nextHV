<?php

namespace App\Rest\Controllers;

use App\Rest\Resources\UnitResource;
use Lomkit\Rest\Http\Controllers\Controller;

class UnitController extends Controller
{
    public static string $resource = UnitResource::class;
}
