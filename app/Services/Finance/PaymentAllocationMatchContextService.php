<?php

namespace App\Services\Finance;

use App\Models\BusinessPartnerBankAccount;
use App\Models\Contract;
use App\Models\PaymentAllocation;
use App\Models\ContractParty;
use App\Models\OpenItem;
use App\Models\Payment;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

final class PaymentAllocationMatchContextService
{
    /** @var array<string, array<string, mixed>> */
    private array $cache = [];
    /** @var array<string, bool> */
    private array $bankHistoryConflictCache = [];

    /**
     * A batch preview deliberately memoizes matching evidence per request.
     * Once a payment row is locked for final booking, its identity and
     * contract evidence must be recomputed from that locked payment rather
     * than read from the earlier assessment's cache.
     */
    public function forgetPayment(string $paymentId): void
    {
        unset($this->cache[$paymentId.':candidate'], $this->cache[$paymentId.':certified']);
        $this->bankHistoryConflictCache = [];
    }

    /** @return array{contractIds:array<int,string>,contractNumbers:array<int,string>,linkedContracts:array<int,array{id:string,number:string}>,partnerLabels:array<int,string>,identitySource:?string,targetPeriod:string,targetPeriodSource:string,targetPeriodReason:string} */
    public function context(Payment $payment, bool $forAutoCertification = false): array
    {
        // Manual candidate ranking can use wider hints. Only the automatic
        // book command uses strict bank-sourced proof; never share a cached
        // period between those two different accounting trust levels.
        $key = (string) $payment->id.($forAutoCertification ? ':certified' : ':candidate');
        if (isset($this->cache[$key])) {
            return $this->cache[$key];
        }

        $referenceDate = $this->referenceDate($payment);
        $tenantContext = $this->linkedTenantContext($payment, $referenceDate);
        $bankTextPeriod = $this->explicitTargetPeriod($payment);
        $notePeriod = $bankTextPeriod === null
            ? $this->parseExplicitPeriodFromText((string) $payment->notes) : null;

        if ($bankTextPeriod !== null || $notePeriod !== null) {
            [$targetPeriod, $targetPeriodSource, $targetPeriodReason] = [
                $bankTextPeriod ?? $notePeriod,
                $bankTextPeriod !== null ? 'payment_text' : 'payment_note',
                $bankTextPeriod !== null
                    ? 'Der Zielmonat steht ausdrücklich im Bank-Zahlungstext.'
                    : 'Der Zielmonat steht nur in einer internen Notiz und ist kein automatischer Buchungsnachweis.',
            ];
        } elseif (($learnedOffset = $this->learnedAllocationMonthOffset($payment, $forAutoCertification)) !== null) {
            $targetPeriod = $referenceDate->startOfMonth()->addMonths($learnedOffset)->format('Y-m');
            $targetPeriodSource = 'confirmed_history';
            $targetPeriodReason = $learnedOffset === 1
                ? 'Frühere bestätigte Zuordnungen dieses Zahlers zeigen regelmäßig auf den Folgemonat.'
                : 'Der Zielmonat wurde aus früheren bestätigten Zuordnungen dieses Zahlers gelernt.';
        } elseif (($recurringOffset = $this->recurringPaymentMonthOffset($payment, $tenantContext['contractIds'])) !== null) {
            $targetPeriod = $referenceDate->startOfMonth()->addMonths($recurringOffset)->format('Y-m');
            $targetPeriodSource = 'payment_pattern';
            $targetPeriodReason = $recurringOffset === 1
                ? 'Das wiederkehrende Zahlungsverhalten dieses Mieters spricht für eine Vorauszahlung auf den Folgemonat.'
                : 'Das wiederkehrende Zahlungsverhalten dieses Mieters spricht für den aktuellen Forderungsmonat.';
        } elseif ($tenantContext['contractIds'] !== [] && $this->looksLikeAdvanceRentPayment($payment)) {
            $targetPeriod = $referenceDate->startOfMonth()->addMonth()->format('Y-m');
            $targetPeriodSource = 'rent_due_pattern';
            $targetPeriodReason = 'Die Zahlung ist als Mietzahlung erkennbar und erfolgt deutlich vor der üblichen Fälligkeit des Folgemonats.';
        } else {
            $targetPeriod = $referenceDate->format('Y-m');
            $targetPeriodSource = 'booking_month';
            $targetPeriodReason = 'Ohne belastbareren Hinweis wird der Buchungsmonat verwendet.';
        }

        return $this->cache[$key] = [
            ...$tenantContext,
            'targetPeriod' => $targetPeriod,
            'targetPeriodSource' => $targetPeriodSource,
            'targetPeriodReason' => $targetPeriodReason,
        ];
    }

