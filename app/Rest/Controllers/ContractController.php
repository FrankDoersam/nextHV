<?php

namespace App\Rest\Controllers;

use App\Rest\Resources\ContractResource;
use Lomkit\Rest\Http\Controllers\Controller;

class ContractController extends Controller
{
    public static string $resource = ContractResource::class;
}
