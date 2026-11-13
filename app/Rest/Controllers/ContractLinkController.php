<?php

namespace App\Rest\Controllers;

use App\Rest\Resources\ContractLinkResource;
use Lomkit\Rest\Http\Controllers\Controller;

class ContractLinkController extends Controller
{
    public static string $resource = ContractLinkResource::class;
}
