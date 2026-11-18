<?php

namespace App\Services\Finance;

use App\Application\Documents\DocumentStorageService;
use App\Models\BusinessPartner;
use App\Models\BusinessPartnerBankAccount;
use App\Models\Contract;
use App\Models\ContractParty;
use App\Models\Document;
use App\Models\DunningNotice;
use App\Models\DunningNoticeItem;
use App\Models\OpenItem;
use App\Models\OpenItemPaymentAgreement;
use App\Models\OrganizationSetting;
use App\Services\Documents\OrganizationDocumentProfile;
use App\Support\Dates\GermanPaymentDeadline;
use App\Models\User;
use App\Reports\DunningNoticePdfReport;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

final class DunningNoticeService
{
    public function __construct(
        private readonly DunningNoticePdfReport $report,
        private readonly DocumentStorageService $documentStorage,
    ) {}

    /** @return array<string,mixed> */
    public function policy(): array
    {
        $defaults = OrganizationSetting::DEFAULTS['dunning'];
        $stored = OrganizationSetting::query()
            ->where('section', 'organization')
            ->where('key', 'dunning')
            ->first()?->values ?? [];

        return array_replace($defaults, is_array($stored) ? $stored : []);
    }

    /** @return Collection<int,DunningNotice> */
    public function issueUsingSettings(
        array $receivableIds,
        string $level,
        CarbonImmutable|string $issuedOn,
        string $requestId,
        ?string $userId = null,
    ): Collection {
        $issuedOn = $issuedOn instanceof CarbonImmutable ? $issuedOn : CarbonImmutable::parse($issuedOn)->startOfDay();
        $policy = $this->policy();
        $phase = $this->phase($level, $policy);

        return $this->issue(
            $receivableIds,
            $level,
            $issuedOn,
            $issuedOn->addDays((int) $phase['dueDays']),
            (float) $phase['feeAmount'],
            $requestId,
            $userId,
            (string) $phase['introText'],
            (string) $phase['closingText'],
            $policy,
        );
    }

    /**
     * Canonical future automation boundary: callers provide OPs and an issue date,
     * while this service owns the next stage, waiting period, fee, text and PDF.
     *
     * @return Collection<int,DunningNotice>
     */
    public function issueNextUsingSettings(
        array $receivableIds,
        CarbonImmutable|string $issuedOn,
        string $requestId,
        ?string $userId = null,
    ): Collection {
        $ids = collect($receivableIds)->map('strval')->filter()->unique()->values();
        if ($ids->isEmpty()) {
            throw ValidationException::withMessages(['receivableIds' => 'Bitte wählen Sie mindestens einen offenen Posten aus.']);
        }

        $rows = OpenItem::query()
            ->whereIn('id', $ids)
            ->get(['id', 'number', 'contract_id']);
        if ($rows->count() !== $ids->count()) {
            throw ValidationException::withMessages(['receivableIds' => 'Mindestens ein ausgewählter offener Posten existiert nicht mehr.']);
        }

        // Scheduler retry: the same request ID must return its original notice,
        // even if the OP is now in a later stage or the last stage was reached.
        $requestKeys = $rows->pluck('contract_id')->filter()->unique()->map(
            static fn ($contractId): string => hash('sha256', $requestId.':'.$contractId)
        );
        $previous = DunningNotice::query()
            ->with(['document', 'contract:id,contract_number'])
            ->whereIn('request_key', $requestKeys->all())
            ->get();
        foreach ($previous as $notice) {
            $this->assertMatchingRequestItems(
                $notice,
                $rows->where('contract_id', $notice->contract_id),
            );
        }
        $completedContracts = $previous->pluck('contract_id')->map('strval')->all();
        $pendingRows = $rows->reject(
            fn (OpenItem $row): bool => in_array((string) $row->contract_id, $completedContracts, true)
        );
        if ($pendingRows->isEmpty()) {
            return $previous;
        }

        $latestByReceivable = $this->latestActiveNotices($pendingRows->pluck('id'));
        $levels = $pendingRows->map(function (OpenItem $row) use ($latestByReceivable): ?string {
            return $this->nextLevel($latestByReceivable->get((string) $row->id)?->level);
        });

        if ($levels->contains(null)) {
            throw ValidationException::withMessages(['receivableIds' => 'Mindestens ein ausgewählter offener Posten hat bereits die 2. Mahnung erreicht und benötigt eine manuelle Prüfung.']);
        }

        $levels = $levels->filter()->unique()->values();
        if ($levels->count() !== 1) {
            throw ValidationException::withMessages(['receivableIds' => 'Die ausgewählten offenen Posten haben unterschiedliche nächste Mahnstufen. Bearbeiten Sie die Stufen getrennt.']);
        }

        return $this->issueUsingSettings($ids->all(), (string) $levels->first(), $issuedOn, $requestId, $userId);
    }

    /**
     * Bounded adapter-facing batch for future scheduler/automation handlers.
     * Unlike the UI queue it keeps scanning past waiting/manual rows until the
     * requested number of actionable transitions has been found.
     *
     * @return Collection<int,array<string,mixed>>
     */
    public function actionableBatch(
        CarbonImmutable|string|null $referenceDate = null,
        int $limit = 100,
    ): Collection {
        $today = $referenceDate instanceof CarbonImmutable
            ? $referenceDate->startOfDay()
            : ($referenceDate ? CarbonImmutable::parse($referenceDate)->startOfDay() : CarbonImmutable::today());
        $policy = $this->policy();
        $limit = max(1, min(500, $limit));
        $result = collect();

        $query = $this->workItemQuery($today)->orderBy('id');
        $query->chunkById(200, function (Collection $rows) use ($policy, $today, $limit, $result): bool {
            $this->loadWorkItemContext($rows);
            foreach ($this->projectWorkRows($rows, $policy, $today) as $row) {
                if ($row['state'] !== 'actionable') continue;
                $result->push($row);
                if ($result->count() >= $limit) return false;
            }

            return true;
        }, 'id');

        return $result->take($limit)->values();
    }

