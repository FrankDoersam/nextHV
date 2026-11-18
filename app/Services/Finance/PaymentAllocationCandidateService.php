<?php

namespace App\Services\Finance;

use App\Models\ContractParty;
use App\Models\IncomingInvoice;
use App\Models\OpenItem;
use App\Models\Payment;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

final class PaymentAllocationCandidateService
{
    private const STANDARD_BEFORE = 45;
    private const STANDARD_AFTER = 35;
    private const WIDE_BEFORE = 180;
    private const WIDE_AFTER = 62;
    private const SUGGESTION_LIMIT = 25;
    private const LIST_LIMIT = 100;

    public function __construct(private readonly PaymentAllocationMatchContextService $matchContext) {}

    /** @return array{data:Collection<int,array<string,mixed>>,meta:array<string,mixed>} */
    public function candidates(Payment $payment, string $mode, string $search): array
    {
        $data = $payment->direction === 'credit'
            ? $this->openItems($payment, $mode, $search, false)->concat($this->supplierRefundCandidates($payment, $search))->values()
            : $this->openItems($payment, $mode, $search, true)->concat($this->invoices($payment, $mode, $search))->values();

        if ($payment->direction === 'credit' && $mode === 'suggestions' && $search === '') {
            $data = $this->withOpenItemRecommendations($payment, $data);
        }

        return [
            'data' => $data,
            'meta' => [
                'direction' => $payment->direction,
                'mode' => $mode,
                'targetPeriod' => $payment->direction === 'credit' ? $this->targetPeriod($payment) : null,
                'match' => $payment->direction === 'credit' ? $this->matchContext->responseMeta($payment) : null,
            ],
        ];
    }

    private function supplierRefundCandidates(Payment $payment, string $search): Collection
    {
        if ($payment->direction !== 'credit') return collect();
        $query = IncomingInvoice::query()
            ->where('document_type', 'credit')
            ->whereHas('originalInvoice', fn (Builder $q) => $q->whereRaw(
                'incoming_invoices.paid_amount + (select coalesce(sum(c.gross_amount - c.paid_amount),0) from incoming_invoices c where c.original_invoice_id = incoming_invoices.id and c.deleted_at is null) > incoming_invoices.gross_amount'
            ))
            ->whereColumn('paid_amount', '<', 'gross_amount')
            ->with(['supplier:id,display_name', 'property:id,name', 'originalInvoice:id,number,gross_amount,paid_amount', 'originalInvoice.credits:id,original_invoice_id,gross_amount,paid_amount'])
            ->when($search !== '', fn (Builder $q) => $this->searchInvoices($q, $search))
            ->orderByDesc('invoice_date')
            ->limit(self::LIST_LIMIT);
        return $query->get()->map(function (IncomingInvoice $credit): array {
            $refund = min(
                (float) $credit->gross_amount - (float) $credit->paid_amount,
                (float) $credit->originalInvoice->refund_due_amount
            );
            $row = $this->invoiceResource($credit, 'Lieferantenerstattung zur Rechnung '.$credit->originalInvoice->number);
            $row['attributes']['openAmount'] = round(max(0, $refund), 2);
            $row['attributes']['documentType'] = 'credit';
            $row['attributes']['discountAmount'] = 0;
            return $row;
        })->filter(fn (array $row) => $row['attributes']['openAmount'] > 0.001)->values();
    }

