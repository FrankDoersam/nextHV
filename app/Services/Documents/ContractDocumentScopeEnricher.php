<?php

namespace App\Services\Documents;

use App\Models\Contract;

/**
 * Adds a stable document scope for reports that belong to a main contract but
 * also describe linked contractual relationships (for example a garage lease).
 */
final class ContractDocumentScopeEnricher
{
    /** @param array<string, mixed> $context */
    public function enrich(?Contract $contract, array $context): array
    {
        $mainNumber = trim((string) data_get($context, 'contract.number', ''));
        $linked = $contract
            ? collect($contract->linked_contracts)
                ->map(fn (array $row): array => [
                    'id' => trim((string) ($row['contractId'] ?? '')),
                    'contractNumber' => trim((string) ($row['contractNumber'] ?? '')),
                    'contractType' => trim((string) ($row['contractType'] ?? '')),
                    'contractTypeLabel' => $this->contractTypeLabel((string) ($row['contractType'] ?? '')),
                    'status' => trim((string) ($row['status'] ?? '')),
                ])
                ->filter(fn (array $row): bool => $row['id'] !== '' || $row['contractNumber'] !== '')
                ->unique(fn (array $row): string => $row['id'] !== '' ? $row['id'] : $row['contractNumber'])
                ->values()
            : collect();

        $linkedNumbers = $linked->pluck('contractNumber')->filter()->unique()->values();
        $linkedLabels = $linked
            ->map(fn (array $row): string => $this->linkedContractLabel($row))
            ->filter()
            ->values();
        $linkedResidential = $linked
            ->where('contractType', 'residential_lease')
            ->values();
        $linkedResidentialLabels = $linkedResidential
            ->map(fn (array $row): string => $this->linkedContractLabel($row))
            ->filter()
            ->values();

        $scope = $mainNumber !== '' ? 'Hauptvertrag '.$mainNumber : 'Hauptvertrag';
        if ($linkedLabels->isNotEmpty()) {
            $scope .= ' · verknüpft: '.$linkedLabels->implode(', ');
        }

        data_set($context, 'contract.documentScope', $scope);
        data_set($context, 'contract.linkedContractIds', $linked->pluck('id')->filter()->values()->all());
        data_set($context, 'contract.linkedContractNumbers', $linkedNumbers->all());
        data_set($context, 'contract.linkedContractLabels', $linkedLabels->all());
        data_set($context, 'contract.linkedContractSummary', $linkedLabels->implode(', '));
        data_set($context, 'contract.linkedContractCount', $linked->count());
        data_set($context, 'contract.linkedResidentialContractCount', $linkedResidential->count());
        data_set($context, 'contract.linkedResidentialContractSummary', $linkedResidentialLabels->implode(', '));
        data_set(
            $context,
            'contract.linkedResidentialContractLabel',
            $linkedResidentialLabels->implode(', '),
        );
        data_set($context, 'linkedContractItems', $linked->all());

        $noticePeriodMonths = $contract?->notice_period_months;
        data_set($context, 'contract.noticePeriodMonths', $noticePeriodMonths);
        data_set($context, 'contract.noticePeriodLabel', $this->noticePeriodLabel($noticePeriodMonths));

        // Document signatures are operational actions. For the housing-provider
        // confirmation, the visible representative therefore follows the user
        // who actually creates the document instead of a mutable template input.
        // Sample previews without an authenticated session retain a meaningful
        // organization fallback.
        $userDisplayName = trim((string) (auth()->user()?->name ?? ''));
        if ($userDisplayName === '') {
            $userDisplayName = trim((string) data_get($context, 'organization.representedBy', ''));
        }
        data_set($context, 'session.userDisplayName', $userDisplayName);

        return $context;
    }

    /** @param array<string, string> $row */
    private function linkedContractLabel(array $row): string
    {
        $number = $row['contractNumber'];
        $type = $row['contractTypeLabel'];
        if ($number === '') return $type;

        return $type !== '' ? $number.' ('.$type.')' : $number;
    }

    private function noticePeriodLabel(?int $months): string
    {
        return match (true) {
            $months === null => 'Gesetzliche Frist',
            $months === 0 => 'Zum Monatsende',
            $months === 1 => '1 Monat zum Monatsende',
            default => $months.' Monate zum Monatsende',
        };
    }

    private function contractTypeLabel(string $type): string
    {
        return match ($type) {
            'residential_lease' => 'Wohnraummietvertrag',
            'mixed_lease' => 'Gemischter Mietvertrag',
            'commercial_lease' => 'Gewerbemietvertrag',
            'garage_lease' => 'Garagenvertrag',
            'parking_lease' => 'Stellplatzvertrag',
            default => $type,
        };
    }
}