    /** @return array{rows:array<int,array<string,mixed>>,meta:array<string,mixed>} */
    public function workQueue(CarbonImmutable|string|null $referenceDate = null): array
    {
        $today = $referenceDate instanceof CarbonImmutable
            ? $referenceDate->startOfDay()
            : ($referenceDate ? CarbonImmutable::parse($referenceDate)->startOfDay() : CarbonImmutable::today());
        $policy = $this->policy();

        $rows = $this->workItemQuery($today)
            ->orderBy('due_date')
            ->orderBy('number')
            ->limit(501)
            ->get();

        $truncated = $rows->count() > 500;
        $rows = $rows->take(500)->values();
        $this->loadWorkItemContext($rows);
        $projected = $this->projectWorkRows($rows, $policy, $today);

        return [
            'rows' => $projected->all(),
            'meta' => [
                'referenceDate' => $today->toDateString(),
                'actionable' => $projected->where('state', 'actionable')->count(),
                'waiting' => $projected->where('state', 'waiting')->count(),
                'manualReview' => $projected->where('state', 'manual_review')->count(),
                'agreementReview' => $projected->where('state', 'agreement_review')->count(),
                'deferred' => $projected->where('state', 'deferred')->count(),
                'truncated' => $truncated,
            ],
        ];
    }

    /**
     * Full portfolio, bounded-memory worklist. Count every eligible OP; hydrate tenant and
     * object context only for the requested page. No oldest-500 blind spot.
     *
     * @return array{rows:array<int,array<string,mixed>>,meta:array<string,mixed>}
     */
    public function workQueuePaged(string $view, int $page = 1, int $pageSize = 25, string $search = '', CarbonImmutable|string|null $referenceDate = null): array
    {
        if (! in_array($view, ['now', 'planned'], true)) {
            throw new \InvalidArgumentException('Unknown work queue view.');
        }
        $today = $referenceDate instanceof CarbonImmutable
            ? $referenceDate->startOfDay()
            : ($referenceDate ? CarbonImmutable::parse($referenceDate)->startOfDay() : CarbonImmutable::today());
        $policy = $this->policy();
        $page = max(1, min(200, $page));
        $pageSize = max(1, min(100, $pageSize));
        $keep = $page * $pageSize;
        $counts = ['actionable' => 0, 'waiting' => 0, 'manual_review' => 0, 'deferred' => 0, 'agreement_review' => 0];
        $top = [];

        $candidateQuery = $this->workItemQuery($today);
        $search = trim($search);
        if ($search !== '') {
            $term = '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $search).'%';
            $candidateQuery->where(function ($query) use ($term): void {
                $query->where('number', 'like', $term)
                    ->orWhere('description', 'like', $term)
                    ->orWhereHas('contract', fn ($contracts) => $contracts
                        ->where('contract_number', 'like', $term)
                        ->orWhereHas('parties.businessPartner', fn ($partners) => $partners->where('display_name', 'like', $term))
                        ->orWhereHas('mainUnit', fn ($units) => $units
                            ->where('unit_number', 'like', $term)
                            ->orWhere('name', 'like', $term)
                            ->orWhereHas('property', fn ($property) => $property->where('name', 'like', $term))));
            });
        }

        $candidateQuery->chunkById(200, function (Collection $chunk) use ($today, $policy, $view, $keep, &$counts, &$top): void {
            $chunk->load('activePaymentAgreement');
            $latest = $this->latestActiveNotices($chunk->pluck('id'));
            foreach ($chunk as $row) {
                $state = $this->workState($row, $latest->get((string) $row->id), $policy, $today);
                $counts[$state['state']]++;
                $matching = $view === 'now'
                    ? in_array($state['state'], ['actionable', 'manual_review', 'agreement_review'], true)
                    : in_array($state['state'], ['waiting', 'deferred'], true);
                if (! $matching) continue;
                $top[] = [
                    'id' => (string) $row->id,
                    'sort' => $state['actionableOn']->toDateString().'|'.$row->due_date->toDateString().'|'.$row->number.'|'.$row->id,
                ];
            }
            // Bound memory even for arbitrarily large portfolios.
            usort($top, static fn (array $left, array $right): int => strcmp($left['sort'], $right['sort']));
            $top = array_slice($top, 0, $keep);
        }, 'id');

        $total = $view === 'now'
            ? $counts['actionable'] + $counts['manual_review'] + $counts['agreement_review']
            : $counts['waiting'] + $counts['deferred'];
        $lastPage = max(1, (int) ceil($total / $pageSize));
        $currentPage = min($page, $lastPage);
        $pageIds = array_column(array_slice($top, ($currentPage - 1) * $pageSize, $pageSize), 'id');
        $projected = collect();
        if ($pageIds !== []) {
            $rows = $this->workItemQuery($today)->whereIn('id', $pageIds)->get();
            $this->loadWorkItemContext($rows);
            $projected = $this->projectWorkRows($rows, $policy, $today)->keyBy('id');
        }

        return [
            'rows' => collect($pageIds)->map(fn (string $id) => $projected->get($id))->filter()->values()->all(),
            'meta' => [
                'referenceDate' => $today->toDateString(),
                'actionable' => $counts['actionable'],
                'waiting' => $counts['waiting'],
                'manualReview' => $counts['manual_review'],
                'agreementReview' => $counts['agreement_review'],
                'deferred' => $counts['deferred'],
                'nowCount' => $counts['actionable'] + $counts['manual_review'] + $counts['agreement_review'],
                'plannedCount' => $counts['waiting'] + $counts['deferred'],
                'currentPage' => $currentPage,
                'perPage' => $pageSize,
                'lastPage' => $lastPage,
                'from' => $total ? ($currentPage - 1) * $pageSize + 1 : null,
                'to' => $total ? min($total, $currentPage * $pageSize) : null,
                'total' => $total,
                'truncated' => false,
            ],
        ];
    }

