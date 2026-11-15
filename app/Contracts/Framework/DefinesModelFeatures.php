<?php

namespace App\Contracts\Framework;

use App\Framework\ModelFeatures;

interface DefinesModelFeatures
{
    public static function framework(): ModelFeatures;
}