    /** @return array<int, string> */
    public function linkedContractIds(Payment $payment): array
    {
        return $this->context($payment)['contractIds'];
    }

    public function targetPeriod(Payment $payment): string
    {
        return $this->context($payment)['targetPeriod'];
    }

    public function targetPeriodReason(Payment $payment): string
    {
        return $this->context($payment)['targetPeriodReason'];
    }

    /** @return array<string, mixed> */
    public function responseMeta(Payment $payment): array
    {
        $context = $this->context($payment);

        return [
            'identitySource' => $context['identitySource'],
            'partnerLabels' => $context['partnerLabels'],
            'contractIds' => $context['contractIds'],
            'contractNumbers' => $context['contractNumbers'],
            'targetPeriodSource' => $context['targetPeriodSource'],
            'targetPeriodReason' => $context['targetPeriodReason'],
        ];
    }

    public function candidateContext(Payment $payment, ?string $contractId): ?string
    {
        if (! $contractId) {
            return null;
        }

        $context = $this->context($payment);
        if (! in_array($contractId, $context['contractIds'], true)) {
            return null;
        }

        $parts = [];
        if ($context['identitySource'] === 'conflicting_history') {
            $parts[] = 'Achtung: Diese IBAN wurde früher auf einen anderen Vertrag gebucht';
        } elseif ($context['identitySource'] === 'confirmed_history') {
            $parts[] = 'Vertrag aus mindestens zwei bereits gebuchten Bankeingängen bestätigt';
        } elseif ($context['identitySource'] === 'iban' && $context['partnerLabels'] !== []) {
            $parts[] = 'IBAN-Verknüpfung: '.implode(' / ', $context['partnerLabels']);
        } elseif ($context['partnerLabels'] !== []) {
            $parts[] = 'Mieter-Verknüpfung: '.implode(' / ', $context['partnerLabels']);
        }
        if ($context['contractNumbers'] !== []) {
            $parts[] = 'Mietverträge '.implode(', ', $context['contractNumbers']);
        }
        $parts[] = 'Zielmonat '.$this->formatPeriod($context['targetPeriod']);

        return implode(' · ', $parts);
    }

