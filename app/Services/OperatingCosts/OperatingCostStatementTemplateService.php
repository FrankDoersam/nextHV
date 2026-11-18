<?php

namespace App\Services\OperatingCosts;

use App\Support\Dates\GermanPaymentDeadline;
use App\Support\Formatting\OperatingCostDisplayFormatter;

use App\Models\Contract;
use App\Models\ContractParty;
use App\Services\Documents\OrganizationDocumentProfile;
use App\Models\OrganizationSetting;
use App\Services\Documents\ContractDocumentContextResolver;
use App\Services\Documents\TemplatePlaceholderEngine;
use App\Services\Documents\TemplateVariableCatalog;
use Carbon\Carbon;
use Illuminate\Validation\ValidationException;

final class OperatingCostStatementTemplateService
{
    public const DOCUMENT_SCHEMA_VERSION = 2;

    public function __construct(
        private readonly TemplatePlaceholderEngine $placeholders,
        private readonly TemplateVariableCatalog $catalog,
        private readonly ContractDocumentContextResolver $contractContexts,
    ) {}

    /** @param array<string,mixed> $calculationSnapshot @return array<string,mixed> */
    public function freeze(Contract $contract, array $calculationSnapshot, Carbon|string $createdOn): array
    {
        $created = Carbon::parse($createdOn)->startOfDay();
        $policy = $this->effectivePolicy($contract);
        $organization = $this->organizationSnapshot();
        $context = $this->contractContexts->resolve($contract);
        $recipient = (array) data_get($calculationSnapshot, 'recipient', []);
        $context['recipient'] = [
            'name' => collect((array) ($recipient['names'] ?? []))->filter()->join(', '),
            'salutation' => trim((string) ($recipient['salutation'] ?? '')) ?: 'Sehr geehrte Damen und Herren,',
            'address' => collect((array) ($recipient['addressLines'] ?? []))->filter()->join("\n"),
            'businessPartnerNumber' => $this->primaryTenantPartnerNumber($contract),
        ];
        $context['tenants'] = $this->tenantContext($contract, $calculationSnapshot);
        $context['session'] = [
            ...(array) ($context['session'] ?? []),
            'userDisplayName' => trim((string) auth()->user()?->name)
                ?: trim((string) ($organization['representedBy'] ?? ''))
                ?: trim((string) ($organization['senderName'] ?? '')),
        ];
        $context = $this->applyStatementValues($context, $calculationSnapshot, $created, $policy);

        return $this->document(
            $calculationSnapshot,
            $created,
            $policy,
            $this->freezeContext($context),
            $organization,
        );
    }

    /**
     * Re-renders a deliberately changed calculation (for example an external HKA)
     * from the original frozen policy and variable context. Current settings or
     * current contract master data are intentionally not consulted.
     *
     * @param array<string,mixed> $documentSnapshot
     * @param array<string,mixed> $calculationSnapshot
     * @return array<string,mixed>
     */
    public function refreeze(array $documentSnapshot, array $calculationSnapshot): array
    {
        if ((int) ($documentSnapshot['schemaVersion'] ?? 0) !== self::DOCUMENT_SCHEMA_VERSION) {
            throw ValidationException::withMessages([
                'statement' => 'Die Abrechnung besitzt keinen unterstützten eingefrorenen Dokumentstand und muss neu erstellt werden.',
            ]);
        }
        $policy = $documentSnapshot['policy'] ?? null;
        $context = $documentSnapshot['context'] ?? null;
        $createdOn = $documentSnapshot['createdOn'] ?? null;
        if (! is_array($policy) || ! is_array($context) || ! is_string($createdOn) || trim($createdOn) === '') {
            throw ValidationException::withMessages([
                'statement' => 'Der eingefrorene Dokumentstand ist unvollständig und die Abrechnung muss neu erstellt werden.',
            ]);
        }

        $created = Carbon::parse($createdOn)->startOfDay();
        $context = $this->applyStatementValues($context, $calculationSnapshot, $created, $policy);

        return $this->document(
            $calculationSnapshot,
            $created,
            $policy,
            $this->freezeContext($context),
            is_array($documentSnapshot['organization'] ?? null) ? $documentSnapshot['organization'] : [],
        );
    }

