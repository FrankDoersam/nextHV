<?php

namespace App\Services\Finance;

use App\Models\OpenItem;
use App\Models\OpenItemPaymentAgreement;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class OpenItemPaymentAgreementService
{
    /** Confirmed, one-time extension of a particular OP's payment deadline. */
    public function create(OpenItem $openItem, string $payableOn, string $reason, ?string $actorId, ?string $actorLabel): OpenItemPaymentAgreement
    {
        return DB::transaction(function () use ($openItem, $payableOn, $reason, $actorId, $actorLabel): OpenItemPaymentAgreement {
            $row = OpenItem::query()->lockForUpdate()->findOrFail($openItem->id);
            $date = CarbonImmutable::createFromFormat('!Y-m-d', $payableOn);
            if (! $date || $date->lte(CarbonImmutable::today()) || ($row->due_date && $date->lte($row->due_date))) {
                throw ValidationException::withMessages(['payableOn' => 'Das vereinbarte Zahlungsziel muss nach dem heutigen und dem bisherigen Fälligkeitstag liegen.']);
            }
            if (! $row->due_date || $row->direction !== 'debit' || $row->isPayoutLike() || ! $row->contract_id
                || $row->status === 'paid' || (float) $row->open_amount <= 0.004 || $row->source_dunning_notice_id) {
                throw ValidationException::withMessages(['openItem' => 'Eine Fristverlängerung ist nur für eine offene Forderung mit Vertragsbezug möglich.']);
            }
            if ($row->activePaymentAgreement()->exists()) {
                throw ValidationException::withMessages(['openItem' => 'Für diesen offenen Posten besteht bereits eine Vereinbarung. Beenden Sie diese zuerst.']);
            }

            return OpenItemPaymentAgreement::query()->create([
                'receivable_id' => $row->id,
                'active_receivable_id' => $row->id,
                'payable_on' => $date->toDateString(),
                'open_amount_at_creation' => $row->open_amount,
                'reason' => trim($reason),
                'status' => 'active',
                'created_by' => $actorId,
                'created_by_label' => $actorLabel,
            ]);
        });
    }

    /** Explicit release after payment inspection. Ending never issues or cancels a notice. */
    public function end(OpenItem $openItem, string $agreementId, string $reason, ?string $actorId, ?string $actorLabel): OpenItemPaymentAgreement
    {
        return DB::transaction(function () use ($openItem, $agreementId, $reason, $actorId, $actorLabel): OpenItemPaymentAgreement {
            $row = OpenItem::query()->lockForUpdate()->findOrFail($openItem->id);
            $agreement = $row->paymentAgreements()->whereKey($agreementId)->firstOrFail();
            if ($agreement->status === 'ended') {
                // A retry of the same end command is safe; its stored audit remains unchanged.
                return $agreement;
            }
            if ($agreement->status !== 'active' || (string) $agreement->active_receivable_id !== (string) $row->id) {
                throw ValidationException::withMessages(['agreementId' => 'Die Zahlungsvereinbarung ist nicht mehr aktuell.']);
            }
            $agreement->forceFill([
                'active_receivable_id' => null,
                'status' => 'ended',
                'ended_at' => now(),
                'end_reason' => trim($reason),
                'ended_by' => $actorId,
                'ended_by_label' => $actorLabel,
            ])->save();

            return $agreement;
        });
    }

    public function state(OpenItemPaymentAgreement $agreement, float $openAmount, ?CarbonImmutable $today = null): string
    {
        if ($agreement->status !== 'active') return 'ended';
        if ($openAmount <= 0.004) return 'fulfilled';
        return ($today ?? CarbonImmutable::today())->gt($agreement->payable_on) ? 'review_due' : 'deferred';
    }

    /** @return array<string, mixed> */
    public function projection(OpenItemPaymentAgreement $agreement, OpenItem $openItem, ?CarbonImmutable $today = null): array
    {
        return [
            'payableOn' => $agreement->payable_on->toDateString(),
            'reason' => $agreement->reason,
            'status' => $agreement->status,
            'state' => $this->state($agreement, (float) $openItem->open_amount, $today),
            'openAmountAtCreation' => (float) $agreement->open_amount_at_creation,
            'currentOpenAmount' => (float) $openItem->open_amount,
            'createdAt' => $agreement->created_at?->toISOString(),
            'createdByLabel' => $agreement->created_by_label,
            'endedAt' => $agreement->ended_at?->toISOString(),
            'endedByLabel' => $agreement->ended_by_label,
            'endReason' => $agreement->end_reason,
        ];
    }
}
