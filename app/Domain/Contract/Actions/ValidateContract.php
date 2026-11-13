<?php

namespace App\Domain\Contract\Actions;

use App\Models\Contract;
use App\Models\Unit;
use Illuminate\Validation\ValidationException;

final class ValidateContract
{
    public function handle(Contract $contract): void
    {
        $unit = Unit::whereKey($contract->unit_id)->lockForUpdate()->first();
        if (! $unit) {
            throw ValidationException::withMessages(['unit_id' => 'Einheit nicht verfügbar.']);
        }
        if ($contract->minimum_term_until && $contract->minimum_term_until->lt($contract->starts_on)) {
            throw ValidationException::withMessages(['minimum_term_until' => 'Die Mindestlaufzeit endet vor dem Vertragsbeginn.']);
        }
        if ($contract->ends_on && $contract->ends_on->lt($contract->starts_on)) {
            throw ValidationException::withMessages(['ends_on' => 'Das Vertragsende muss nach dem Beginn liegen.']);
        }
        if ($contract->status === 'ended' && ! $contract->ends_on) {
            throw ValidationException::withMessages(['ends_on' => 'Beendete Verträge benötigen ein Enddatum.']);
        }
        if ($contract->status !== 'draft') {
            $overlap = Contract::where('unit_id', $contract->unit_id)->whereIn('status', ['active', 'ended'])->when($contract->exists, fn ($q) => $q->whereKeyNot($contract->id))->where(fn ($q) => $q->whereNull('ends_on')->orWhere('ends_on', '>=', $contract->starts_on->toDateString()))->when($contract->ends_on, fn ($q) => $q->where('starts_on', '<=', $contract->ends_on->toDateString()))->exists();
            if ($overlap) {
                throw ValidationException::withMessages(['starts_on' => 'Die Vertragslaufzeit überschneidet sich mit einem bestehenden Vertrag.']);
            }
        }
    }
}