    /** @param array<string,mixed> $calculationSnapshot @param array<string,mixed> $policy @param array<string,mixed> $context @param array<string,mixed> $organization @return array<string,mixed> */
    private function document(array $calculationSnapshot, Carbon $created, array $policy, array $context, array $organization): array
    {
        $balance = round((float) data_get($calculationSnapshot, 'summary.balance', 0), 2);
        $kind = $this->kind($balance);
        $resultLabel = $this->resultLabel($kind);
        $dueDays = $this->dueDays($kind, $policy);
        $dueOn = $this->paymentDeadline($created, $kind, $policy);
        $footerTemplate = $this->footerTemplate($kind, $policy);
        $selectedAccount = $this->selectedAccount($kind, $calculationSnapshot);

        return [
            'schemaVersion' => self::DOCUMENT_SCHEMA_VERSION,
            'kind' => $kind,
            'resultLabel' => $resultLabel,
            'createdOn' => $created->toDateString(),
            'dueOn' => $dueOn->toDateString(),
            'dueDays' => $dueDays,
            'reference' => trim((string) data_get($calculationSnapshot, 'reference', '')),
            'salutation' => (string) data_get($context, 'recipient.salutation', 'Sehr geehrte Damen und Herren,'),
            'headerText' => $this->render('headerTemplate', (string) ($policy['headerTemplate'] ?? ''), $context),
            'footerText' => $footerTemplate !== '' ? $this->render($kind === 'credit' ? 'creditFooterTemplate' : 'paymentFooterTemplate', $footerTemplate, $context) : '',
            'policy' => $policy,
            'context' => $context,
            'organization' => $organization,
            'settlementAccount' => $selectedAccount !== [] ? $selectedAccount : null,
        ];
    }

    /** @param array<string,mixed> $context @param array<string,mixed> $calculationSnapshot @param array<string,mixed> $policy @return array<string,mixed> */
    private function applyStatementValues(array $context, array $calculationSnapshot, Carbon $created, array $policy): array
    {
        $balance = round((float) data_get($calculationSnapshot, 'summary.balance', 0), 2);
        $kind = $this->kind($balance);
        $dueDays = $this->dueDays($kind, $policy);
        $dueOn = $this->paymentDeadline($created, $kind, $policy);
        $reference = trim((string) data_get($calculationSnapshot, 'reference', ''));
        $selectedAccount = $this->selectedAccount($kind, $calculationSnapshot);

        $context['statement'] = [
            'date' => $created->format('d.m.Y'),
            'isoDate' => $created->toDateString(),
            'dueDate' => $dueOn->format('d.m.Y'),
            'dueIsoDate' => $dueOn->toDateString(),
            'dueDays' => $dueDays,
            'period' => $this->periodLabel($calculationSnapshot),
            'periodFrom' => $this->date((string) data_get($calculationSnapshot, 'period.from', '')),
            'periodUntil' => $this->date((string) data_get($calculationSnapshot, 'period.until', '')),
            'resultLabel' => $this->resultLabel($kind),
            'amount' => $this->money(abs($balance)),
            'balance' => $this->money($balance),
            'reference' => $reference,
        ];
        $context['settlement'] = [
            'accountHolder' => trim((string) ($selectedAccount['accountHolder'] ?? '')),
            'iban' => trim((string) ($selectedAccount['iban'] ?? '')),
            'bic' => trim((string) ($selectedAccount['bic'] ?? '')),
            'bankName' => trim((string) ($selectedAccount['bankName'] ?? '')),
            'reference' => $reference,
        ];

        return $context;
    }