    /** @return Collection<int,DunningNotice> */
    public function issue(
        array $receivableIds,
        string $level,
        CarbonImmutable|string $issuedOn,
        CarbonImmutable|string $paymentDueOn,
        float $feeAmount,
        string $requestId,
        ?string $userId = null,
        ?string $introText = null,
        ?string $closingText = null,
        ?array $policy = null,
    ): Collection {
        $issuedOn = $issuedOn instanceof CarbonImmutable ? $issuedOn : CarbonImmutable::parse($issuedOn)->startOfDay();
        $paymentDueOn = $paymentDueOn instanceof CarbonImmutable ? $paymentDueOn : CarbonImmutable::parse($paymentDueOn)->startOfDay();
        $feeAmount = round(max(0, $feeAmount), 2);
        $ids = collect($receivableIds)->map('strval')->filter()->unique()->values();

        if ($ids->isEmpty()) {
            throw ValidationException::withMessages(['receivableIds' => 'Bitte wählen Sie mindestens einen offenen Posten aus.']);
        }
        if (! in_array($level, DunningNotice::LEVELS, true)) {
            throw ValidationException::withMessages(['level' => 'Die ausgewählte Mahnstufe ist ungültig.']);
        }
        if ($paymentDueOn->lt($issuedOn)) {
            throw ValidationException::withMessages(['paymentDueOn' => 'Die Zahlungsfrist darf nicht vor dem Ausstellungsdatum liegen.']);
        }

        // Applies to both settings-driven and explicit service issuance. The
        // persisted notice, fee OP and issued PDF must all use this date.
        $paymentDueOn = GermanPaymentDeadline::nextWorkingDay($paymentDueOn);

        $storedPaths = [];

        try {
            return DB::transaction(function () use ($ids, $level, $issuedOn, $paymentDueOn, $feeAmount, $requestId, $userId, $introText, $closingText, $policy, &$storedPaths): Collection {
                // Re-read and lock the accounting source of truth inside the transaction.
                // This prevents payments/edits from racing between selection and issuance.
                // Lock the accounting rows first, without loading document-related
                // graphs. Idempotent retries can return here without the snapshot loads.
                $receivables = OpenItem::query()
                    ->select([
                        'id',
                        'contract_id',
                        'number',
                        'description',
                        'type',
                        'status',
                        'amount',
                        'open_amount',
                        'due_date',
                        'last_dunned_on',
                        'dunning_count',
                    ])
                    ->whereIn('id', $ids)
                    ->orderBy('id')
                    ->lockForUpdate()
                    ->get();

                if ($receivables->count() !== $ids->count()) {
                    throw ValidationException::withMessages(['receivableIds' => 'Mindestens ein ausgewählter offener Posten existiert nicht mehr.']);
                }
                if ($receivables->contains(fn (OpenItem $row): bool => ! $row->contract_id)) {
                    throw ValidationException::withMessages(['receivableIds' => 'Mahnschreiben benötigen einen Vertragsbezug.']);
                }
                $groups = $receivables->groupBy('contract_id');
                $requestKeys = $groups->mapWithKeys(
                    static fn ($rows, $contractId): array => [
                        (string) $contractId => hash('sha256', $requestId.':'.$contractId),
                    ],
                );

                // One indexed lookup for all selected contracts, rather than one
                // round-trip per contract. Documents/contracts are loaded only for
                // idempotent hits, so a retried request avoids snapshot preparation.
                $existingByRequestKey = DunningNotice::query()
                    ->with(['document', 'contract:id,contract_number'])
                    ->whereIn('request_key', $requestKeys->values()->all())
                    ->get()
                    ->keyBy('request_key');

                $pendingGroups = $groups->reject(
                    fn ($rows, $contractId): bool => $existingByRequestKey->has(
                        $requestKeys->get((string) $contractId),
                    ),
                );

                if ($pendingGroups->isNotEmpty()) {
                    $pendingRows = [];
                    foreach ($pendingGroups as $pendingGroup) {
                        foreach ($pendingGroup as $pendingRow) {
                            $pendingRows[] = $pendingRow;
                        }
                    }

                    $pendingCollection = new EloquentCollection($pendingRows);
                    // This guard applies to manual, scheduler and internal issue paths,
                    // even after the promised date: inspection must end the hold explicitly.
                    if (OpenItemPaymentAgreement::query()
                        ->whereIn('active_receivable_id', $pendingCollection->pluck('id')->all())
                        ->exists()) {
                        throw ValidationException::withMessages([
                            'receivableIds' => 'Eine offene Zahlungsvereinbarung verhindert weitere Mahnungen. Prüfen und beenden Sie die Vereinbarung zuerst.',
                        ]);
                    }
                    if ($policy !== null) {
                        // Locking already happened above. Only validate genuinely new
                        // groups: a repeated idempotent request must not advance a stage.
                        $this->validateRows($pendingCollection, $issuedOn);
                        $this->validatePolicyTransition($pendingCollection, $level, $issuedOn, $policy);
                    }

                    // Only the attributes needed to freeze the letter are hydrated.
                    // In particular, don't load bank-account owners or every party role.
                    $pendingCollection->load([
                        'contract:id,contract_number,main_unit_id',
                        'contract.mainUnit:id,property_id,unit_number,name',
                        'contract.mainUnit.property:id,property_number,name,settlement_bank_account_id',
                        'contract.mainUnit.property.settlementBankAccount:id,account_holder,iban,bic,bank_name',
                        'contract.units:id,contract_id,unit_id,object_role,sort_order',
                        'contract.units.unit:id,property_id,unit_number,name',
                        'contract.units.unit.property:id,property_number,name,settlement_bank_account_id',
                        'contract.units.unit.property.settlementBankAccount:id,account_holder,iban,bic,bank_name',
                        'contract.correspondenceParties' => static fn ($query) => $query
                            ->select('id', 'contract_id', 'business_partner_id', 'party_role', 'valid_from', 'valid_until')
                            ->orderBy('valid_from'),
                        'contract.correspondenceParties.businessPartner:id,display_name',
                        'contract.correspondenceParties.businessPartner.personProfile:id,business_partner_id,salutation,last_name',
                        'contract.correspondenceParties.businessPartner.addresses:id,business_partner_id,street,house_number,postal_code,city,is_primary,valid_from,valid_until',
                    ]);
                }

                $created = collect();
                $organizationSnapshot = null;
                $paymentQrCodeEnabled = null;

                foreach ($groups as $contractId => $rows) {
                    $requestKey = $requestKeys->get((string) $contractId);
                    $existing = $existingByRequestKey->get($requestKey);

                    if ($existing) {
                        // Never return a different selection that accidentally reused
                        // the same idempotency key for this contract.
                        $this->assertMatchingRequestItems($existing, $rows);
                        $created->push($existing);

                        continue;
                    }

                    if ($policy === null) {
                        $this->validateRows($rows, $issuedOn);
                    }

                    /** @var Contract $contract */
                    $contract = $rows->first()->contract;
                    $principal = round($rows->sum(fn (OpenItem $row): float => (float) $row->open_amount), 2);
                    $recipient = $this->recipientSnapshot($contract, $issuedOn);

                    if ((array) ($recipient['names'] ?? []) === []) {
                        throw ValidationException::withMessages(['receivableIds' => 'Für den Vertrag ist zum Mahndatum kein aktiver Hauptmieter als Empfänger hinterlegt.']);
                    }

                    $context = $this->contextSnapshot($contract);
                    if (filled($introText)) {
                        $context['dunningIntroText'] = trim((string) $introText);
                    }
                    if (filled($closingText)) {
                        $context['dunningClosingText'] = trim((string) $closingText);
                    }
                    $payment = $this->paymentSnapshot($contract);
                    // Freeze the existing billing QR preference with this issued notice.
                    $paymentQrCodeEnabled ??= $this->paymentQrCodeEnabled();
                    $context['paymentQrCodeEnabled'] = $paymentQrCodeEnabled;
                    $organizationSnapshot ??= $this->organizationSnapshot();

                    $notice = DunningNotice::query()->create([
                        'request_key' => $requestKey,
                        'contract_id' => $contract->id,
                        'level' => $level,
                        'status' => 'active',
                        'issued_on' => $issuedOn,
                        'payment_due_on' => $paymentDueOn,
                        'principal_total' => $principal,
                        'fee_amount' => $feeAmount,
                        'total_due' => round($principal + $feeAmount, 2),
                        'recipient_snapshot' => $recipient,
                        'organization_snapshot' => $organizationSnapshot,
                        'context_snapshot' => $context,
                        'payment_snapshot' => $payment,
                        'created_by' => $userId,
                    ]);

                    // Create all item snapshots in one SQL statement and attach the
                    // in-memory models so PDF rendering does not immediately re-query them.
                    $timestamp = now()->toDateTimeString();
                    $itemRows = $rows
                        ->sortBy([['due_date', 'asc'], ['number', 'asc']])
                        ->values()
                        ->map(static fn (OpenItem $row, int $index): array => [
                            'id' => (string) Str::uuid(),
                            'dunning_notice_id' => (string) $notice->id,
                            'receivable_id' => (string) $row->id,
                            'receivable_number' => (string) $row->number,
                            'description' => (string) $row->description,
                            'due_date' => $row->due_date?->toDateString(),
                            'original_amount' => (string) $row->amount,
                            'open_amount' => (string) $row->open_amount,
                            'sort_order' => $index + 1,
                            'created_at' => $timestamp,
                            'updated_at' => $timestamp,
                        ])
                        ->all();

                    DunningNoticeItem::query()->insert($itemRows);
                    $notice->setRelation('items', DunningNoticeItem::hydrate($itemRows));

                    // Reproduce the OpenItem saving invariants for the selected,
                    // still-open rows, but do it in at most two bulk updates (open/partial)
                    // instead of one model save per selected receivable.
                    $counterFields = [
                        'last_dunning_level' => $level,
                        'last_dunned_on' => $issuedOn->toDateString(),
                        'dunning_count' => DB::raw('dunning_count + 1'),
                        'settled_at' => null,
                        'updated_at' => now(),
                    ];

                    foreach ($rows->groupBy(
                        static fn (OpenItem $row): string => (float) $row->open_amount < (float) $row->amount
                            ? 'partial'
                            : 'open',
                    ) as $status => $statusRows) {
                        OpenItem::query()
                            ->whereIn('id', $statusRows->map(static fn (OpenItem $row): string => (string) $row->id)->all())
                            ->update([...$counterFields, 'status' => $status]);
                    }

                    $feeReceivable = null;
                    if ($feeAmount > 0.004) {
                        $feeReceivable = OpenItem::query()->create([
                            'idempotency_key' => 'dunning-fee:'.$notice->id,
                            'contract_id' => $contract->id,
                            'description' => 'Mahngebühr '.$notice->number,
                            'type' => 'other',
                            'cost_area' => 'other',
                            'amount' => $feeAmount,
                            'open_amount' => $feeAmount,
                            'due_date' => $paymentDueOn,
                            'notes' => 'Automatisch aus '.$this->report->levelLabel($level).' '.$notice->number.' erzeugt.',
                            'source_dunning_notice_id' => $notice->id,
                        ]);
                    }
                    $notice->setRelation('feeReceivable', $feeReceivable);

                    $pdf = $this->report->render($notice);
                    $document = $this->storeDocument(
                        $notice,
                        $pdf,
                        $userId,
                        (bool) ($policy['archiveInContractFile'] ?? false),
                    );
                    $storedPaths[] = ['disk' => (string) $document->disk, 'path' => (string) $document->path];
                    $notice->setRelation('document', $document);
                    $created->push($notice);
                }

                return $created->values();
            });
        } catch (Throwable $exception) {
            foreach ($storedPaths as $stored) {
                Storage::disk($stored['disk'])->delete($stored['path']);
            }

            throw $exception;
        }
    }

