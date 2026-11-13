<?php

namespace App\Rest\Controllers;

use App\Rest\Resources\BusinessPartnerResource;
use Lomkit\Rest\Http\Controllers\Controller;

class BusinessPartnerController extends Controller
{
    public static string $resource = BusinessPartnerResource::class;
}