    private function openItems(Payment $payment, string $mode, string $search, bool $payoutLike): Collection
    {
        $query = $this->openItemQuery();
        $payoutLike ? $query->whereIn('type', ['deposit_refund', 'settlement_credit']) : $query->whereNotIn('type', ['deposit_refund', 'settlement_credit']);
        if ($mode === 'overpayment') {
            if ($payoutLike) return collect();
            return $query->where('status', 'paid')->where('open_amount', '<=', 0)
                ->when($search !== '', fn (Builder $q) => $this->searchOpenItems($q, $search))
                ->orderByDesc('settled_at')->limit(self::LIST_LIMIT)->get()
                ->map(fn (OpenItem $row) => $this->openItemResource($row, null, $payment))->values();
        }

        if ($mode === 'all' && $search !== '') {
            return $query
                ->where(function (Builder $q) use ($search): void {
                    $this->searchOpenItems($q, $search);
                })
                ->where(function (Builder $q): void {
                    $q->where(function (Builder $open): void {
                        $open->whereIn('status', ['open', 'partial'])->where('open_amount', '>', 0);
                    })->orWhere(function (Builder $paid): void {
                        $paid->where('status', 'paid')->where('open_amount', '<=', 0);
                    });
                })
                ->orderByRaw("CASE WHEN status = 'paid' THEN 1 ELSE 0 END")
                ->orderBy('due_date')->orderBy('number')
                ->limit(self::LIST_LIMIT)
                ->get()
                ->map(fn (OpenItem $row) => $this->openItemResource($row, null, $payment))->values();
        }

        $query->whereIn('status', ['open', 'partial'])->where('open_amount', '>', 0);
        if ($mode !== 'suggestions') {
            return $query->when($search !== '', fn (Builder $q) => $this->searchOpenItems($q, $search))
                ->orderBy('due_date')->orderBy('number')->get()
                ->map(fn (OpenItem $row) => $this->openItemResource($row, null, $payment))->values();
        }

        $date = $this->referenceDate($payment);
        $text = $this->paymentText($payment);
        $terms = $this->terms($text);
        $history = $this->historicalContractIds($payment);
        $rows = $this->openItemPool($query, $date, $history, $terms, false);
        if ($rows->isEmpty()) {
            $fallback = $this->openItemQuery()->whereIn('status', ['open', 'partial'])->where('open_amount', '>', 0);
            $payoutLike ? $fallback->whereIn('type', ['deposit_refund', 'settlement_credit']) : $fallback->whereNotIn('type', ['deposit_refund', 'settlement_credit']);
            $rows = $this->openItemPool($fallback, $date, $history, $terms, true);
        }

        $ranked = $rows->map(function (OpenItem $row) use ($payment, $date, $history, $text, $terms): array {
            [$score, $reason] = $this->scoreOpenItem($row, $payment, $date, $history, $text, $terms);
            return compact('row', 'score', 'reason');
        })->sortByDesc('score')->take(self::SUGGESTION_LIMIT)->values();

        if ($search !== '') {
            $needle = $this->normalize($search);
            $ranked = $ranked->filter(fn (array $item) => str_contains($this->openItemText($item['row']), $needle))->values();
        }

        return $ranked->map(fn (array $item) => $this->openItemResource($item['row'], $item['reason'], $payment))->values();
    }

    private function invoices(Payment $payment, string $mode, string $search): Collection
    {
        $query = $this->invoiceQuery();
        if ($mode !== 'suggestions') {
            return $query->when($search !== '', fn (Builder $q) => $this->searchInvoices($q, $search))
                ->orderBy('due_date')->orderBy('number')->get()
                ->map(fn (IncomingInvoice $row) => $this->invoiceResource($row, null))->values();
        }

        $date = $this->referenceDate($payment);
        $text = $this->paymentText($payment);
        $terms = $this->terms($text);
        $history = $this->historicalSupplierIds($payment);
        $rows = $query->whereBetween('due_date', [$date->subDays(self::STANDARD_BEFORE), $date->addDays(self::STANDARD_AFTER)])->limit(250)->get();
        if ($rows->isEmpty()) {
            $rows = $this->invoiceQuery()->whereBetween('due_date', [$date->subDays(self::WIDE_BEFORE), $date->addDays(self::WIDE_AFTER)])->limit(250)->get();
        }

        $ranked = $rows->map(function (IncomingInvoice $row) use ($payment, $date, $history, $text, $terms): array {
            [$score, $reason] = $this->scoreInvoice($row, $payment, $date, $history, $text, $terms);
            return compact('row', 'score', 'reason');
        })->sortByDesc('score')->take(self::SUGGESTION_LIMIT)->values();

        if ($search !== '') {
            $needle = $this->normalize($search);
            $ranked = $ranked->filter(fn (array $item) => str_contains($this->invoiceText($item['row']), $needle))->values();
        }

        return $ranked->map(fn (array $item) => $this->invoiceResource($item['row'], $item['reason']))->values();
    }