    public function cancel(DunningNotice|string $notice, string $reason, ?string $userId = null): DunningNotice
    {
        $noticeId = $notice instanceof DunningNotice ? (string) $notice->getKey() : (string) $notice;
        $reason = trim($reason);

        if ($reason === '') {
            throw ValidationException::withMessages(['reason' => 'Bitte geben Sie einen Grund für das Storno an.']);
        }

        return DB::transaction(function () use ($noticeId, $reason, $userId): DunningNotice {
            // Always lock accounting targets before the notice. Issuance and payment
            // allocation use the same OpenItem-first order, which avoids lock inversion.
            $receivableIds = DunningNoticeItem::query()
                ->where('dunning_notice_id', $noticeId)
                ->whereNotNull('receivable_id')
                ->pluck('receivable_id')
                ->map('strval')
                ->unique()
                ->values();

            $feeReceivableId = OpenItem::withTrashed()
                ->where('source_dunning_notice_id', $noticeId)
                ->value('id');

            $dependencyReceivableIds = collect($receivableIds->all());

            if ($feeReceivableId) {
                $dependencyReceivableIds->push((string) $feeReceivableId);
            }

            $dependencyReceivableIds = $dependencyReceivableIds
                ->filter()
                ->unique()
                ->sort()
                ->values();

            $lockedReceivables = $dependencyReceivableIds->isEmpty()
                ? collect()
                : OpenItem::withTrashed()
                    ->whereIn('id', $dependencyReceivableIds)
                    ->orderBy('id')
                    ->lockForUpdate()
                    ->get()
                    ->keyBy(fn (OpenItem $row): string => (string) $row->id);

            $locked = DunningNotice::query()
                ->with(['items', 'document', 'cancelledBy'])
                ->lockForUpdate()
                ->findOrFail($noticeId);

            if ($locked->status === 'cancelled') {
                return $locked->fresh(['items', 'document', 'feeReceivable', 'cancelledBy']);
            }

            /** @var OpenItem|null $feeReceivable */
            $feeReceivable = $feeReceivableId ? $lockedReceivables->get((string) $feeReceivableId) : null;

            if ($dependencyReceivableIds->isNotEmpty()) {
                $laterNotice = DunningNotice::query()
                    ->where('status', 'active')
                    ->where('id', '!=', $locked->id)
                    ->whereHas('items', fn ($query) => $query->whereIn('receivable_id', $dependencyReceivableIds))
                    ->where(function ($query) use ($locked): void {
                        $query->where('issued_on', '>', $locked->issued_on?->toDateString())
                            ->orWhere(function ($sameDay) use ($locked): void {
                                $sameDay->whereDate('issued_on', $locked->issued_on?->toDateString())
                                    ->where('number', '>', $locked->number);
                            });
                    })
                    ->orderBy('issued_on')
                    ->orderBy('number')
                    ->first();

                if ($laterNotice) {
                    throw ValidationException::withMessages([
                        'notice' => "{$locked->number} kann nicht storniert werden, weil {$laterNotice->number} auf mindestens einer betroffenen Forderung aufbaut. Stornieren Sie neuere Mahnbelege zuerst.",
                    ]);
                }
            }

            if ($feeReceivable && ! $feeReceivable->trashed() && $feeReceivable->allocations()->exists()) {
                throw ValidationException::withMessages([
                    'notice' => "{$locked->number} kann nicht storniert werden, weil auf dem Gebühren-OP {$feeReceivable->number} bereits eine Zahlung verbucht ist. Nehmen Sie zuerst die Zahlungszuordnung zurück.",
                ]);
            }

            $cancelledByLabel = $userId
                ? User::query()->whereKey($userId)->value('name')
                : null;

            $locked->forceFill([
                'status' => 'cancelled',
                'cancellation_reason' => $reason,
                'cancelled_at' => now(),
                'cancelled_by' => $userId,
                'cancelled_by_label' => $cancelledByLabel,
            ])->save();

            if ($feeReceivable && ! $feeReceivable->trashed()) {
                $feeReceivable->delete();
            }

            foreach ($receivableIds as $receivableId) {
                $this->recalculateDunningState((string) $receivableId);
            }

            return $locked->fresh(['items', 'document', 'feeReceivable', 'cancelledBy']);
        }, 3);
    }

