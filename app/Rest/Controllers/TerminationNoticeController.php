<?php

namespace App\Rest\Controllers;

use App\Rest\Resources\TerminationNoticeResource;
use Lomkit\Rest\Http\Controllers\Controller;

class TerminationNoticeController extends Controller
{
    public static string $resource = TerminationNoticeResource::class;
}
