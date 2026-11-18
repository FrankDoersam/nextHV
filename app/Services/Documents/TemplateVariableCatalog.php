<?php

namespace App\Services\Documents;

final class TemplateVariableCatalog
{
    public const ID = 'contract';
    public const VERSION = 5;
    public const USAGES = ['report', 'letter', 'statement'];
    public const RECIPIENT_TYPES = ['any', 'contract', 'business_partner', 'manual'];

    /** @var array<string,string> */
    private const LEGACY_PATH_ALIASES = [
        'inputs.anrede' => 'recipient.salutation',
        'inputs.signatur' => 'session.userDisplayName',
        'inputs.empfaenger' => 'recipient.name',
        'inputs.briefdatum' => 'letter.date',
        'inputs.vertragsnummer' => 'contract.number',
        'inputs.gp_nummer' => 'recipient.businessPartnerNumber',
        'inputs.absender' => 'organization.name',
        'inputs.absender_email' => 'organization.email',
        'inputs.absender_telefon' => 'organization.phone',
        'inputs.absender_fax' => 'organization.fax',
    ];

    /** @var array<string,string> */
    private const LEGACY_TOKEN_ALIASES = [
        'anrede' => 'recipient.salutation',
        'signatur' => 'session.userDisplayName',
        'empfaenger' => 'recipient.name',
        'briefdatum' => 'letter.date',
        'vertragsnummer' => 'contract.number',
        'gp_nummer' => 'recipient.businessPartnerNumber',
        'absender' => 'organization.name',
        'absender_email' => 'organization.email',
        'absender_telefon' => 'organization.phone',
        'absender_fax' => 'organization.fax',
    ];

    /** @return array<string,mixed> */
    public function catalog(?string $usage = null, ?string $recipientType = null): array
    {
        $variables = collect($this->variables());

        if ($usage !== null) {
            $variables = $variables->filter(fn (array $variable): bool => in_array($usage, (array) ($variable['usages'] ?? []), true));
        }
        if ($recipientType !== null) {
            $variables = $variables->filter(function (array $variable) use ($recipientType): bool {
                $types = (array) ($variable['recipientTypes'] ?? ['any']);
                return in_array('any', $types, true) || in_array($recipientType, $types, true);
            });
        }

        $relations = $usage === null || $usage === 'report' ? ContractDocumentDataRegistry::relations() : [];

        return [
            'label' => 'Vertrag',
            'version' => self::VERSION,
            'variables' => $variables->values()->all(),
            'relations' => $relations,
            'capabilities' => [
                'report' => true,
                'letter' => true,
                'statement' => true,
                'relationTables' => $usage === null || $usage === 'report',
                'canonicalPlaceholders' => true,
                'legacyReadCompatibility' => true,
            ],
        ];
    }

    /** @return array<int,array<string,mixed>> */
    public function variables(): array
    {
        $variables = collect(ContractDocumentDataRegistry::variables())
            ->map(fn (array $variable): array => $this->decorateContractVariable($variable))
            ->keyBy('path');

        foreach ($this->scopeVariables() as $variable) {
            $variables->put($variable['path'], $variable);
        }
        foreach ($this->letterVariables() as $variable) {
            $variables->put($variable['path'], $variable);
        }
        foreach ($this->statementVariables() as $variable) {
            $variables->put($variable['path'], $variable);
        }

        return $variables->values()->all();
    }

    /** @return array<int,string> */
    public function allowedPaths(?string $usage = null, ?string $recipientType = null): array
    {
        return collect($this->catalog($usage, $recipientType)['variables'] ?? [])
            ->pluck('path')->filter()->map(fn ($path): string => (string) $path)->values()->all();
    }

    public function isAllowed(string $path, ?string $usage = null, ?string $recipientType = null, bool $allowLegacy = false): bool
    {
        $canonical = $this->canonicalPath($path, $allowLegacy);
        return $canonical !== null && in_array($canonical, $this->allowedPaths($usage, $recipientType), true);
    }

