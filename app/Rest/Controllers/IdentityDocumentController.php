<?php

namespace App\Rest\Controllers;

use App\Rest\Resources\IdentityDocumentResource;
use Lomkit\Rest\Http\Controllers\Controller;

class IdentityDocumentController extends Controller
{
    public static string $resource = IdentityDocumentResource::class;
}
