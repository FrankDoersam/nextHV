<?php

namespace App\Services\Properties\Reports;

use App\Models\Contract;
use App\Models\ContractCondition;
use App\Models\ContractParty;
use App\Models\Property;
use App\Models\Unit;
use Brick\Math\BigRational;
use Brick\Math\Exception\MathException;
use Brick\Math\RoundingMode;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

class PropertyRentStatementReportService
{

    private const COMPONENT_FIELDS = [
        'baseRentCents' => 'base_rent_amount',
        'garageCents' => 'garage_amount',
        'parkingCents' => 'parking_space_amount',
        'otherCents' => 'other_amount',
        'operatingCostsCents' => 'operating_cost_advance_amount',
        'heatingCostsCents' => 'heating_cost_advance_amount',
    ];

    /**
     * Contractual amounts for the service period, not open-item balances or cash receipts.
     * All monetary output is integer cents. Financial phases are independent of the name projection.
     *
     * @return array<string, mixed>
     */
    public function build(Property $property, CarbonImmutable $from, CarbonImmutable $to, bool $includeTenants = false): array
    {
        $from = $from->startOfDay();
        $to = $to->startOfDay();
        if ($to->lt($from)) {
            throw ValidationException::withMessages(['to' => 'Das Enddatum darf nicht vor dem Startdatum liegen.']);
        }
        if ($to->gt($from->addYearsNoOverflow(10)->subDay())) {
            throw ValidationException::withMessages(['to' => 'Der Berichtszeitraum darf höchstens zehn Jahre umfassen.']);
        }

        // Archived units and ended contracts remain relevant to a historical report.
        // Normal model scopes, including soft deletion, remain authoritative.
        $units = $property->units()->get(['id', 'property_id', 'unit_number', 'unit_type'])->keyBy('id');
        $contracts = $this->contractsForUnits($units->keys()->all(), $from, $to, $includeTenants);
        $warnings = [];
        $assignments = $this->assignmentsForReport($contracts, $units, $from, $to, $warnings);
        $unitRows = [];

        foreach ($units as $unit) {
            $number = (string) $unit->unit_number;
            $type = (string) $unit->unit_type;
            if (! in_array($type, Unit::TYPES, true)) {
                $this->warn($warnings, 'unknown_unit_type', $number, $from, $to, 'Der Einheitentyp ist nicht zugeordnet. Die Beträge stehen in einer gesonderten Typgruppe.');
            }

            $phases = [];
            foreach ($assignments[(string) $unit->id] ?? [] as $assignment) {
                array_push($phases, ...$this->contractPhases($assignment['contract'], $number, $assignment['from'], $assignment['to'], $includeTenants, $warnings));
            }
            usort($phases, static fn (array $left, array $right): int => [$left['from'], $left['to']] <=> [$right['from'], $right['to']]);

            $years = $this->emptyYears($from, $to);
            $totals = $this->emptyAmounts();
            foreach ($phases as $phase) {
                $totals = $this->addAmounts($totals, $phase['amounts']);
                $year = $phase['year'];
                $years[$year]['totals'] = $this->addAmounts($years[$year]['totals'], $phase['amounts']);
            }

            $unitRows[] = [
                'unitNumber' => $number,
                'unitType' => $type,
                'phases' => $phases,
                'years' => array_values($years),
                'totals' => $totals,
                'complete' => ! collect($warnings)->contains(fn (array $warning): bool => $warning['unitNumber'] === $number),
            ];
        }

        usort($unitRows, static function (array $left, array $right): int {
            $order = array_flip(Unit::TYPES);

            return (($order[$left['unitType']] ?? 99) <=> ($order[$right['unitType']] ?? 99))
                ?: strnatcasecmp($left['unitNumber'], $right['unitNumber']);
        });

        $groups = [];
        foreach (collect($unitRows)->groupBy('unitType') as $type => $rows) {
            $children = $rows->all();
            $groups[] = [
                'unitType' => (string) $type,
                'label' => $this->unitTypeLabel((string) $type),
                'units' => $children,
                'unitCount' => count($children),
                ...$this->rollUp($children, $from, $to),
            ];
        }

        return [
            'title' => 'Mietaufstellung',
            'property' => [
                'id' => (string) $property->id,
                'number' => (string) $property->property_number,
                'name' => (string) $property->name,
                'address' => (string) $property->full_address,
            ],
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'includeTenants' => $includeTenants,
            'generatedAt' => now()->toIso8601String(),
            'basis' => 'contractual_rent_schedule',
            'groups' => $groups,
            'unitCount' => count($unitRows),
            ...$this->rollUp($groups, $from, $to),
            'warnings' => array_values($warnings),
            'filename' => 'Mietaufstellung-'.preg_replace('/[^A-Za-z0-9_-]/', '-', (string) $property->property_number).'-'.$from->toDateString().'-'.$to->toDateString().'.pdf',
        ];
    }