    private function withOpenItemRecommendations(Payment $payment, Collection $resources): Collection
    {
        $remaining = round((float) $payment->unallocated_amount, 2);
        // A fully settled OP may still be the correct target for a later
        // overpayment. Do not stop before checking the historical paid OP.
        if ($remaining <= 0.001) return $resources;

        $targetPeriod = $this->targetPeriod($payment);
        $history = $this->historicalContractIds($payment);
        $recommendedIndexes = [];

        foreach ($resources as $index => $resource) {
            $attributes = (array) ($resource['attributes'] ?? []);
            $contractId = (string) ($attributes['contractId'] ?? '');
            $serviceMonth = (string) ($attributes['serviceMonth'] ?? '');
            $reason = trim((string) ($attributes['recommendationReason'] ?? ''));
            $historyMatch = $contractId !== '' && in_array($contractId, $history, true);
            $periodMatch = $targetPeriod === null || str_starts_with($serviceMonth, $targetPeriod);

            if (! $periodMatch || (! $historyMatch && $reason === '')) continue;

            $open = max(0.0, round((float) ($attributes['openAmount'] ?? 0), 2));
            if ($open <= 0.001 || $remaining <= 0.001) continue;

            $amount = min($remaining, $open);
            $resource['attributes']['recommendationAmount'] = round($amount, 2);
            $resource['attributes']['recommendationOverpaymentAmount'] = 0.0;
            $resource['attributes']['recommendationReason'] = $this->recommendationReason($payment, $historyMatch, $targetPeriod, $reason);
            $resources[$index] = $resource;
            $recommendedIndexes[] = $index;
            $remaining = round($remaining - $amount, 2);
        }

        if ($remaining > 0.001 && $recommendedIndexes !== []) {
            $preferred = collect($recommendedIndexes)->filter(function (int $index) use ($resources): bool {
                $attributes = (array) ($resources[$index]['attributes'] ?? []);
                $text = $this->normalize(implode(' ', array_filter([
                    $attributes['costArea'] ?? null,
                    $attributes['description'] ?? null,
                    $attributes['number'] ?? null,
                ])));
                return str_contains($text, 'nebenkosten') || str_contains($text, 'betriebskosten') || str_contains($text, 'heizkosten') || str_contains($text, 'nka') || str_contains($text, 'hka');
            })->values();
            $targets = $preferred->isNotEmpty() ? $preferred : collect($recommendedIndexes);
            $count = $targets->count();
            $share = $count > 0 ? floor(($remaining / $count) * 100) / 100 : 0.0;

            foreach ($targets as $position => $index) {
                $extra = $position === $count - 1 ? $remaining : min($share, $remaining);
                if ($extra <= 0.001) continue;
                $resource = $resources[$index];
                $resource['attributes']['recommendationAmount'] = round((float) $resource['attributes']['recommendationAmount'] + $extra, 2);
                $resource['attributes']['recommendationOverpaymentAmount'] = round((float) ($resource['attributes']['recommendationOverpaymentAmount'] ?? 0) + $extra, 2);
                $resource['attributes']['recommendationReason'] = trim((string) ($resource['attributes']['recommendationReason'] ?? '').' Inklusive '.number_format($extra, 2, ',', '.').' € Überzahlung.');
                $resources[$index] = $resource;
                $remaining = round($remaining - $extra, 2);
            }
        }

        if ($remaining > 0.001 && $recommendedIndexes === [] && $history !== []) {
            $paid = $this->overpaymentCandidate($history, $targetPeriod);
            if ($paid) {
                $resource = $this->openItemResource($paid, 'Passender, bereits ausgeglichener Posten für die Überzahlung.', $payment);
                $resource['attributes']['recommendationAmount'] = $remaining;
                $resource['attributes']['recommendationOverpaymentAmount'] = $remaining;
                $resources->prepend($resource);
            }
        }

        return $resources->values();
    }