    private function assertMatchingRequestItems(DunningNotice $notice, Collection $rows): void
    {
        $requestedIds = $rows->pluck('id')->map('strval')->sort()->values()->all();
        $archivedIds = $notice->items()->pluck('receivable_id')->map('strval')->sort()->values()->all();
        if ($requestedIds !== $archivedIds) {
            throw ValidationException::withMessages([
                'receivableIds' => 'Diese Auftrags-ID wurde bereits für eine andere Auswahl verwendet. Bitte starten Sie einen neuen Mahnauftrag.',
            ]);
        }
    }

    private function validateRows(Collection $rows, CarbonImmutable $issuedOn): void
    {
        foreach ($rows as $row) {
            $amount = round((float) $row->amount, 2);
            $openAmount = round((float) $row->open_amount, 2);

            if ($amount <= 0) {
                throw new \LogicException('Open item amount must be greater than zero.');
            }
            if ($openAmount < 0 || $openAmount > $amount + 0.001) {
                throw new \LogicException('Open item open amount is outside the valid accounting range.');
            }

            if ($row->direction !== 'debit' || $openAmount <= 0.004 || $row->status === 'paid') {
                throw ValidationException::withMessages(['receivableIds' => "{$row->number} ist keine mahnfähige offene Forderung."]);
            }

            $effectiveDueOn = $row->due_date
                ? GermanPaymentDeadline::nextWorkingDay($row->due_date)
                : null;
            if ($effectiveDueOn === null || $effectiveDueOn->gte($issuedOn)) {
                $dueInfo = $effectiveDueOn ? ' (wirksame Fälligkeit: '.$effectiveDueOn->format('d.m.Y').')' : '';
                throw ValidationException::withMessages([
                    'receivableIds' => "{$row->number} ist am Ausstellungsdatum noch nicht überfällig{$dueInfo}.",
                ]);
            }

            if ($row->last_dunned_on && $issuedOn->lt($row->last_dunned_on)) {
                throw ValidationException::withMessages([
                    'issuedOn' => "{$row->number} wurde zuletzt am {$row->last_dunned_on->format('d.m.Y')} gemahnt. Das neue Ausstellungsdatum darf nicht davor liegen.",
                ]);
            }
        }
    }

