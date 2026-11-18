<?php

namespace App\Services\OperatingCosts;

use App\Models\AllocationKey;
use App\Models\BusinessPartnerBankAccount;
use App\Models\Contract;
use App\Models\ContractParty;
use App\Models\IncomingInvoiceItem;
use App\Models\Unit;
use App\Services\OperatingCosts\Concerns\AllocatesStatementCosts;
use App\Services\OperatingCosts\Concerns\BuildsStatementSnapshot;
use App\Services\OperatingCosts\Concerns\CalculatesDirectCosts;
use App\Services\OperatingCosts\Concerns\CalculatesInvoiceCosts;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

class OperatingCostStatementService
{
    use AllocatesStatementCosts;
    use BuildsStatementSnapshot;
    use CalculatesDirectCosts;
    use CalculatesInvoiceCosts;

    private Contract $contract;
    private Unit $unit;
    private Carbon $periodFrom;
    private Carbon $periodUntil;
    private Carbon $usageFrom;
    private Carbon $usageUntil;
    private Collection $allocationKeys;
    private Collection $allocationKeysByCode;
    /** @var array<string, array<string, mixed>> */
    private array $meterGroups = [];
    /** @var array<int, string> */
    private array $allocationWarnings = [];
    /** @var array<string,mixed> */
    private array $heatingSystem = [];
    private readonly ActualAdvancePaymentService $advancePayments;
    private readonly PersonDayAllocationService $personDays;
    private readonly MeterAllocationService $meterAllocation;
    private readonly WasteCostAllocationService $wasteCosts;
    private readonly HeatingCostComplianceService $heatingCompliance;

    public function __construct(
        string $contractId,
        Carbon|string $periodFrom,
        Carbon|string $periodUntil,
    ) {
        $this->contract = Contract::query()->with([
            'mainUnit.property.settlementBankAccount.businessPartner',
            'units.unit.property',
            'parties.businessPartner.personProfile',
            'parties.businessPartner.addresses',
            'refundBankAccount.businessPartner',
            'conditions',
            'terminations',
        ])->findOrFail($contractId);
        $this->unit = $this->contract->effectiveMainUnit()
            ?? throw ValidationException::withMessages([
                'contractIds' => 'Ein ausgewählter Vertrag besitzt keine abrechenbare Haupteinheit.',
            ]);
        if (! $this->unit->operating_cost_billable) {
            throw ValidationException::withMessages([
                'contractIds' => 'Die Haupteinheit des ausgewählten Vertrags ist von der Betriebskostenabrechnung ausgeschlossen.',
            ]);
        }

        $this->periodFrom = Carbon::parse($periodFrom)->startOfDay();
        $this->periodUntil = Carbon::parse($periodUntil)->startOfDay();
        if ($this->periodUntil->lt($this->periodFrom)) {
            throw ValidationException::withMessages([
                'periodUntil' => 'Das Ende des Abrechnungszeitraums darf nicht vor seinem Beginn liegen.',
            ]);
        }

        $contractUntil = $this->contract->confirmed_end_on ?? $this->contract->fixed_until;
        $this->usageFrom = $this->periodFrom->greaterThan($this->contract->starts_on)
            ? $this->periodFrom->copy()
            : Carbon::parse($this->contract->starts_on)->startOfDay();
        $this->usageUntil = $contractUntil && Carbon::parse($contractUntil)->lessThan($this->periodUntil)
            ? Carbon::parse($contractUntil)->startOfDay()
            : $this->periodUntil->copy();

        $keys = AllocationKey::query()->get(['id', 'code', 'name']);
        $this->allocationKeys = $keys->keyBy('id');
        $this->allocationKeysByCode = $keys->keyBy(
            fn (AllocationKey $key): string => mb_strtolower(trim((string) $key->code)),
        );

        $this->advancePayments = app(ActualAdvancePaymentService::class);
        $this->personDays = app(PersonDayAllocationService::class);
        $this->meterAllocation = app(MeterAllocationService::class);
        $this->wasteCosts = app(WasteCostAllocationService::class);
        $this->heatingCompliance = app(HeatingCostComplianceService::class);
    }

