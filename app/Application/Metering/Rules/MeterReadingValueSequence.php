<?php

namespace App\Application\Metering\Rules;

use App\Models\Meter;
use App\Models\MeterReading;
use App\Support\Meters\MeterValueFormatter;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class MeterReadingValueSequence implements ValidationRule
{
    public function __construct(
        private readonly ?Meter $meter,
        private readonly ?MeterReading $reading,
        private readonly ?string $referenceDate,
    ) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! $this->meter || ! $this->referenceDate || ! is_numeric($value)) return;

        $siblings = MeterReading::query()
            ->where('meter_id', $this->meter->id)
            ->when($this->reading, fn ($query) => $query->whereKeyNot($this->reading->getKey()));

        $previous = (clone $siblings)->whereDate('reference_date', '<', $this->referenceDate)
            ->orderByDesc('reference_date')->orderByDesc('reading_date')->first();
        if ($previous && (float) $value <= (float) $previous->value) {
            $fail(sprintf('Der neue Zählerstand muss größer als der vorherige Stand von %s sein.', MeterValueFormatter::format($previous->value, $this->meter->unit_of_measure)));
            return;
        }

        $next = (clone $siblings)->whereDate('reference_date', '>', $this->referenceDate)
            ->orderBy('reference_date')->orderBy('reading_date')->first();
        if ($next && (float) $next->value <= (float) $value) {
            $fail(sprintf('Der Zählerstand muss kleiner als der bereits vorhandene spätere Stand von %s sein.', MeterValueFormatter::format($next->value, $this->meter->unit_of_measure)));
        }
    }
}