    /** @return array<string,mixed> */
    private function effectivePolicy(Contract $contract): array
    {
        $global = $this->globalSettings();
        $overrides = is_array($contract->operating_cost_statement_settings)
            ? $contract->operating_cost_statement_settings
            : [];

        return [
            'headerTemplate' => $this->textOverride($overrides, 'headerTemplate', (string) ($global['statementHeaderTemplate'] ?? '')),
            'paymentFooterTemplate' => $this->textOverride($overrides, 'paymentFooterTemplate', (string) ($global['statementPaymentFooterTemplate'] ?? '')),
            'creditFooterTemplate' => $this->textOverride($overrides, 'creditFooterTemplate', (string) ($global['statementCreditFooterTemplate'] ?? '')),
            'paymentDueDays' => $this->integerOverride($overrides, 'paymentDueDays', (int) ($global['statementPaymentDueDays'] ?? 30)),
            // This document-level choice is frozen with the bank account and amount.
            'paymentQrCodeEnabled' => (bool) ($global['statementPaymentQrCodeEnabled'] ?? false),
            'creditDueDays' => $this->integerOverride($overrides, 'creditDueDays', (int) ($global['statementCreditDueDays'] ?? 30)),
        ];
    }

    /** @return array<string,mixed> */
    private function globalSettings(): array
    {
        $setting = OrganizationSetting::query()
            ->where('section', 'organization')
            ->where('key', 'property-billing')
            ->first();

        return $setting?->values ?? OrganizationSetting::DEFAULTS['property-billing'];
    }

    /** @return array<string,string> */
    private function organizationSnapshot(): array
    {
        return app(OrganizationDocumentProfile::class)->current();
    }

    /** @param array<string,mixed> $context @return array<string,mixed> */
    private function freezeContext(array $context): array
    {
        $frozen = [];
        foreach ($this->catalog->allowedPaths('statement', 'contract') as $path) {
            $value = data_get($context, $path);
            if ($value === null || (! is_scalar($value) && ! is_bool($value))) continue;
            data_set($frozen, $path, $value);
        }

        return $frozen;
    }

    /** @param array<string,mixed> $settings */
    private function textOverride(array $settings, string $key, string $default): string
    {
        $value = $settings[$key] ?? null;
        return is_string($value) && trim($value) !== '' ? trim($value) : trim($default);
    }

    /** @param array<string,mixed> $settings */
    private function integerOverride(array $settings, string $key, int $default): int
    {
        $value = $settings[$key] ?? null;
        return is_int($value) || is_numeric($value) ? max(0, min(365, (int) $value)) : max(0, min(365, $default));
    }

    /** @param array<string,mixed> $context */
    private function render(string $field, string $template, array $context): string
    {
        foreach ($this->placeholders->paths([$template]) as $path) {
            if (! $this->catalog->isAllowed($path, 'statement', 'contract')) {
                throw ValidationException::withMessages([
                    $field => 'Der Platzhalter „'.$path.'“ ist für Betriebskostenabrechnungen nicht zulässig.',
                ]);
            }
        }

        $missing = [];
        $rendered = $this->placeholders->render($template, $context, $missing);
        $requiredMissing = collect(array_keys($missing))
            ->reject(fn (string $path): bool => $this->catalog->isOptional($path))
            ->values();
        if ($requiredMissing->isNotEmpty()) {
            $path = (string) $requiredMissing->first();
            throw ValidationException::withMessages([
                $field => 'Der Platzhalter „'.$this->catalog->label($path).'“ ist für diese Abrechnung nicht gefüllt.',
            ]);
        }

        return trim($rendered);
    }

    /** @param array<string,mixed> $snapshot */
    private function periodLabel(array $snapshot): string
    {
        $from = $this->date((string) data_get($snapshot, 'period.from', ''));
        $until = $this->date((string) data_get($snapshot, 'period.until', ''));
        return trim($from.' – '.$until, ' –');
    }