    public function calculate(): array
    {
        $property = $this->unit->property;
        if (! $property) {
            throw ValidationException::withMessages(['contractIds' => 'Die Haupteinheit ist keinem Objekt zugeordnet.']);
        }
        if ($this->usageUntil->lt($this->usageFrom)) {
            throw ValidationException::withMessages(['contractIds' => 'Der Vertrag überschneidet den Abrechnungszeitraum nicht.']);
        }

        $units = Unit::query()
            ->where('property_id', $property->id)
            ->where('status', '!=', 'archived')
            ->where('operating_cost_billable', true)
            ->orderBy('unit_number')
            ->get();

        if (! $units->contains('id', $this->unit->id)) {
            throw ValidationException::withMessages(['contractIds' => 'Die Haupteinheit ist nicht für die Betriebskostenabrechnung freigegeben.']);
        }

        $billingMode = (string) ($property->billing_mode ?: 'operating_and_heating');
        $heatingBillingType = (string) ($property->heating_billing_type ?: 'internal');
        $includeOperating = in_array($billingMode, ['operating_and_heating', 'operating_only'], true);
        $configuredHeating = in_array($billingMode, ['operating_and_heating', 'heating_only'], true);
        $includeHeating = $configuredHeating && $heatingBillingType === 'internal';
        $statementBillingMode = $this->statementBillingMode($includeOperating, $includeHeating);

        $this->meterGroups = ($includeOperating || $includeHeating)
            ? $this->meterAllocation->consumptionForContract(
                $this->contract,
                $this->periodFrom,
                $this->periodUntil,
                $this->usageFrom,
                $this->usageUntil,
            )
            : [];
        if (! $includeHeating) {
            $this->meterGroups = collect($this->meterGroups)
                ->reject(fn (array $group, string $key): bool => in_array($key, ['heating', 'hot_water'], true))
                ->all();
        } else {
            $this->heatingSystem = $this->heatingCompliance->systemSnapshot($property, $this->periodFrom, $this->periodUntil);
        }

        $invoiceItems = $this->invoiceItems();
        $heatingItems = $invoiceItems->filter(fn (IncomingInvoiceItem $item): bool => $this->isHeatingItem($item))->values();
        $waterItems = $invoiceItems->filter(fn (IncomingInvoiceItem $item): bool => ! $this->isHeatingItem($item) && $this->isWaterItem($item))->values();
        $wasteItems = $invoiceItems->filter(
            fn (IncomingInvoiceItem $item): bool => ! $this->isHeatingItem($item)
                && ! $this->isWaterItem($item)
                && $this->isWasteItem($item),
        )->values();
        $otherItems = $invoiceItems->reject(
            fn (IncomingInvoiceItem $item): bool => $this->isHeatingItem($item)
                || $this->isWaterItem($item)
                || $this->isWasteItem($item),
        )->values();

        $rows = collect();
        $warnings = [];
        $this->allocationWarnings = [];

        if ($includeOperating) {
            $rows->push(...$this->allocatedInvoiceRows($waterItems, $units));
            $rows->push(...$this->allocatedInvoiceRows($otherItems, $units));

            if ($wasteItems->isNotEmpty()) {
                $rows->push(...$this->allocatedInvoiceRows($wasteItems, $units));
            } else {
                $waste = $this->wasteCosts->allocateContainers($this->contract, $this->periodFrom, $this->periodUntil);
                $rows->push(...($waste['rows'] ?? []));
                $warnings = [...$warnings, ...($waste['warnings'] ?? [])];
            }

            $rows->push(...$this->directAllocationCosts($units));
        }

        if ($includeHeating) {
            if ($heatingItems->isEmpty()) {
                throw ValidationException::withMessages([
                    'heatingCosts' => 'Für die interne Heizkostenabrechnung wurden keine abrechenbaren Heizenergie-Kostenpositionen gefunden.',
                ]);
            }
            $rows->push(...$this->internalHeatingCosts($heatingItems, $units));
        }

        $warnings = [...$warnings, ...$this->allocationWarnings];
        $rows = $rows
            ->filter(fn (mixed $row): bool => is_array($row) && abs((float) ($row['allocatedAmount'] ?? 0)) >= 0.005)
            ->values();
        $costTotal = round($rows->sum('allocatedAmount'), 2);

        $advance = $this->advancePayments->calculate(
            $this->contract,
            $this->periodFrom,
            $this->periodUntil,
            $statementBillingMode,
        );
        $advanceTotal = round((float) ($advance['total'] ?? 0), 2);
        $balance = round($costTotal - $advanceTotal, 2);
        $recipient = $this->recipientSnapshot();
        $tenant = collect($recipient['names'] ?? [])->filter()->join(', ');
        $personDays = $this->personDaySnapshot();
        $sections = $this->statementSections($rows, $includeHeating);

        $heatingCompliance = $includeHeating ? [
            'system' => $this->heatingSystem,
            'energyCarrier' => [
                'name' => $property->heating_type === 'heat_pump' ? 'Strom' : (string) ($property->heating_type ?: 'Heizenergie'),
                'sharePercent' => 100.0,
                'heatingSystem' => $property->heating_type,
                'co2CostAllocationApplicable' => in_array($property->heating_type, ['gas', 'oil'], true),
                'note' => in_array($property->heating_type, ['heat_pump', 'electric'], true)
                    ? 'Für den Netzstrom einer eigenen elektrischen Wärmeerzeugung wird keine CO₂-Kostenaufteilung nach CO₂KostAufG angesetzt.'
                    : null,
            ],
            'invoiceSources' => $this->heatingInvoiceSources($heatingItems),
        ] : null;

        return [
            'schemaVersion' => 10,
            'title' => 'Betriebskostenabrechnung '.$this->periodUntil->format('Y'),
            'reference' => 'NKA_'.$this->contract->contract_number.'_'.$this->periodUntil->format('Y'),
            'period' => ['from' => $this->periodFrom->toDateString(), 'until' => $this->periodUntil->toDateString()],
            'usagePeriod' => ['from' => $this->usageFrom->toDateString(), 'until' => $this->usageUntil->toDateString()],
            'property' => [
                'id' => $property->id,
                'number' => $property->property_number,
                'name' => $property->name,
                'address' => $property->full_address,
                'postalCode' => $property->postal_code,
                'city' => $property->city,
                'billingMode' => $billingMode,
                'statementBillingMode' => $statementBillingMode,
                'heatingType' => $property->heating_type,
                'heatingBillingType' => $heatingBillingType,
                'hasNka' => $includeOperating,
                'hasHka' => $includeHeating,
            ],
            'unit' => [
                'id' => $this->unit->id,
                'number' => $this->unit->unit_number,
                'name' => $this->unit->name,
                'area' => $this->unitArea($this->unit),
            ],
            'contract' => [
                'id' => $this->contract->id,
                'number' => $this->contract->contract_number,
                'tenant' => $tenant !== '' ? $tenant : $this->contract->tenant_labels,
            ],
            'recipient' => $recipient,
            'paymentAccounts' => [
                'payment' => $this->paymentAccountSnapshot($property->settlementBankAccount),
                'refund' => $this->bankAccountSnapshot($this->contract->refundBankAccount),
            ],
            'sections' => $sections,
            'allocation' => [
                ...$this->allocationSnapshot($units),
                'personDays' => $personDays,
                'meters' => $this->meterGroups,
            ],
            'heatingCompliance' => $heatingCompliance,
            'costs' => $rows->all(),
            'summary' => [
                'costTotal' => $costTotal,
                'advanceTotal' => $advanceTotal,
                'advanceDetails' => $advance['details'] ?? [],
                'advanceGroups' => $advance['groups'] ?? [],
                'advanceMonths' => $advance['months'] ?? [],
                'paymentReceipts' => $advance['receipts'] ?? [],
                'advanceSource' => $advance['source'] ?? 'actual_payment_allocations',
                'balance' => $balance,
                'label' => $balance >= 0 ? 'Nachzahlung' : 'Gutschrift',
                'warnings' => array_values(array_unique($warnings)),
            ],
        ];
    }

