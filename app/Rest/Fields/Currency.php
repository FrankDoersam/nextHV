<?php

namespace App\Rest\Fields;

use Lomkit\Rest\Fields\Number;

/** Decimal major currency units at the API boundary; persisted as DECIMAL(12,2). */
class Currency extends Number
{
    public static function make(string $name): static
    {
        return parent::make($name)->rules('numeric', 'min:0', 'max:9999999999.99', 'decimal:0,2');
    }
}