    /** @return array{contractIds:array<int,string>,contractNumbers:array<int,string>,linkedContracts:array<int,array{id:string,number:string}>,partnerLabels:array<int,string>,identitySource:?string} */
    private function linkedTenantContext(Payment $payment, CarbonImmutable $referenceDate): array
    {
        $partnerIds = collect();
        $partnerLabels = collect();
        $identitySource = null;
        $iban = $this->iban((string) $payment->counterparty_iban);

        if ($iban !== '') {
            $accounts = BusinessPartnerBankAccount::query()
                ->with('businessPartner:id,display_name')
                ->whereRaw("UPPER(REPLACE(REPLACE(iban, ' ', ''), '-', '')) = ?", [$iban])
                ->get();
            $partnerIds = $accounts->pluck('business_partner_id')->filter()->unique()->values();
            $partnerLabels = $accounts->pluck('businessPartner.display_name')->filter()->unique()->values();
            if ($partnerIds->isNotEmpty()) {
                $identitySource = 'iban';
            }
        }

        // A saved bank-account link is the strongest identity. If the payer's
        // IBAN has not been maintained on the tenant master record, two or more
        // *actually booked* receipts for that IBAN can prove a single contract.
        // Names alone never upgrade a payment to automatic certification.
        if ($partnerIds->isEmpty() && $iban !== '') {
            $confirmed = $this->confirmedContractFromBankHistory($payment, $referenceDate, $iban);
            if ($confirmed !== null) {
                return [
                    'contractIds' => [(string) $confirmed->id],
                    'contractNumbers' => [(string) $confirmed->contract_number],
                    'linkedContracts' => [['id' => (string) $confirmed->id, 'number' => (string) $confirmed->contract_number]],
                    'partnerLabels' => [],
                    'identitySource' => 'confirmed_history',
                ];
            }
        }

        if ($partnerIds->isEmpty()) {
            $name = $this->normalize((string) $payment->counterparty_name);
            if ($name !== '') {
                $candidates = \App\Models\BusinessPartner::query()
                    ->whereRaw('LOWER(display_name) = ?', [mb_strtolower(trim((string) $payment->counterparty_name), 'UTF-8')])
                    ->get(['id', 'display_name']);
                $partnerIds = $candidates->pluck('id')->filter()->unique()->values();
                $partnerLabels = $candidates->pluck('display_name')->filter()->unique()->values();
                if ($partnerIds->isNotEmpty()) {
                    $identitySource = 'name';
                }
            }
        }

        if ($partnerIds->isEmpty()) {
            return ['contractIds' => [], 'contractNumbers' => [], 'linkedContracts' => [], 'partnerLabels' => [], 'identitySource' => null];
        }

        $date = $referenceDate->toDateString();
        $parties = ContractParty::query()
            ->with('contract:id,contract_number,status')
            ->whereIn('business_partner_id', $partnerIds)
            ->whereIn('party_role', ContractParty::TENANT_ROLES)
            ->where(fn (Builder $query) => $query->whereNull('valid_from')->orWhereDate('valid_from', '<=', $date))
            ->where(fn (Builder $query) => $query->whereNull('valid_until')->orWhereDate('valid_until', '>=', $date))
            ->whereHas('contract', fn (Builder $query) => $query->where('status', 'active'))
            ->get();

        $contractIds = $parties->pluck('contract_id')->filter()->map(fn (mixed $id): string => (string) $id)->unique()->values()->all();
        // An IBAN saved on one tenant is not exclusive proof when that bank
        // account has actually paid a different contract before. Show review
        // instead of trusting only the master-data entry.
        if ($identitySource === 'iban' && $contractIds !== []) {
            $key = $iban.'|'.$date.'|'.implode(',', $contractIds);
            if (! array_key_exists($key, $this->bankHistoryConflictCache)) {
                $this->bankHistoryConflictCache[$key] = PaymentAllocation::query()
                    ->join('payments as prior_bank', 'prior_bank.id', '=', 'payment_allocations.payment_id')
                    ->join('receivables as prior_op', 'prior_op.id', '=', 'payment_allocations.receivable_id')
                    ->where('prior_bank.counterparty_iban', $iban)
                    ->where('prior_bank.direction', 'credit')
                    ->whereNotNull('prior_bank.bank_statement_id')
                    ->where('prior_bank.booking_date', '<', $date)
                    ->whereNull('prior_bank.deleted_at')
                    ->whereNull('prior_op.deleted_at')
                    ->whereIn('payment_allocations.allocation_type', ['settlement', 'partial'])
                    ->whereNotIn('prior_op.contract_id', $contractIds)
                    ->exists();
            }
            if ($this->bankHistoryConflictCache[$key]) {
                $identitySource = 'conflicting_history';
            }
        }

        return [
            'contractIds' => $contractIds,
            'contractNumbers' => $parties->pluck('contract.contract_number')->filter()->map(fn (mixed $number): string => (string) $number)->unique()->sort()->values()->all(),
            'linkedContracts' => $parties->map(static fn (ContractParty $party): array => [
                'id' => (string) $party->contract_id,
                'number' => (string) ($party->contract?->contract_number ?? ''),
            ])->unique('id')->sortBy('number')->values()->all(),
            'partnerLabels' => $partnerLabels->map(fn (mixed $label): string => (string) $label)->all(),
            'identitySource' => $identitySource,
        ];
    }