    private function heatingInvoiceSources(Collection $items): array
    {
        return $items->map(function (IncomingInvoiceItem $item): ?array {
            $period = $this->invoicePeriodAmount($item);
            if (abs((float) ($period['amount'] ?? 0)) < 0.005) return null;
            $gross = (float) $item->gross_amount;
            $ratio = $gross !== 0.0 ? (float) $period['amount'] / $gross : 0.0;
            $timeRatio = (int) ($period['sourceDays'] ?? 0) > 0
                ? (int) ($period['overlapDays'] ?? 0) / max(1, (int) ($period['sourceDays'] ?? 1))
                : 1.0;

            return [
                'supplier' => $item->invoice?->supplier_label,
                'invoiceNumber' => $item->invoice?->external_number ?: $item->invoice?->number,
                'description' => $item->description,
                'quantity' => is_numeric($item->quantity) ? round((float) $item->quantity * $timeRatio, 3) : null,
                'unit' => $item->unit,
                'netAmount' => round((float) $item->net_amount * $ratio, 2),
                'taxAmount' => round((float) $item->tax_amount * $ratio, 2),
                'grossAmount' => round((float) $period['amount'], 2),
                'periodFrom' => $period['overlapFrom'] ?? null,
                'periodUntil' => $period['overlapUntil'] ?? null,
            ];
        })->filter()->values()->all();
    }