    private function overpaymentCandidate(array $history, ?string $targetPeriod): ?OpenItem
    {
        $query = $this->openItemQuery()
            ->whereNotIn('type', ['deposit_refund', 'settlement_credit'])
            ->where('status', 'paid')
            ->where('open_amount', '<=', 0)
            ->whereIn('contract_id', $history);

        if ($targetPeriod !== null) {
            $query->where(function (Builder $q) use ($targetPeriod): void {
                $q->where('service_month', 'like', $targetPeriod.'%')
                    ->orWhere('due_date', 'like', $targetPeriod.'%');
            });
        }

        return $query->orderByDesc('settled_at')->orderByDesc('due_date')->first();
    }

    private function recommendationReason(Payment $payment, bool $historyMatch, ?string $targetPeriod, string $existing): string
    {
        $parts = [];
        if ($historyMatch) $parts[] = 'Vertrag passt zur Zahlungsidentität oder bestätigten Zahlungshistorie';
        if ($targetPeriod !== null) $parts[] = 'passender Zielmonat '.$targetPeriod;
        $targetReason = trim($this->matchContext->targetPeriodReason($payment));
        if ($targetReason !== '') $parts[] = rtrim($targetReason, '.');
        if ($existing !== '') $parts[] = rtrim($existing, '.');
        return ucfirst(implode('; ', array_unique($parts))).'.';
    }

    private function targetPeriod(Payment $payment): ?string
    {
        return $this->matchContext->targetPeriod($payment);
    }

    private function openItemPool(Builder $query, CarbonImmutable $date, array $history, array $terms, bool $wide): Collection
    {
        if ($history !== [] || $terms !== []) {
            $query->where(function (Builder $match) use ($history, $terms): void {
                if ($history !== []) $match->orWhereIn('contract_id', $history);
                foreach ($terms as $term) {
                    $match->orWhere('number', 'like', "%{$term}%")
                        ->orWhere('external_number', 'like', "%{$term}%")
                        ->orWhere('description', 'like', "%{$term}%")
                        ->orWhereHas('contract', fn (Builder $q) => $q->where('contract_number', 'like', "%{$term}%"));
                }
            });
        }
        $before = $wide ? self::WIDE_BEFORE : self::STANDARD_BEFORE;
        $after = $wide ? self::WIDE_AFTER : self::STANDARD_AFTER;
        return $query->whereBetween('due_date', [$date->subDays($before), $date->addDays($after)])->limit(250)->get();
    }