    /** @return Collection<int, Contract> */
    private function contractsForUnits(array $unitIds, CarbonImmutable $from, CarbonImmutable $to, bool $includeTenants): Collection
    {
        if ($unitIds === []) {
            return collect();
        }

        $with = [
            'units:id,contract_id,unit_id,valid_from,valid_until',
            'terminations:id,contract_id,confirmed_end_on,created_at',
            'conditions' => fn ($query) => $query
                ->where(fn ($dates) => $dates->whereNull('valid_from')->orWhereDate('valid_from', '<=', $to->toDateString()))
                ->where(fn ($dates) => $dates->whereNull('valid_until')->orWhereDate('valid_until', '>=', $from->toDateString()))
                ->orderBy('valid_from')
                ->select(['id', 'contract_id', 'valid_from', 'valid_until', 'payment_interval', 'change_reason', ...array_values(self::COMPONENT_FIELDS)]),
        ];
        if ($includeTenants) {
            $with['tenantParties'] = fn ($query) => $query
                ->where(fn ($dates) => $dates->whereNull('valid_from')->orWhereDate('valid_from', '<=', $to->toDateString()))
                ->where(fn ($dates) => $dates->whereNull('valid_until')->orWhereDate('valid_until', '>=', $from->toDateString()))
                ->select(['id', 'contract_id', 'business_partner_id', 'party_role', 'valid_from', 'valid_until'])
                ->with('businessPartnerSummary:id,display_name');
        }

        return Contract::query()
            ->whereIn('status', ['active', 'ended', 'archived'])
            ->where(fn ($dates) => $dates->whereNull('starts_on')->orWhereDate('starts_on', '<=', $to->toDateString()))
            ->where(fn ($scope) => $scope
                ->whereIn('main_unit_id', $unitIds)
                ->orWhereHas('units', fn ($units) => $units->whereIn('unit_id', $unitIds)))
            ->with($with)
            ->get(['id', 'main_unit_id', 'status', 'term_type', 'starts_on', 'fixed_until']);
    }

    /**
     * Exactly one unit belongs to a contract. Legacy ancillary amount fields do not create units.
     *
     * @return array<string, array<int, array{contract: Contract, from: CarbonImmutable, to: CarbonImmutable}>>
     */
    private function assignmentsForReport(Collection $contracts, Collection $units, CarbonImmutable $from, CarbonImmutable $to, array &$warnings): array
    {
        $byUnit = [];
        foreach ($contracts as $contract) {
            $assignment = $contract->units->first();
            $unitId = (string) ($assignment?->unit_id ?? $contract->main_unit_id);
            $scopedAssignment = $contract->units->first(fn ($candidate): bool => $units->has((string) $candidate->unit_id));
            $unit = $units->get((string) $contract->main_unit_id) ?? $units->get((string) $scopedAssignment?->unit_id);
            if (! $unit) {
                continue;
            }
            $number = (string) $unit->unit_number;

            // Validate all assignments before an old first row can hide another current or cross-property row.
            if ($contract->units->count() > 1 || ($assignment && $contract->main_unit_id && (string) $contract->main_unit_id !== $unitId)) {
                throw ValidationException::withMessages(['assignments' => 'Einheit '.$number.': Die Vertragszuordnung ist nicht eindeutig. Bitte korrigieren Sie die Einheitenzuordnung vor der Berichtserstellung.']);
            }
            $end = $contract->confirmed_end_on;
            if (($end && $end->lt($from)) || ($assignment?->valid_until && $assignment->valid_until->lt($from))) {
                continue;
            }
            if (! $assignment) {
                $this->warn($warnings, 'missing_contract_assignment', $number, $from, $to, 'Für einen Vertrag fehlt die zeitliche Einheitenzuordnung. Seine Beträge sind nicht enthalten.');

                continue;
            }
            if (! $contract->starts_on || ! $assignment->valid_from) {
                $this->warn($warnings, 'missing_contract_dates', $number, $from, $to, 'Vertragsbeginn oder Beginn der Einheitenzuordnung fehlt. Die Beträge sind nicht enthalten.');

                continue;
            }

            if (in_array($contract->status, ['ended', 'archived'], true) && ! $end && ! $assignment->valid_until) {
                $this->warn($warnings, 'ended_contract_without_end', $number, $from, $to, 'Ein beendeter oder archivierter Vertrag hat kein dokumentiertes Ende. Seine Beträge sind nicht enthalten.');

                continue;
            }

            $start = CarbonImmutable::instance($contract->starts_on)->startOfDay()->max(CarbonImmutable::instance($assignment->valid_from)->startOfDay());
            $until = $end ? CarbonImmutable::instance($end)->startOfDay() : null;
            if ($assignment->valid_until) {
                $assignmentEnd = CarbonImmutable::instance($assignment->valid_until)->startOfDay();
                $until = $until ? $until->min($assignmentEnd) : $assignmentEnd;
            }
            if ($until && $until->lt($start)) {
                $this->warn($warnings, 'invalid_contract_dates', $number, $from, $to, 'Vertragslaufzeit und Einheitenzuordnung ergeben keinen gültigen Mietzeitraum. Die Beträge sind nicht enthalten.');

                continue;
            }
            $start = $start->max($from);
            $until = $until ? $until->min($to) : $to;
            if ($start->gt($until)) {
                continue;
            }
            $byUnit[$unitId][] = ['contract' => $contract, 'from' => $start, 'to' => $until];
        }

        foreach ($byUnit as $unitId => &$assignments) {
            usort($assignments, static fn (array $left, array $right): int => $left['from'] <=> $right['from']);
            $previousEnd = null;
            foreach ($assignments as $assignment) {
                if ($previousEnd && $assignment['from']->lte($previousEnd)) {
                    throw ValidationException::withMessages(['assignments' => 'Einheit '.$units->get($unitId)->unit_number.': Im Berichtszeitraum überschneiden sich wirksame Mietverträge. Bitte korrigieren Sie die Zuordnungen.']);
                }
                $previousEnd = $assignment['to'];
            }
        }
        unset($assignments);

        return $byUnit;
    }