    private function statementBillingMode(bool $includeOperating, bool $includeHeating): string
    {
        return match (true) {
            $includeOperating && $includeHeating => 'operating_and_heating',
            $includeOperating => 'operating_only',
            $includeHeating => 'heating_only',
            default => 'none',
        };
    }

    private function statementSections(Collection $rows, bool $includeHeating): array
    {
        $meters = collect($this->meterGroups);
        $waterMeters = $meters->filter(
            fn (array $group, string $key): bool => in_array($key, ['water', 'hot_water', 'garden'], true)
                || $this->containsAny(mb_strtolower((string) ($group['label'] ?? '')), ['wasser', 'garten']),
        );

        return [
            'water' => $rows->where('category', 'water')->isNotEmpty() || $waterMeters->isNotEmpty(),
            'waste' => $rows->where('category', 'waste')->isNotEmpty(),
            'services' => $rows->where('category', 'direct')->isNotEmpty(),
            'heating' => $includeHeating && $rows->where('category', 'heating')->isNotEmpty(),
        ];
    }

    private function paymentAccountSnapshot(?BusinessPartnerBankAccount $account): ?array
    {
        if (! $account) return null;

        if ($this->contract->parties
            ->whereIn('party_role', ContractParty::TENANT_ROLES)
            ->contains('business_partner_id', $account->business_partner_id)) {
            throw ValidationException::withMessages([
                'contractIds' => 'Das Nachzahlungskonto des Objekts darf nicht einem Mieter des Vertrags gehören. Bitte hinterlegen Sie das Verwaltungskonto am Objekt.',
            ]);
        }

        return $this->bankAccountSnapshot($account);
    }

    private function bankAccountSnapshot(?BusinessPartnerBankAccount $account): ?array
    {
        if (! $account) return null;

        return [
            'id' => (string) $account->id,
            'businessPartnerId' => (string) $account->business_partner_id,
            'businessPartnerName' => $account->businessPartner?->display_name,
            'accountHolder' => $account->account_holder,
            'iban' => $account->iban,
            'bic' => $account->bic,
            'bankName' => $account->bank_name,
            'purpose' => $account->purpose,
        ];
    }
}