    private function scoreOpenItem(OpenItem $row, Payment $payment, CarbonImmutable $date, array $history, string $text, array $terms): array
    {
        $score = 0.0;
        $reasons = [];
        $contextMatched = false;
        $targetPeriod = $this->targetPeriod($payment);

        if ($row->contract_id && in_array($row->contract_id, $history, true)) {
            $score += 420000;
            $contextMatched = true;
            $reasons[] = 'Vertrag passt zur Zahlungsidentität oder Zahlungshistorie';
        }
        if ($targetPeriod !== null && (($row->service_month && $row->service_month->format('Y-m') === $targetPeriod) || ($row->due_date && $row->due_date->format('Y-m') === $targetPeriod))) {
            $score += 780000;
            $contextMatched = true;
            $reasons[] = 'Forderungsmonat passt zum ermittelten Zielmonat '.$targetPeriod;
        }
        foreach (array_filter([$row->number, $row->external_number, $row->contract?->contract_number]) as $identifier) {
            $identifier = $this->normalize((string) $identifier);
            if ($identifier !== '' && str_contains($text, $identifier)) {
                $score += 60000;
                $contextMatched = true;
                $reasons[] = 'Posten- oder Vertragsnummer steht im Zahlungstext';
                break;
            }
        }
        if ($this->containsTerm($this->openItemText($row), $terms)) {
            $score += 25000;
            $contextMatched = true;
            $reasons[] = 'Zahlungstext passt zum offenen Posten';
        }

        $open = round((float) $row->open_amount, 2);
        $remaining = round((float) $payment->unallocated_amount, 2);
        if (abs($remaining - $open) <= 0.01) {
            $score += 1000000;
            if ($contextMatched) $reasons[] = 'Zahlungsrest entspricht exakt dem offenen Betrag';
        } elseif ($open > 0 && $remaining / $open >= 0.5) {
            $score += 120000 * min(1, $remaining / $open);
        }
        if ($row->due_date) $score -= abs($date->diffInDays(CarbonImmutable::parse($row->due_date), false)) * 100;

        return [$score, $contextMatched ? ucfirst(implode('; ', array_unique($reasons))).'.' : null];
    }

    private function scoreInvoice(IncomingInvoice $row, Payment $payment, CarbonImmutable $date, array $history, string $text, array $terms): array
    {
        $score = 0.0;
        $reasons = [];
        $contextMatched = false;
        if ($row->supplier_id && in_array($row->supplier_id, $history, true)) {
            $score += 340000;
            $contextMatched = true;
            $reasons[] = 'gleicher Lieferant wie bei früheren Zahlungen dieser Gegenpartei';
        }
        foreach (array_filter([$row->number, $row->external_number]) as $identifier) {
            $identifier = $this->normalize((string) $identifier);
            if ($identifier !== '' && str_contains($text, $identifier)) {
                $score += 60000;
                $contextMatched = true;
                $reasons[] = 'Rechnungsnummer steht im Zahlungstext';
                break;
            }
        }
        if ($this->containsTerm($this->invoiceText($row), $terms)) {
            $score += 25000;
            $contextMatched = true;
            $reasons[] = 'Zahlungstext passt zur Rechnung';
        }
        $discount = $row->discount_until && $date->lte(CarbonImmutable::parse($row->discount_until)) ? max(0, (float) $row->discount_amount) : 0.0;
        $payable = max(0, round((float) $row->open_amount - $discount, 2));
        $remaining = round((float) $payment->unallocated_amount, 2);
        if (abs($remaining - $payable) <= 0.01 || abs($remaining - (float) $row->open_amount) <= 0.01) {
            $score += 1000000;
            if ($contextMatched) $reasons[] = $discount > 0 ? 'Zahlungsbetrag entspricht dem Rechnungsbetrag unter Berücksichtigung von Skonto' : 'Zahlungsbetrag entspricht exakt dem offenen Rechnungsbetrag';
        }
        if ($row->due_date) $score -= abs($date->diffInDays(CarbonImmutable::parse($row->due_date), false)) * 100;
        return [$score, $contextMatched ? ucfirst(implode('; ', array_unique($reasons))).'.' : null];
    }

    /** @return array<int,string> */
    private function historicalContractIds(Payment $payment): array
    {
        $linked = $this->matchContext->linkedContractIds($payment);
        if (! $this->hasIdentity($payment)) return $linked;

        $query = OpenItem::query()
            ->select('receivables.contract_id')
            ->join('payment_allocations', 'payment_allocations.receivable_id', '=', 'receivables.id')
            ->join('payments', 'payments.id', '=', 'payment_allocations.payment_id')
            ->whereNotNull('receivables.contract_id')
            ->whereNull('payment_allocations.deleted_at')
            ->whereNull('payments.deleted_at')
            ->where('payments.id', '!=', $payment->id);
        $this->paymentIdentity($query, $payment);
        $historical = $query->orderByDesc('payment_allocations.booked_at')->limit(100)->pluck('receivables.contract_id')->filter()->all();

        return collect($linked)->merge($historical)->map(fn (mixed $id): string => (string) $id)->unique()->values()->all();
    }