    /**
     * Only a unique established IBAN -> contract booking history can recover an
     * otherwise unmapped tenant. Two different older bank receipts are required;
     * one accidental manual posting is not proof of a lasting relationship.
     * All observed contracts count, including historical/ended ones: ambiguity
     * never gets ignored merely because one contract is now inactive.
     */
    private function confirmedContractFromBankHistory(Payment $payment, CarbonImmutable $referenceDate, string $iban): ?Contract
    {
        // Two small DISTINCT probes consider the entire real booking history.
        // Truncating the last N allocations could silently hide an older
        // second lease and turn an ambiguous IBAN into a false "safe" match.
        $booked = PaymentAllocation::query()
            ->join('payments as verified_payments', 'verified_payments.id', '=', 'payment_allocations.payment_id')
            ->join('receivables as verified_receivables', 'verified_receivables.id', '=', 'payment_allocations.receivable_id')
            ->where('verified_payments.counterparty_iban', $iban)
            ->where('verified_payments.direction', 'credit')
            ->whereNotNull('verified_payments.bank_statement_id')
            ->where('verified_payments.booking_date', '<', $referenceDate->toDateString())
            ->where('verified_payments.id', '!=', $payment->id)
            ->whereNull('verified_payments.deleted_at')
            ->whereNull('verified_receivables.deleted_at')
            ->whereNull('payment_allocations.deleted_at')
            ->whereNotNull('verified_receivables.contract_id')
            ->whereIn('payment_allocations.allocation_type', ['settlement', 'partial']);

        $contractIds = (clone $booked)->distinct()->limit(2)
            ->pluck('verified_receivables.contract_id');
        if ($contractIds->count() !== 1) {
            return null;
        }
        if ((clone $booked)->distinct()->limit(2)->pluck('payment_allocations.payment_id')->count() !== 2) {
            return null;
        }

        $contract = Contract::query()
            ->whereKey((string) $contractIds->first())
            ->where('status', 'active')
            ->first(['id', 'contract_number']);
        if (! $contract) {
            return null;
        }

        // The saved-IBAN branch already refuses multiple concurrent leases
        // for the same tenant. Historical recognition must enforce the same
        // invariant rather than silently picking whichever lease got the
        // last two payments.
        $date = $referenceDate->toDateString();
        $tenantIds = ContractParty::query()->where('contract_id', $contract->id)
            ->whereIn('party_role', ContractParty::TENANT_ROLES)
            ->where(fn (Builder $query) => $query->whereNull('valid_from')->orWhereDate('valid_from', '<=', $date))
            ->where(fn (Builder $query) => $query->whereNull('valid_until')->orWhereDate('valid_until', '>=', $date))
            ->pluck('business_partner_id');
        if ($tenantIds->isEmpty() || ContractParty::query()
            ->whereIn('business_partner_id', $tenantIds)
            ->whereIn('party_role', ContractParty::TENANT_ROLES)
            ->where('contract_id', '!=', $contract->id)
            ->where(fn (Builder $query) => $query->whereNull('valid_from')->orWhereDate('valid_from', '<=', $date))
            ->where(fn (Builder $query) => $query->whereNull('valid_until')->orWhereDate('valid_until', '>=', $date))
            ->whereHas('contract', static fn (Builder $query) => $query->where('status', 'active'))
            ->exists()) {
            return null;
        }

        return $contract;
    }

    private function explicitTargetPeriod(Payment $payment): ?string
    {
        return $this->parseExplicitPeriodFromText(implode(' ', array_filter([$payment->purpose, $payment->booking_text])));
    }