    /** @return Collection<string,DunningNotice> */
    private function workItemQuery(CarbonImmutable $today)
    {
        return OpenItem::query()
            ->select([
                'id', 'contract_id', 'number', 'description', 'type', 'status', 'amount',
                'open_amount', 'due_date', 'last_dunned_on', 'last_dunning_level', 'dunning_count',
            ])
            ->whereNotNull('contract_id')
            ->whereIn('status', ['open', 'partial'])
            ->where('open_amount', '>', 0.004)
            ->where(function ($query) use ($today): void {
                $query->whereDate('due_date', '<', $today->toDateString())
                    // Also show agreements on not-yet-due OPs in Vorgemerkt.
                    ->orWhereHas('activePaymentAgreement');
            })
            ->whereNotIn('type', OpenItem::PAYOUT_TYPES);
    }

    private function loadWorkItemContext(Collection $rows): void
    {
        if ($rows->isEmpty()) return;

        $rows->load([
            'contract:id,contract_number,main_unit_id',
            'contract.parties' => static fn ($query) => $query
                ->select('id', 'contract_id', 'business_partner_id', 'party_role')
                ->whereIn('party_role', ContractParty::TENANT_ROLES),
            'contract.parties.businessPartner:id,display_name',
            'contract.mainUnit:id,property_id,unit_number,name',
            'contract.mainUnit.property:id,name',
        ]);
    }

    private function projectWorkRows(Collection $rows, array $policy, CarbonImmutable $today): Collection
    {
        $rows->loadMissing('activePaymentAgreement');
        $latestByReceivable = $this->latestActiveNotices($rows->pluck('id'));

        return $rows->map(function (OpenItem $row) use ($latestByReceivable, $policy, $today): array {
            /** @var DunningNotice|null $latest */
            $latest = $latestByReceivable->get((string) $row->id);
            $currentLevel = $latest?->level;
            $stateInfo = $this->workState($row, $latest, $policy, $today);
            $nextLevel = $stateInfo['nextLevel'];
            $actionableOn = $stateInfo['actionableOn'];
            $state = $stateInfo['state'];
            $agreement = $row->activePaymentAgreement;
            $phase = $nextLevel ? $this->phase($nextLevel, $policy) : null;

            return [
                'id' => (string) $row->id,
                'number' => (string) $row->number,
                'description' => (string) $row->description,
                'contractId' => (string) $row->contract_id,
                'contractNumber' => $row->contract_number,
                'tenantLabel' => $row->business_partner_label,
                'propertyLabel' => $row->property_label,
                'unitLabel' => $row->unit_label,
                'dueDate' => $row->due_date?->toDateString(),
                'openAmount' => (float) $row->open_amount,
                'currentLevel' => $currentLevel,
                'currentNoticeNumber' => $latest?->number,
                'nextLevel' => $nextLevel,
                'actionableOn' => $actionableOn->toDateString(),
                'state' => $state,
                'agreementId' => $agreement?->id,
                'agreementPayableOn' => $agreement?->payable_on?->toDateString(),
                'transitionLabel' => $agreement
                    ? ($state === 'deferred' ? 'Zahlungsvereinbarung läuft' : 'Zahlungsvereinbarung prüfen')
                    : $this->transitionLabel($currentLevel, $nextLevel),
                'paymentDueOn' => $phase
                    ? GermanPaymentDeadline::nextWorkingDay($today->addDays((int) $phase['dueDays']))->toDateString()
                    : null,
                'dueDays' => $phase['dueDays'] ?? null,
                'feeAmount' => $phase['feeAmount'] ?? null,
                'introText' => $phase['introText'] ?? null,
                'closingText' => $phase['closingText'] ?? null,
            ];
        });
    }

    /**
     * One shared decision for UI list, automation and all dunning stage previews.
     *
     * @return array{state:string,nextLevel:?string,actionableOn:CarbonImmutable}
     */
    private function workState(OpenItem $row, ?DunningNotice $latest, array $policy, CarbonImmutable $today): array
    {
        $nextLevel = $this->nextLevel($latest?->level);
        $actionableOn = $this->actionableOn($row, $latest, $policy);
        $agreement = $row->activePaymentAgreement;
        if ($agreement) {
            $agreedReview = $agreement->payable_on->addDay();
            return [
                'state' => $today->lt($agreedReview) ? 'deferred' : 'agreement_review',
                'nextLevel' => $nextLevel,
                'actionableOn' => $agreedReview,
            ];
        }

        return [
            'state' => $nextLevel === null
                ? ($today->gte($actionableOn) ? 'manual_review' : 'waiting')
                : ($today->gte($actionableOn) ? 'actionable' : 'waiting'),
            'nextLevel' => $nextLevel,
            'actionableOn' => $actionableOn,
        ];
    }