    /** @return array<int,string> */
    private function historicalSupplierIds(Payment $payment): array
    {
        if (! $this->hasIdentity($payment)) return [];
        $query = IncomingInvoice::query()
            ->select('incoming_invoices.supplier_id')
            ->join('payment_allocations', 'payment_allocations.incoming_invoice_id', '=', 'incoming_invoices.id')
            ->join('payments', 'payments.id', '=', 'payment_allocations.payment_id')
            ->whereNotNull('incoming_invoices.supplier_id')
            ->whereNull('payment_allocations.deleted_at')
            ->whereNull('payments.deleted_at')
            ->where('payments.id', '!=', $payment->id);
        $this->paymentIdentity($query, $payment);
        return $query->orderByDesc('payment_allocations.booked_at')->limit(100)->pluck('incoming_invoices.supplier_id')->filter()->unique()->values()->all();
    }

    private function paymentIdentity(Builder $query, Payment $payment): void
    {
        $iban = $this->iban((string) $payment->counterparty_iban);
        $name = trim((string) $payment->counterparty_name);
        $query->where(function (Builder $identity) use ($iban, $name): void {
            if ($iban !== '') $identity->whereRaw("UPPER(REPLACE(REPLACE(payments.counterparty_iban, ' ', ''), '-', '')) = ?", [$iban]);
            if ($name !== '') {
                $method = $iban !== '' ? 'orWhere' : 'where';
                $identity->{$method}('payments.counterparty_name', $name);
            }
        });
    }

    private function hasIdentity(Payment $payment): bool
    {
        return $this->iban((string) $payment->counterparty_iban) !== '' || trim((string) $payment->counterparty_name) !== '';
    }

    private function openItemQuery(): Builder
    {
        return OpenItem::query()->with(['contract.parties.businessPartner:id,display_name', 'contract.mainUnit.property:id,name']);
    }

    private function invoiceQuery(): Builder
    {
        return IncomingInvoice::query()->where('document_type', 'invoice')->whereIn('payment_status', ['open', 'partial'])->where('open_amount', '>', 0)->with(['supplier:id,display_name', 'property:id,name']);
    }

    private function searchOpenItems(Builder $query, string $search): void
    {
        $query->where(function (Builder $q) use ($search): void {
            $q->where('number', 'like', "%{$search}%")
                ->orWhere('external_number', 'like', "%{$search}%")
                ->orWhere('description', 'like', "%{$search}%")
                ->orWhereHas('contract', function (Builder $contract) use ($search): void {
                    $contract->where('contract_number', 'like', "%{$search}%")
                        ->orWhereHas('parties.businessPartner', fn (Builder $partner) => $partner
                            ->where('display_name', 'like', "%{$search}%")
                            ->orWhere('partner_number', 'like', "%{$search}%"))
                        ->orWhereHas('mainUnit.property', fn (Builder $property) => $property
                            ->where('name', 'like', "%{$search}%")
                            ->orWhere('property_number', 'like', "%{$search}%"))
                        ->orWhereHas('mainUnit', fn (Builder $unit) => $unit
                            ->where('unit_number', 'like', "%{$search}%")
                            ->orWhere('name', 'like', "%{$search}%"));
                });
        });
    }

    private function searchInvoices(Builder $query, string $search): void
    {
        $query->where(fn (Builder $q) => $q->where('number', 'like', "%{$search}%")
            ->orWhere('external_number', 'like', "%{$search}%")
            ->orWhere('description', 'like', "%{$search}%")
            ->orWhereHas('supplier', fn (Builder $s) => $s->where('display_name', 'like', "%{$search}%")));
    }

    private function containsTerm(string $candidate, array $terms): bool
    {
        $candidate = $this->normalize($candidate);
        foreach ($terms as $term) if (mb_strlen($term) >= 3 && str_contains($candidate, $term)) return true;
        return false;
    }

