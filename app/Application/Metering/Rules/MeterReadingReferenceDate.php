<?php

namespace App\Application\Metering\Rules;

use App\Models\Meter;
use App\Models\MeterReading;
use Carbon\CarbonImmutable;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class MeterReadingReferenceDate implements ValidationRule
{
    public function __construct(
        private readonly ?Meter $meter,
        private readonly ?MeterReading $reading,
        private readonly bool $creating,
    ) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! $this->meter || ! is_string($value)) return;

        if ($this->creating && $this->meter->status !== 'active') {
            $fail($this->meter->status === 'removed'
                ? 'Für einen ausgebauten Zähler können keine neuen Ablesungen erfasst werden. Vorhandene Ablesungen können weiterhin korrigiert werden.'
                : 'Neue Ablesungen können nur für einen aktiven Zähler erfasst werden.');
            return;
        }

        try {
            $date = CarbonImmutable::parse($value)->startOfDay();
        } catch (\Throwable) {
            return;
        }

        if ($this->meter->installation_date && $date->lt($this->meter->installation_date->startOfDay())) {
            $fail('Der Stichtag darf nicht vor dem Einbaudatum des Zählers liegen.');
            return;
        }
        if ($this->meter->removed_on && $date->gt($this->meter->removed_on->startOfDay())) {
            $fail('Der Stichtag darf nicht nach dem Ausbaudatum des Zählers liegen.');
            return;
        }

        if (MeterReading::query()
            ->where('meter_id', $this->meter->id)
            ->whereDate('reference_date', $date->toDateString())
            ->when($this->reading, fn ($query) => $query->whereKeyNot($this->reading->getKey()))
            ->exists()) {
            $fail('Für diesen Stichtag existiert bereits eine Ablesung. Bitte bearbeiten Sie den vorhandenen Datensatz.');
        }
    }
}