    /** @return array<int, array<string, mixed>> */
    private function contractPhases(Contract $contract, string $unitNumber, CarbonImmutable $from, CarbonImmutable $to, bool $includeTenants, array &$warnings): array
    {
        $periods = [];
        foreach ($contract->conditions as $condition) {
            if (! $condition->valid_from || ($condition->valid_until && $condition->valid_until->lt($condition->valid_from))) {
                $this->warn($warnings, 'invalid_condition_dates', $unitNumber, $from, $to, 'Eine Kondition hat keinen gültigen Zeitraum. Ihre Beträge sind nicht enthalten.');

                continue;
            }
            $start = CarbonImmutable::instance($condition->valid_from)->startOfDay()->max($from);
            $end = $condition->valid_until ? CarbonImmutable::instance($condition->valid_until)->startOfDay()->min($to) : $to;
            if ($start->lte($end)) {
                $periods[] = ['condition' => $condition, 'from' => $start, 'to' => $end];
            }
        }
        usort($periods, static fn (array $left, array $right): int => $left['from'] <=> $right['from']);

        $phases = [];
        $cursor = $from;
        foreach ($periods as $period) {
            if ($period['from']->lt($cursor)) {
                throw ValidationException::withMessages(['conditions' => 'Einheit '.$unitNumber.': Im Berichtszeitraum überschneiden sich Vertragskonditionen. Bitte korrigieren Sie die Gültigkeiten.']);
            }
            if ($period['from']->gt($cursor)) {
                $this->warn($warnings, 'missing_condition', $unitNumber, $cursor, $period['from']->subDay(), 'Für diesen Mietzeitraum fehlt eine gültige Kondition. Die Summe ist unvollständig.');
            }
            $cursor = $period['to']->addDay();
            $condition = $period['condition'];
            $interval = (string) $condition->payment_interval;
            if ($interval !== 'one_time' && ! array_key_exists($interval, ContractCondition::RECURRING_INTERVAL_MONTHS)) {
                $this->warn($warnings, 'unsupported_payment_interval', $unitNumber, $period['from'], $period['to'], 'Das Zahlungsintervall einer Kondition ist nicht unterstützt. Ihre Beträge sind nicht enthalten.');

                continue;
            }
            $intervalAmounts = $this->intervalAmounts($condition);
            if ($intervalAmounts === null) {
                $this->warn($warnings, 'invalid_condition_amount', $unitNumber, $period['from'], $period['to'], 'Eine Kondition enthält ungültige oder negative Beträge. Ihre Beträge sind nicht enthalten.');

                continue;
            }

            if ($interval === 'one_time') {
                $due = CarbonImmutable::instance($condition->valid_from)->startOfDay();
                $contractStart = CarbonImmutable::instance($contract->starts_on)->startOfDay()
                    ->max(CarbonImmutable::instance($contract->units->first()->valid_from)->startOfDay());
                if ($due->lt($contractStart)) {
                    $this->warn($warnings, 'one_time_outside_contract', $unitNumber, $period['from'], $period['to'], 'Der Einmalbetrag beginnt vor der wirksamen Vertragszuordnung. Er ist nicht enthalten.');
                } elseif ($due->betweenIncluded($from, $to)) {
                    $phases[] = $this->phase($contract, $condition, $unitNumber, $due, $due, $intervalAmounts, $intervalAmounts, $includeTenants, $warnings);
                }

                continue;
            }

            // Keep the interval amount rational through all calendar-month fractions.
            // Round each component only once per condition/year section (e.g. 900.01 quarterly -> 3600.04 annually).
            $sectionFrom = $period['from'];
            while ($sectionFrom->lte($period['to'])) {
                $sectionTo = $sectionFrom->endOfYear()->startOfDay()->min($period['to']);
                $factor = $this->calendarMonthFraction($sectionFrom, $sectionTo)->dividedBy(ContractCondition::RECURRING_INTERVAL_MONTHS[$interval]);
                $components = [];
                foreach (self::COMPONENT_FIELDS as $key => $field) {
                    $components[$key] = $factor->multipliedBy($intervalAmounts[$key])->toScale(0, RoundingMode::HalfUp)->toInt();
                }
                $phases[] = $this->phase($contract, $condition, $unitNumber, $sectionFrom, $sectionTo, $intervalAmounts, $this->withDerivedAmounts($components), $includeTenants, $warnings);
                $sectionFrom = $sectionTo->addDay();
            }
        }
        if ($cursor->lte($to)) {
            $this->warn($warnings, 'missing_condition', $unitNumber, $cursor, $to, 'Für diesen Mietzeitraum fehlt eine gültige Kondition. Die Summe ist unvollständig.');
        }

        return $phases;
    }

