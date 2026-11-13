<?php

namespace App\Observers;

use App\Models\TerminationNotice;
use Illuminate\Validation\ValidationException;

class TerminationNoticeObserver
{
    public function saving(TerminationNotice $notice): void
    {
        if ($notice->received_on->lt($notice->declared_on)) {
            throw ValidationException::withMessages(['received_on' => 'Der Eingang kann nicht vor der Erklärung liegen.']);
        }
        if ($notice->requested_end_on->lt($notice->contract->starts_on)) {
            throw ValidationException::withMessages(['requested_end_on' => 'Das gewünschte Ende liegt vor dem Vertragsbeginn.']);
        }
        if ($notice->exists && $notice->getOriginal('status') === 'confirmed') {
            throw ValidationException::withMessages(['notice' => 'Bestätigte Kündigungen bleiben historisch erhalten.']);
        }
    }

    public function deleting(TerminationNotice $notice): void
    {
        if ($notice->status === 'confirmed') {
            throw ValidationException::withMessages(['notice' => 'Bestätigte Kündigungen bleiben historisch erhalten.']);
        }
    }
}