    public function canonicalPath(string $path, bool $allowLegacy = false): ?string
    {
        $path = trim($path);
        if ($path === '') return null;
        if ($allowLegacy && isset(self::LEGACY_PATH_ALIASES[mb_strtolower($path)])) {
            return self::LEGACY_PATH_ALIASES[mb_strtolower($path)];
        }
        return in_array($path, $this->allowedPaths(), true) ? $path : null;
    }

    public function canonicalLegacyToken(string $token): ?string
    {
        return self::LEGACY_TOKEN_ALIASES[mb_strtolower(trim($token))] ?? null;
    }

    public function label(string $path): string
    {
        $canonical = $this->canonicalPath($path, true) ?? $path;
        $variable = collect($this->variables())->firstWhere('path', $canonical);
        return (string) ($variable['label'] ?? $canonical);
    }

    public function isOptional(string $path): bool
    {
        $canonical = $this->canonicalPath($path);
        if ($canonical === null) return false;

        $variable = collect($this->variables())->firstWhere('path', $canonical);
        return (bool) ($variable['optional'] ?? false);
    }

    /** @param array<string,mixed> $variable @return array<string,mixed> */
    private function decorateContractVariable(array $variable): array
    {
        $path = (string) ($variable['path'] ?? '');
        $global = str_starts_with($path, 'organization.') || str_starts_with($path, 'today.');
        $usages = ['report', 'letter', 'statement'];
        if (in_array($path, ['property.billingHeaderText', 'property.billingFooterText'], true)) {
            $usages = ['report', 'letter'];
        }

        return [
            ...$variable,
            'usages' => $usages,
            'recipientTypes' => $global ? ['any'] : ['contract'],
            'keywords' => array_values(array_unique(array_filter([
                (string) ($variable['group'] ?? ''),
                (string) ($variable['label'] ?? ''),
                $path,
            ]))),
        ];
    }

    /** @return array<int,array<string,mixed>> */
    private function scopeVariables(): array
    {
        return [
            $this->variable('contract.noticePeriodMonths', 'Kündigungsfrist Monate', 'Vertrag', true, ['report', 'letter', 'statement'], ['contract'], 'Leer = gesetzliche Frist, 0 = zum Monatsende.'),
            $this->variable('contract.noticePeriodLabel', 'Kündigungsfrist', 'Vertrag', false, ['report', 'letter', 'statement'], ['contract'], 'Vertragsfertige Bezeichnung der Kündigungsfrist.'),
            $this->variable('contract.documentScope', 'Dokumentbezug', 'Vertrag', true, ['report', 'letter', 'statement'], ['contract'], 'Hauptvertrag und gegebenenfalls verknüpfte Vertragsbeziehungen.'),
            $this->variable('contract.linkedContractSummary', 'Verknüpfte Verträge', 'Vertrag', true, ['report', 'letter', 'statement'], ['contract']),
            $this->variable('contract.linkedResidentialContractLabel', 'Verknüpfter Wohnraummietvertrag', 'Vertrag', true, ['report', 'letter', 'statement'], ['contract']),
            $this->variable('session.userDisplayName', 'Bearbeiter / Signatur', 'Dokument', false, ['report', 'letter', 'statement'], ['any'], 'Aktuell handelnde bzw. zugeordnete Person.'),
        ];
    }

