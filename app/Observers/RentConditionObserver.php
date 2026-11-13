<?php

namespace App\Observers;

use App\Models\RentCondition;
use Carbon\Carbon;
use Illuminate\Validation\ValidationException;

class RentConditionObserver
{
    public function saving(RentCondition $condition): void
    {
        $contract = $condition->contract()->lockForUpdate()->first();
        if (! $contract) {
            throw ValidationException::withMessages(['contract_id' => 'Vertrag nicht verfügbar.']);
        }
        if ($condition->effective_from->lt($contract->starts_on) || ($contract->ends_on && $condition->effective_from->gt($contract->ends_on))) {
            throw ValidationException::withMessages(['effective_from' => 'Der Gültigkeitsbeginn muss innerhalb der Vertragslaufzeit liegen.']);
        }
        if ($condition->exists && $contract->status !== 'draft' && Carbon::parse($condition->getRawOriginal('effective_from'))->lte(today())) {
            throw ValidationException::withMessages(['effective_from' => 'Gültige Konditionen bleiben historisch erhalten. Bitte eine neue Kondition anlegen.']);
        }
        if (RentCondition::where('contract_id', $condition->contract_id)->whereDate('effective_from', $condition->effective_from)->when($condition->exists, fn ($q) => $q->whereKeyNot($condition->id))->exists()) {
            throw ValidationException::withMessages(['effective_from' => 'Für diesen Stichtag gibt es bereits eine Kondition.']);
        }
    }

    public function deleting(RentCondition $condition): void
    {
        if ($condition->contract->status !== 'draft') {
            throw ValidationException::withMessages(['condition' => 'Konditionen aktivierter Verträge bleiben historisch erhalten.']);
        }
    }
}