    /** Free-form note periods can rank manual OP suggestions but are never proof for an automatic booking. */
    private function parseExplicitPeriodFromText(string $raw): ?string
    {
        if (preg_match('/\b(20\d{2})[-\/.](0?[1-9]|1[0-2])(?![-\/.]\d+)\b/u', $raw, $match)) {
            return sprintf('%04d-%02d', (int) $match[1], (int) $match[2]);
        }
        if (preg_match('/(?<!\d[-\/.])\b(0?[1-9]|1[0-2])[-\/.](20\d{2})\b/u', $raw, $match)) {
            return sprintf('%04d-%02d', (int) $match[2], (int) $match[1]);
        }

        $months = [
            'januar' => 1, 'februar' => 2, 'maerz' => 3, 'märz' => 3, 'april' => 4,
            'mai' => 5, 'juni' => 6, 'juli' => 7, 'august' => 8, 'september' => 9,
            'oktober' => 10, 'november' => 11, 'dezember' => 12,
        ];
        if (preg_match('/\b(januar|februar|maerz|märz|april|mai|juni|juli|august|september|oktober|november|dezember)\s+(20\d{2})\b/ui', $raw, $match)) {
            return sprintf('%04d-%02d', (int) $match[2], $months[mb_strtolower($match[1], 'UTF-8')]);
        }

        return null;
    }

    private function learnedAllocationMonthOffset(Payment $payment, bool $forAutoCertification): ?int
    {
        if (! $this->hasIdentity($payment)) {
            return null;
        }

        // An OP split of one earlier transfer is *one* piece of payment
        // evidence, not two independent historical months. Count distinct
        // previously booked bank payments and require two distinct service
        // periods for a trusted recurring offset. Manual cash receipts and
        // unbooked bank rows are never evidence for automatic certification.
        $query = OpenItem::query()
            ->select([
                'receivables.service_month',
                'payments.id as history_payment_id',
                'payments.booking_date',
                'payments.value_date',
            ])
            ->join('payment_allocations', 'payment_allocations.receivable_id', '=', 'receivables.id')
            ->join('payments', 'payments.id', '=', 'payment_allocations.payment_id')
            ->whereNotNull('receivables.service_month')
            ->where(static function (Builder $older) use ($payment): void {
                $reference = $payment->value_date?->toDateString()
                    ?? $payment->booking_date?->toDateString();
                if ($reference === null) {
                    $older->whereNull('payments.id');
                    return;
                }
                $older->where(static fn (Builder $valued) => $valued
                    ->whereNotNull('payments.value_date')
                    ->whereDate('payments.value_date', '<', $reference))
                    ->orWhere(static fn (Builder $booked) => $booked
                        ->whereNull('payments.value_date')
                        ->whereDate('payments.booking_date', '<', $reference));
            })
            ->whereNull('payment_allocations.deleted_at')
            ->whereNull('payments.deleted_at')
            ->where('payments.id', '!=', $payment->id)
            ->where('payments.direction', 'credit');
        if ($forAutoCertification) {
            $query->whereNotNull('payments.bank_statement_id')
                ->whereIn('payment_allocations.allocation_type', ['settlement', 'partial']);
        }
        $this->paymentIdentity($query, $payment);

        $observations = $query->orderByDesc('payment_allocations.booked_at')->limit(60)->get()
            ->groupBy('history_payment_id')
            ->map(static function (Collection $entries): ?array {
                $periods = $entries->map(static function (OpenItem $entry): ?array {
                    $paymentDate = $entry->getAttribute('value_date') ?: $entry->getAttribute('booking_date');
                    $serviceMonth = $entry->getAttribute('service_month');
                    if (! $paymentDate || ! $serviceMonth) return null;

                    $from = CarbonImmutable::parse($paymentDate)->startOfMonth();
                    $to = CarbonImmutable::parse($serviceMonth)->startOfMonth();
                    $offset = (($to->year - $from->year) * 12) + ($to->month - $from->month);
                    if ($offset < -2 || $offset > 3) return null;

                    return ['serviceMonth' => $to->format('Y-m'), 'offset' => $offset];
                })->filter()->unique(static fn (array $row): string => $row['serviceMonth'].'|'.$row['offset'])->values();

                // A single payment that was split over different service
                // months does not establish one unambiguous month offset.
                return $periods->count() === 1 ? $periods->first() : null;
            })
            ->filter(static fn (?array $row): bool => $row !== null)
            ->values();

        $offset = $this->stableMode($observations->pluck('offset'), 2, 0.6);
        if ($offset === null) return null;

        // Multiple instalments of the same old OP must not be mistaken for
        // multiple recurring monthly payment periods.
        return $observations->where('offset', $offset)
            ->pluck('serviceMonth')->unique()->count() >= 2 ? $offset : null;
    }