    /** @return array<int,array<string,mixed>> */
    private function letterVariables(): array
    {
        return [
            $this->variable('recipient.name', 'Empfänger', 'Empfänger', false, ['letter', 'statement'], ['any'], 'Name bzw. Namen der adressierten Person oder Organisation.'),
            $this->variable('recipient.salutation', 'Anrede', 'Empfänger', false, ['letter', 'statement'], ['any'], 'Automatisch aus dem gewählten Empfänger ermittelte Anrede.'),
            $this->variable('recipient.address', 'Empfängeranschrift', 'Empfänger', false, ['letter', 'statement'], ['any'], 'Zum Dokumentdatum ermittelte Postanschrift.'),
            $this->variable('recipient.businessPartnerNumber', 'GP-Nummer Empfänger', 'Empfänger', true, ['letter', 'statement'], ['business_partner', 'contract']),
            $this->variable('letter.date', 'Briefdatum', 'Brief', false, ['letter'], ['any'], 'Briefdatum im deutschen Format.'),
            $this->variable('letter.isoDate', 'Briefdatum ISO', 'Brief', false, ['letter'], ['any'], 'Briefdatum im Format JJJJ-MM-TT.'),
            $this->variable('letter.number', 'Briefnummer', 'Brief', true, ['letter'], ['any'], 'Nach Finalisierung vergebene Briefnummer.'),
            $this->variable('letter.yourReference', 'Ihr Zeichen', 'Brief', true, ['letter'], ['any']),
            $this->variable('letter.ourReference', 'Unser Zeichen', 'Brief', true, ['letter'], ['any']),
        ];
    }

    /** @return array<int,array<string,mixed>> */
    private function statementVariables(): array
    {
        return [
            $this->variable('statement.date', 'Abrechnungsdatum', 'Abrechnung', false, ['statement'], ['contract'], 'Erstellungsdatum der Abrechnung im deutschen Format.'),
            $this->variable('statement.isoDate', 'Abrechnungsdatum ISO', 'Abrechnung', false, ['statement'], ['contract']),
            $this->variable('statement.dueDate', 'Fälligkeit / Erstattung bis', 'Abrechnung', false, ['statement'], ['contract'], 'Aus dem für Nachzahlung oder Gutschrift konfigurierten Fristwert berechnetes Datum.'),
            $this->variable('statement.dueIsoDate', 'Fälligkeit ISO', 'Abrechnung', false, ['statement'], ['contract']),
            $this->variable('statement.dueDays', 'Frist in Tagen', 'Abrechnung', false, ['statement'], ['contract']),
            $this->variable('statement.period', 'Abrechnungszeitraum', 'Abrechnung', false, ['statement'], ['contract']),
            $this->variable('statement.periodFrom', 'Abrechnungsbeginn', 'Abrechnung', false, ['statement'], ['contract']),
            $this->variable('statement.periodUntil', 'Abrechnungsende', 'Abrechnung', false, ['statement'], ['contract']),
            $this->variable('statement.resultLabel', 'Ergebnisart', 'Abrechnung', false, ['statement'], ['contract'], 'Nachzahlung, Gutschrift oder Ausgeglichen.'),
            $this->variable('statement.amount', 'Abrechnungsbetrag', 'Abrechnung', false, ['statement'], ['contract'], 'Absoluter Nachzahlungs- oder Gutschriftbetrag.'),
            $this->variable('statement.balance', 'Saldo', 'Abrechnung', false, ['statement'], ['contract'], 'Saldo mit Vorzeichen.'),
            $this->variable('statement.reference', 'Referenz / Verwendungszweck', 'Abrechnung', false, ['statement'], ['contract']),
            $this->variable('settlement.accountHolder', 'Kontoinhaber', 'Abrechnungskonto', true, ['statement'], ['contract']),
            $this->variable('settlement.iban', 'IBAN', 'Abrechnungskonto', true, ['statement'], ['contract']),
            $this->variable('settlement.bic', 'BIC', 'Abrechnungskonto', true, ['statement'], ['contract']),
            $this->variable('settlement.bankName', 'Bank', 'Abrechnungskonto', true, ['statement'], ['contract']),
            $this->variable('settlement.reference', 'Zahlungsreferenz', 'Abrechnungskonto', false, ['statement'], ['contract']),
        ];
    }

    /** @return array<string,mixed> */
    private function variable(string $path, string $label, string $group, bool $optional, array $usages, array $recipientTypes, ?string $description = null): array
    {
        return [
            'path' => $path,
            'label' => $label,
            'group' => $group,
            'optional' => $optional,
            'description' => $description,
            'usages' => $usages,
            'recipientTypes' => $recipientTypes,
            'keywords' => array_values(array_unique(array_filter([$group, $label, $path]))),
        ];
    }
}