    private function latestActiveNotices(iterable $receivableIds): Collection
    {
        $ids = collect($receivableIds)->map('strval')->filter()->unique()->values();
        if ($ids->isEmpty()) return collect();

        return DunningNoticeItem::query()
            ->select(['id', 'receivable_id', 'dunning_notice_id'])
            ->whereIn('receivable_id', $ids->all())
            ->with(['notice' => static fn ($query) => $query
                ->where('status', 'active')
                ->select(['id', 'number', 'level', 'status', 'issued_on', 'payment_due_on'])])
            ->get()
            ->filter(fn (DunningNoticeItem $item): bool => $item->notice !== null)
            ->groupBy(fn (DunningNoticeItem $item): string => (string) $item->receivable_id)
            ->map(fn ($items) => $items
                ->sortByDesc(fn (DunningNoticeItem $item): string => ($item->notice?->issued_on?->format('Y-m-d') ?? '').'|'.($item->notice?->number ?? ''))
                ->first()?->notice)
            ->filter();
    }

    private function nextLevel(?string $currentLevel): ?string
    {
        return match ($currentLevel) {
            null => 'reminder',
            'reminder' => 'dunning_1',
            'dunning_1' => 'dunning_2',
            default => null,
        };
    }

    private function actionableOn(OpenItem $row, ?DunningNotice $latest, array $policy): CarbonImmutable
    {
        if ($latest) {
            // The postal grace runs after the effective § 193 BGB due date.
            // Queue, scheduler and issuance must not advance on a non-working day.
            $dueOn = GermanPaymentDeadline::nextWorkingDay(
                $latest->payment_due_on ?? $latest->issued_on ?? CarbonImmutable::today(),
            );

            return GermanPaymentDeadline::nextWorkingDay(
                $dueOn->addDays(1 + max(0, (int) ($policy['postalGraceDays'] ?? 0))),
            );
        }

        $dueOn = GermanPaymentDeadline::nextWorkingDay($row->due_date);

        return GermanPaymentDeadline::nextWorkingDay(
            $dueOn->addDays(max(1, (int) $policy['reminderStartAfterDays'])),
        );
    }

    private function validatePolicyTransition(Collection $rows, string $level, CarbonImmutable $issuedOn, array $policy): void
    {
        $latestByReceivable = $this->latestActiveNotices($rows->pluck('id'));

        foreach ($rows as $row) {
            /** @var DunningNotice|null $latest */
            $latest = $latestByReceivable->get((string) $row->id);
            $expected = $this->nextLevel($latest?->level);

            if ($expected === null) {
                throw ValidationException::withMessages([
                    'receivableIds' => "{$row->number} hat bereits eine aktive 2. Mahnung. Prüfen Sie den Vorgang im Mahnwesen manuell.",
                ]);
            }
            if ($level !== $expected) {
                throw ValidationException::withMessages([
                    'level' => "Für {$row->number} ist als nächster Schritt {$this->report->levelLabel($expected)} vorgesehen.",
                ]);
            }

            $earliest = $this->actionableOn($row, $latest, $policy);
            if ($issuedOn->lt($earliest)) {
                throw ValidationException::withMessages([
                    'issuedOn' => "{$row->number} kann frühestens am {$earliest->format('d.m.Y')} als {$this->report->levelLabel($expected)} erstellt werden.",
                ]);
            }
        }
    }

    /** @return array{dueDays:int,feeAmount:float,introText:string,closingText:string} */
    private function phase(string $level, ?array $policy = null): array
    {
        $policy ??= $this->policy();

        return match ($level) {
            'reminder' => [
                'dueDays' => (int) $policy['reminderDueDays'],
                'feeAmount' => (float) $policy['reminderFeeAmount'],
                'introText' => (string) $policy['reminderIntroText'],
                'closingText' => (string) $policy['reminderClosingText'],
            ],
            'dunning_1' => [
                'dueDays' => (int) $policy['dunning1DueDays'],
                'feeAmount' => (float) $policy['dunning1FeeAmount'],
                'introText' => (string) $policy['dunning1IntroText'],
                'closingText' => (string) $policy['dunning1ClosingText'],
            ],
            'dunning_2' => [
                'dueDays' => (int) $policy['dunning2DueDays'],
                'feeAmount' => (float) $policy['dunning2FeeAmount'],
                'introText' => (string) $policy['dunning2IntroText'],
                'closingText' => (string) $policy['dunning2ClosingText'],
            ],
            default => throw ValidationException::withMessages(['level' => 'Die ausgewählte Mahnstufe ist ungültig.']),
        };
    }

    private function transitionLabel(?string $currentLevel, ?string $nextLevel): string
    {
        if ($nextLevel === null) return 'Nach 2. Mahnung prüfen';
        if ($currentLevel === null) return 'Zahlungserinnerung erstellen';

        return $this->report->levelLabel($currentLevel).' → '.$this->report->levelLabel($nextLevel);
    }

