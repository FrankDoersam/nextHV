<?php

namespace App\Domain\Contract\Actions;

use App\Models\TerminationNotice;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class ConfirmTermination
{
    public function handle(TerminationNotice $notice, string $endDate): TerminationNotice
    {
        return DB::transaction(function () use ($notice, $endDate): TerminationNotice {
            $notice = TerminationNotice::whereKey($notice->id)->lockForUpdate()->firstOrFail();
            $contract = $notice->contract()->lockForUpdate()->firstOrFail();
            if ($notice->status !== 'received' || $contract->status !== 'active') {
                throw ValidationException::withMessages(['notice' => 'Nur eingegangene Kündigungen aktiver Verträge können bestätigt werden.']);
            }
            if ($contract->conditions()->whereDate('effective_from', '>', $endDate)->exists()) {
                throw ValidationException::withMessages(['confirmed_end_on' => 'Es bestehen Konditionen nach dem gewünschten Enddatum.']);
            }
            $contract->update(['ends_on' => $endDate, 'status' => 'ended']);
            $notice->update(['status' => 'confirmed', 'confirmed_end_on' => $endDate]);

            return $notice;
        });
    }
}