    private function date(string $value): string
    {
        if (trim($value) === '') return '';
        try {
            return Carbon::parse($value)->format('d.m.Y');
        } catch (\Throwable) {
            return $value;
        }
    }

    private function money(float $value): string
    {
        return OperatingCostDisplayFormatter::money($value);
    }

    private function kind(float $balance): string
    {
        return $balance < -0.004 ? 'credit' : ($balance > 0.004 ? 'payment' : 'balanced');
    }

    private function resultLabel(string $kind): string
    {
        return match ($kind) {
            'credit' => 'Gutschrift',
            'payment' => 'Nachzahlung',
            default => 'Ausgeglichen',
        };
    }

    /** @param array<string,mixed> $policy */
    private function dueDays(string $kind, array $policy): int
    {
        return match ($kind) {
            'credit' => max(0, min(365, (int) ($policy['creditDueDays'] ?? 0))),
            'payment' => max(0, min(365, (int) ($policy['paymentDueDays'] ?? 0))),
            default => 0,
        };
    }

    /** The same due date must be frozen for PDF, placeholders and the eventual OP. */
    private function paymentDeadline(Carbon $created, string $kind, array $policy): \Carbon\CarbonImmutable
    {
        $nominalDueOn = $created->copy()->addDays($this->dueDays($kind, $policy));
        if ($kind === 'balanced') {
            return $nominalDueOn->toImmutable();
        }

        return GermanPaymentDeadline::nextWorkingDay($nominalDueOn);
    }

    /** @param array<string,mixed> $policy */
    private function footerTemplate(string $kind, array $policy): string
    {
        return match ($kind) {
            'credit' => trim((string) ($policy['creditFooterTemplate'] ?? '')),
            'payment' => trim((string) ($policy['paymentFooterTemplate'] ?? '')),
            default => '',
        };
    }

    /** @param array<string,mixed> $snapshot @return array<string,mixed> */
    private function selectedAccount(string $kind, array $snapshot): array
    {
        return match ($kind) {
            'credit' => (array) data_get($snapshot, 'paymentAccounts.refund', []),
            'payment' => (array) data_get($snapshot, 'paymentAccounts.payment', []),
            default => [],
        };
    }

    private function primaryTenantPartnerNumber(Contract $contract): string
    {
        $party = $contract->parties
            ->whereIn('party_role', ContractParty::TENANT_ROLES)
            ->sortBy(fn (ContractParty $row): string => ($row->party_role === 'tenant' ? '0' : '1').'|'.($row->valid_from?->format('Y-m-d') ?? '').'|'.$row->id)
            ->first();

        return trim((string) $party?->businessPartner?->partner_number);
    }

    /** @param array<string,mixed> $snapshot @return array<string,mixed> */
    private function tenantContext(Contract $contract, array $snapshot): array
    {
        $parties = $contract->parties
            ->whereIn('party_role', ContractParty::TENANT_ROLES)
            ->sortBy(fn (ContractParty $row): string => ($row->party_role === 'tenant' ? '0' : '1').'|'.($row->valid_from?->format('Y-m-d') ?? '').'|'.$row->id)
            ->pluck('businessPartner')
            ->filter()
            ->unique('id')
            ->values();
        $names = collect((array) data_get($snapshot, 'recipient.names', []))->filter()->values();
        if ($names->isEmpty()) $names = $parties->pluck('display_name')->filter()->values();

        return [
            'all' => $names->join("\n\n"),
            'signatureNames' => $names->join('; '),
            'allWithIds' => $parties->map(function ($partner): string {
                $reference = trim((string) $partner->partner_number);
                $name = trim((string) $partner->display_name);
                return $name.($reference !== '' ? " ({$reference})" : '');
            })->filter()->join("\n"),
            'count' => $names->count(),
        ];
    }
}