    private function recalculateDunningState(string $receivableId): void
    {
        $receivable = OpenItem::withTrashed()
            ->lockForUpdate()
            ->find($receivableId);

        if (! $receivable) {
            return;
        }

        $activeNotices = DunningNotice::query()
            ->where('status', 'active')
            ->whereHas('items', fn ($query) => $query->where('receivable_id', $receivableId))
            ->orderByDesc('issued_on')
            ->orderByDesc('number')
            ->get(['id', 'level', 'issued_on', 'number']);
        $latest = $activeNotices->first();

        $receivable->forceFill([
            'last_dunning_level' => $latest?->level,
            'last_dunned_on' => $latest?->issued_on,
            'dunning_count' => $activeNotices->count(),
        ])->save();
    }

    private function storeDocument(DunningNotice $notice, string $pdf, ?string $userId, bool $archiveInContractFile): Document
    {
        $filename = $this->report->filename($notice);
        $documentId = (string) Str::uuid();
        $diskName = $this->documentStorage->disk();
        $path = $this->documentStorage->canonicalPath($documentId, null, $filename);
        $disk = Storage::disk($diskName);

        try {
            if (! $disk->put($path, $pdf)) {
                throw new \RuntimeException('Das Mahnschreiben konnte nicht im Dokumentenarchiv gespeichert werden.');
            }

            $context = (array) ($notice->context_snapshot ?? []);
            $document = new Document([
                'documentable_type' => $notice->getMorphClass(),
                'documentable_id' => $notice->id,
                'title' => $this->report->levelLabel($notice->level).' '.$notice->number,
                'description' => 'Automatisch erzeugter, unveränderlicher Mahnbeleg.',
                'status' => 'completed',
                'disk' => $diskName,
                'path' => $path,
                'original_name' => $filename,
                'mime_type' => 'application/pdf',
                'size_bytes' => strlen($pdf),
                'sha256' => hash('sha256', $pdf),
                'uploaded_by' => $userId,
                'metadata' => [
                    'generated' => true,
                    'generator' => 'dunning-notice-pdf',
                    'resourceType' => 'dunning-notices',
                    'noticeNumber' => $notice->number,
                    'level' => $notice->level,
                    'contractId' => (string) $notice->contract_id,
                    'contractNumber' => $context['contractNumber'] ?? null,
                    'contractArchive' => $archiveInContractFile,
                    'businessPartnerIds' => array_values((array) data_get($notice->recipient_snapshot, 'businessPartnerIds', [])),
                ],
            ]);
            $document->setAttribute($document->getKeyName(), $documentId);
            $document->save();

            return $document;
        } catch (Throwable $exception) {
            $disk->delete($path);
            throw $exception;
        }
    }

    private function contextSnapshot(Contract $contract): array
    {
        $unit = $contract->effectiveMainUnit();
        $property = $unit?->property;

        return [
            'contractNumber' => $contract->contract_number,
            'propertyLabel' => $property ? collect([$property->property_number, $property->name])->filter()->join(' · ') : null,
            'unitLabel' => $unit ? collect([$unit->unit_number, $unit->name])->filter()->join(' · ') : null,
        ];
    }

    private function recipientSnapshot(Contract $contract, CarbonImmutable $issuedOn): array
    {
        $partners = $contract->correspondencePartiesAt($issuedOn)
            ->pluck('businessPartner')
            ->filter()
            ->unique('id')
            ->values();
        $names = $partners->pluck('display_name')->map(fn ($name): string => trim((string) $name))->filter()->values();
        $address = $partners
            ->flatMap(fn (BusinessPartner $partner) => $partner->addresses
                ->filter(fn ($row): bool => ! method_exists($row, 'isCurrentlyValid') || $row->isCurrentlyValid())
                ->sortByDesc('is_primary'))
            ->first();
        $addressLines = $address ? array_values(array_filter([
            trim((string) $address->street.' '.(string) $address->house_number),
            trim((string) $address->postal_code.' '.(string) $address->city),
        ])) : [];

        return [
            'businessPartnerIds' => $partners->pluck('id')->map('strval')->values()->all(),
            'names' => $names->all(),
            'addressLines' => $addressLines,
            'lines' => [...$names->all(), ...$addressLines],
            'salutation' => $this->salutation($partners),
        ];
    }

    private function salutation(Collection $partners): string
    {
        $lines = $partners->map(function (BusinessPartner $partner): ?string {
            $profile = $partner->personProfile;

            if (! $profile) {
                return null;
            }

            $lastName = trim((string) $profile->last_name);

            return match (mb_strtolower(trim((string) $profile->salutation))) {
                'frau' => $lastName !== '' ? "Sehr geehrte Frau {$lastName}," : 'Sehr geehrte Dame,',
                'herr' => $lastName !== '' ? "Sehr geehrter Herr {$lastName}," : 'Sehr geehrter Herr,',
                default => $lastName !== '' ? "Guten Tag {$lastName}," : null,
            };
        })->filter()->unique()->values();

        return $lines->isNotEmpty() ? $lines->join("\n") : 'Sehr geehrte Damen und Herren,';
    }

    private function organizationSnapshot(): array
    {
        return app(OrganizationDocumentProfile::class)->current();
    }

    private function paymentQrCodeEnabled(): bool
    {
        $values = OrganizationSetting::query()
            ->where('section', 'organization')
            ->where('key', 'property-billing')
            ->first()?->values ?? [];

        return (bool) ($values['statementPaymentQrCodeEnabled']
            ?? OrganizationSetting::DEFAULTS['property-billing']['statementPaymentQrCodeEnabled']);
    }

    private function paymentSnapshot(Contract $contract): ?array
    {
        $account = $contract->effectiveMainUnit()?->property?->settlementBankAccount;

        return $this->bankAccountSnapshot($account);
    }

    private function bankAccountSnapshot(?BusinessPartnerBankAccount $account): ?array
    {
        if (! $account) {
            return null;
        }

        return [
            'accountHolder' => $account->account_holder,
            'iban' => $account->iban,
            'bic' => $account->bic,
            'bankName' => $account->bank_name,
        ];
    }
}
