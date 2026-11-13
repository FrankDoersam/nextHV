<?php

namespace App\Rest\Controllers;

use App\Rest\Resources\ContractPartyResource;
use Lomkit\Rest\Http\Controllers\Controller;

class ContractPartyController extends Controller
{
    public static string $resource = ContractPartyResource::class;
}
