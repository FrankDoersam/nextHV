<?php

namespace App\Application\Metering\Rules;

use App\Models\Meter;
use Carbon\CarbonImmutable;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class MeterReadingDate implements ValidationRule
{
    public function __construct(private readonly ?Meter $meter) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! $this->meter || ! is_string($value)) return;

        try {
            $date = CarbonImmutable::parse($value)->startOfDay();
        } catch (\Throwable) {
            return;
        }

        if ($this->meter->installation_date && $date->lt($this->meter->installation_date->startOfDay())) {
            $fail('Das Ablesedatum darf nicht vor dem Einbaudatum des Zählers liegen.');
            return;
        }
        if ($this->meter->removed_on && $date->gt($this->meter->removed_on->startOfDay())) {
            $fail('Das Ablesedatum darf nicht nach dem Ausbaudatum des Zählers liegen.');
        }
    }
}
