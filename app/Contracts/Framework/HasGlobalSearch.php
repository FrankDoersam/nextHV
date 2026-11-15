<?php

namespace App\Contracts\Framework;

use App\Framework\SearchDefinition;

interface HasGlobalSearch
{
    public function globalSearch(): SearchDefinition;
}