    /** @param array<int,string> $linkedContractIds */
    private function recurringPaymentMonthOffset(Payment $payment, array $linkedContractIds): ?int
    {
        if ($linkedContractIds === [] || $payment->direction !== 'credit' || ! $this->hasIdentity($payment)) {
            return null;
        }

        $amount = max(0.0, (float) $payment->amount);
        if ($amount <= 0.001) {
            return null;
        }

        $query = Payment::query()
            ->whereKeyNot($payment->id)
            ->where('direction', 'credit')
            ->whereBetween('amount', [round($amount * 0.8, 2), round($amount * 1.2, 2)]);
        $this->paymentIdentity($query, $payment, 'payments');

        $dates = $query->orderByDesc('booking_date')->limit(24)->get(['booking_date', 'value_date'])
            ->map(fn (Payment $row): ?CarbonImmutable => $row->value_date || $row->booking_date ? CarbonImmutable::parse($row->value_date ?: $row->booking_date) : null)
            ->filter()
            ->values();

        if ($dates->count() < 3) {
            return null;
        }

        $days = $dates->map(fn (CarbonImmutable $date): int => $date->day)->sort()->values();
        $middle = intdiv($days->count(), 2);
        $median = $days->count() % 2 === 0
            ? (((int) $days[$middle - 1] + (int) $days[$middle]) / 2)
            : (int) $days[$middle];

        return $median >= 12 ? 1 : 0;
    }

    private function looksLikeAdvanceRentPayment(Payment $payment): bool
    {
        $date = $this->referenceDate($payment);
        if ($date->day < 12) {
            return false;
        }

        $text = $this->normalize(implode(' ', array_filter([$payment->purpose, $payment->booking_text])));
        foreach (['miete', 'rent', 'nebenkosten', 'betriebskosten', 'garage', 'stellplatz'] as $term) {
            if (str_contains($text, $term)) return true;
        }

        return false;
    }

    private function stableMode(Collection $values, int $minimumCount, float $minimumShare): ?int
    {
        if ($values->isEmpty()) return null;
        $counts = $values->countBy()->sortDesc();
        $mode = $counts->keys()->first();
        $count = (int) $counts->first();
        if ($mode === null || $count < $minimumCount || ($count / $values->count()) < $minimumShare) {
            return null;
        }

        return (int) $mode;
    }

    private function paymentIdentity(Builder $query, Payment $payment, string $table = 'payments'): void
    {
        $iban = $this->iban((string) $payment->counterparty_iban);
        $name = trim((string) $payment->counterparty_name);
        $query->where(function (Builder $identity) use ($iban, $name, $table): void {
            if ($iban !== '') {
                $identity->whereRaw("UPPER(REPLACE(REPLACE({$table}.counterparty_iban, ' ', ''), '-', '')) = ?", [$iban]);
            }
            // Do not mix two different IBANs merely because the displayed
            // payer name happens to be identical.
            if ($iban === '' && $name !== '') {
                $identity->where("{$table}.counterparty_name", $name);
            }
        });
    }

    private function hasIdentity(Payment $payment): bool
    {
        return $this->iban((string) $payment->counterparty_iban) !== '' || trim((string) $payment->counterparty_name) !== '';
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

    private function formatPeriod(string $period): string
    {
        if (! preg_match('/^(20\d{2})-(0[1-9]|1[0-2])$/', $period, $match)) return $period;
        return sprintf('%02d/%04d', (int) $match[2], (int) $match[1]);
    }
}