    private function terms(string $text): array
    {
        $stop = ['zahlung', 'miete', 'rechnung', 'eur', 'euro', 'monat', 'ueberweisung', 'verwendungszweck'];
        return collect(preg_split('/[^a-z0-9]+/', $text) ?: [])->filter(fn (string $term) => mb_strlen($term) >= 3 && ! in_array($term, $stop, true))->unique()->take(14)->values()->all();
    }

    private function paymentText(Payment $payment): string
    {
        return $this->normalize(implode(' ', array_filter([$payment->purpose, $payment->booking_text, $payment->counterparty_name])));
    }

    private function tenantLabel(OpenItem $row): ?string
    {
        if (! $row->contract?->relationLoaded('parties')) return null;
        $labels = $row->contract->parties
            ->filter(fn ($party): bool => in_array($party->party_role, ContractParty::TENANT_ROLES, true))
            ->pluck('businessPartner.display_name')->filter()->unique()->values();
        return $labels->isEmpty() ? null : $labels->join(' & ');
    }

    private function openItemText(OpenItem $row): string
    {
        $property = $row->contract?->mainUnit?->property?->name;
        return $this->normalize(implode(' ', [$row->number, $row->external_number, $row->description, $this->tenantLabel($row), $row->contract?->contract_number, $property]));
    }

    private function invoiceText(IncomingInvoice $row): string
    {
        return $this->normalize(implode(' ', [$row->number, $row->external_number, $row->description, $row->supplier?->display_name, $row->property?->name]));
    }

    private function referenceDate(Payment $payment): CarbonImmutable
    {
        return CarbonImmutable::parse($payment->value_date ?: $payment->booking_date ?: now())->startOfDay();
    }

    private function normalize(string $value): string
    {
        return mb_strtolower(preg_replace('/\s+/', ' ', Str::ascii(trim($value))) ?? '', 'UTF-8');
    }

    private function iban(string $value): string
    {
        return strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $value) ?? '');
    }

    private function openItemResource(OpenItem $row, ?string $reason, Payment $payment): array
    {
        $property = $row->contract?->mainUnit?->property?->name;
        return ['type' => 'open-items', 'id' => $row->id, 'attributes' => [
            'number' => $row->number,
            'description' => $row->description,
            'direction' => $row->isPayoutLike() ? 'credit' : 'debit',
            'dueDate' => $row->due_date?->toDateString(),
            'serviceMonth' => $row->service_month?->toDateString(),
            'amount' => (float) $row->amount,
            'openAmount' => (float) $row->open_amount,
            'status' => $row->status,
            'costArea' => $row->cost_area,
            'contractId' => $row->contract_id,
            'businessPartnerLabel' => $this->tenantLabel($row),
            'contractNumber' => $row->contract?->contract_number,
            'propertyLabel' => $property,
            'paymentMatchContext' => $this->matchContext->candidateContext($payment, $row->contract_id),
            'recommendationReason' => $reason,
            'recommendationAmount' => null,
            'recommendationOverpaymentAmount' => null,
        ]];
    }

    private function invoiceResource(IncomingInvoice $row, ?string $reason): array
    {
        return ['type' => 'incoming-invoices', 'id' => $row->id, 'attributes' => [
            'number' => $row->number,
            'documentType' => $row->document_type,
            'externalNumber' => $row->external_number,
            'description' => $row->description,
            'dueDate' => $row->due_date?->toDateString(),
            'grossAmount' => (float) $row->gross_amount,
            'openAmount' => (float) $row->open_amount,
            'paymentStatus' => $row->payment_status,
            'supplierLabel' => $row->supplier?->display_name,
            'propertyLabel' => $row->property?->name,
            'discountAmount' => (float) $row->discount_amount,
            'discountUntil' => $row->discount_until?->toDateString(),
            'recommendationReason' => $reason,
        ]];
    }
}