    /** @return array<string, mixed> */
    private function phase(Contract $contract, ContractCondition $condition, string $unitNumber, CarbonImmutable $from, CarbonImmutable $to, array $intervalAmounts, array $amounts, bool $includeTenants, array &$warnings): array
    {
        $intervalLabels = array_column(ContractCondition::paymentIntervalOptions(), 'label', 'value');
        $reasonLabels = array_column(ContractCondition::changeReasonOptions(), 'label', 'value');
        $row = [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'year' => $from->year,
            'conditionFrom' => $condition->valid_from->toDateString(),
            'kind' => $condition->payment_interval === 'one_time' ? 'one_time' : 'recurring',
            'paymentInterval' => (string) $condition->payment_interval,
            'paymentIntervalLabel' => $intervalLabels[$condition->payment_interval] ?? 'Unbekannt',
            'changeReason' => (string) $condition->change_reason,
            'changeReasonLabel' => $reasonLabels[$condition->change_reason] ?? 'Nicht angegeben',
            'intervalAmounts' => $intervalAmounts,
            'amounts' => $amounts,
        ];

        if ($includeTenants) {
            $row['tenants'] = $this->tenantsForPhase($contract, $from, $to);
            if ($row['tenants'] === []) {
                $this->warn($warnings, 'missing_tenant_identity', $unitNumber, $from, $to, 'Für diesen Abschnitt ist keine benannte Mietpartei dokumentiert. Die vertraglichen Beträge bleiben enthalten.');
            }
        }

        return $row;
    }

    /** @return array<string, int>|null */
    private function intervalAmounts(ContractCondition $condition): ?array
    {
        $components = [];
        foreach (self::COMPONENT_FIELDS as $key => $field) {
            $raw = $condition->getRawOriginal($field) ?? '0';
            if (! is_numeric($raw)) {
                return null;
            }
            try {
                $amount = BigRational::of((string) $raw)->multipliedBy(100);
                if ($amount->isNegative()) {
                    return null;
                }
                $components[$key] = $amount->toScale(0, RoundingMode::HalfUp)->toInt();
            } catch (MathException) {
                return null;
            }
        }

        return $this->withDerivedAmounts($components);
    }

