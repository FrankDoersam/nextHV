<?php

namespace App\Contracts\Framework;

use App\Framework\ImportDefinition;

interface HasCsvImport
{
    public function csvImport(): ImportDefinition;
}