    private function calendarMonthFraction(CarbonImmutable $from, CarbonImmutable $to): BigRational
    {
        $fraction = BigRational::of(0);
        $month = $from->startOfMonth();
        while ($month->lte($to)) {
            $start = $month->max($from);
            $end = $month->endOfMonth()->startOfDay()->min($to);
            $days = (int) $start->diffInDays($end) + 1;
            $fraction = $fraction->plus(BigRational::ofFraction($days, $month->daysInMonth));
            $month = $month->addMonth();
        }

        return $fraction;
    }

    /** @return array<int, array{name: string, from: string, to: string}> */
    private function tenantsForPhase(Contract $contract, CarbonImmutable $from, CarbonImmutable $to): array
    {
        return $contract->tenantParties
            ->filter(fn (ContractParty $party): bool => (! $party->valid_from || $party->valid_from->lte($to)) && (! $party->valid_until || $party->valid_until->gte($from)))
            ->map(function (ContractParty $party) use ($from, $to): array {
                return [
                    'name' => trim((string) $party->businessPartnerSummary?->display_name),
                    'from' => ($party->valid_from ? CarbonImmutable::instance($party->valid_from)->startOfDay()->max($from) : $from)->toDateString(),
                    'to' => ($party->valid_until ? CarbonImmutable::instance($party->valid_until)->startOfDay()->min($to) : $to)->toDateString(),
                ];
            })
            ->filter(fn (array $party): bool => $party['name'] !== '')
            ->unique(fn (array $party): string => $party['name'].'|'.$party['from'].'|'.$party['to'])
            ->sortBy(fn (array $party): string => $party['from'].'|'.$party['name'])
            ->values()->all();
    }

    /** @return array{years: array, totals: array, complete: bool} */
    private function rollUp(array $children, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $years = $this->emptyYears($from, $to);
        $totals = $this->emptyAmounts();
        $complete = true;
        foreach ($children as $child) {
            $totals = $this->addAmounts($totals, $child['totals']);
            $complete = $complete && $child['complete'];
            foreach ($child['years'] as $year) {
                $key = $year['year'];
                $years[$key]['totals'] = $this->addAmounts($years[$key]['totals'], $year['totals']);
            }
        }

        return ['years' => array_values($years), 'totals' => $totals, 'complete' => $complete];
    }

    private function emptyYears(CarbonImmutable $from, CarbonImmutable $to): array
    {
        $years = [];
        $cursor = $from;
        while ($cursor->lte($to)) {
            $end = $cursor->endOfYear()->startOfDay()->min($to);
            $years[$cursor->year] = ['year' => $cursor->year, 'from' => $cursor->toDateString(), 'to' => $end->toDateString(), 'totals' => $this->emptyAmounts()];
            $cursor = $end->addDay();
        }

        return $years;
    }

    private function emptyAmounts(): array
    {
        return $this->withDerivedAmounts(array_fill_keys(array_keys(self::COMPONENT_FIELDS), 0));
    }

    private function addAmounts(array $left, array $right): array
    {
        $components = [];
        foreach (self::COMPONENT_FIELDS as $key => $field) {
            $components[$key] = $left[$key] + $right[$key];
        }

        return $this->withDerivedAmounts($components);
    }

    private function withDerivedAmounts(array $components): array
    {
        $components['coldRentCents'] = $components['baseRentCents'] + $components['garageCents'] + $components['parkingCents'] + $components['otherCents'];
        $components['serviceChargesCents'] = $components['operatingCostsCents'] + $components['heatingCostsCents'];
        $components['totalCents'] = $components['coldRentCents'] + $components['serviceChargesCents'];

        return $components;
    }

    private function warn(array &$warnings, string $code, string $unitNumber, CarbonImmutable $from, CarbonImmutable $to, string $message): void
    {
        $key = implode('|', [$code, $unitNumber, $from->toDateString(), $to->toDateString()]);
        $warnings[$key] = ['code' => $code, 'unitNumber' => $unitNumber, 'from' => $from->toDateString(), 'to' => $to->toDateString(), 'message' => $message];
    }

    private function unitTypeLabel(string $type): string
    {
        return match ($type) {
            'apartment' => 'Wohnung',
            'commercial' => 'Gewerbeeinheit',
            'garage' => 'Garage',
            'parking_space' => 'Stellplatz',
            'storage' => 'Lager',
            'cellar' => 'Keller',
            'technical' => 'Technische Einheit',
            'other' => 'Sonstige Einheit',
            default => 'Nicht zugeordneter Einheitentyp',
        };
    }
}
