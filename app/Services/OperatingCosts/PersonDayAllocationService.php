<?php

namespace App\Services\OperatingCosts;

use App\Models\Contract;
use App\Models\ContractParty;
use App\Models\Unit;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

final class PersonDayAllocationService
{
    public function forProperty(string $propertyId, Carbon|string $from, Carbon|string $until): array
    {
        $from = Carbon::parse($from)->startOfDay();
        $until = Carbon::parse($until)->startOfDay();
        $intervals = $this->contractsForProperty($propertyId, $from, $until)
            ->flatMap(fn (Contract $contract) => $this->residentParties($contract)
                ->map(fn (ContractParty $party) => $this->partyInterval($contract, $party, $from, $until)))
            ->filter()->values();
        $splitPoints = $intervals
            ->flatMap(fn (array $interval) => [$interval['start']->copy(), $interval['end']->copy()->addDay()])
            ->push($from->copy())->push($until->copy()->addDay())
            ->unique(fn (Carbon $date): string => $date->toDateString())
            ->filter(fn (Carbon $date): bool => $date->betweenIncluded($from, $until->copy()->addDay()))
            ->sortBy(fn (Carbon $date): int => $date->timestamp)->values();

        $details = [];
        $contractPeriods = [];
        for ($index = 0; $index < $splitPoints->count() - 1; $index++) {
            $start = $splitPoints[$index]->copy();
            $end = $splitPoints[$index + 1]->copy()->subDay();
            if ($start->gt($end)) continue;
            $active = $intervals->filter(fn (array $interval): bool => $interval['start']->lte($end) && $interval['end']->gte($start));
            if ($active->isEmpty()) continue;
            $days = $start->diffInDays($end) + 1;
            $persons = $active->count();
            $contracts = $active->groupBy('contractId')->map(function (Collection $rows) use ($start, $end, $days, &$contractPeriods): array {
                $first = $rows->first();
                $persons = $rows->count();
                $row = [
                    'from' => $start->toDateString(),
                    'until' => $end->toDateString(),
                    'contractId' => (string) $first['contractId'],
                    'contractNumber' => (string) $first['contractNumber'],
                    'unitId' => (string) $first['unitId'],
                    'unit' => (string) $first['unit'],
                    'persons' => $persons,
                    'days' => $days,
                    'personDays' => $days * $persons,
                ];
                $contractPeriods[] = $row;

                return [
                    'contractId' => $row['contractId'],
                    'contractNumber' => $row['contractNumber'],
                    'unitId' => $row['unitId'],
                    'unit' => $row['unit'],
                    'persons' => $persons,
                    'personDays' => $row['personDays'],
                ];
            })->values()->all();

            $details[] = [
                'from' => $start->toDateString(),
                'until' => $end->toDateString(),
                'persons' => $persons,
                'days' => $days,
                'personDays' => $days * $persons,
                'scope' => 'residential_units_only',
                'contracts' => $contracts,
            ];
        }

        return [
            'label' => 'Personentage',
            'scope' => 'residential_units_only',
            'total' => (int) collect($details)->sum('personDays'),
            'details' => $details,
            // The PDF needs the property-wide timeline, not one duplicate row per contract.
            // Details are already split at every occupancy boundary and contain the summed person count.
            'contractPeriods' => $details,
        ];
    }

    public function forContract(Contract $contract, Carbon|string $from, Carbon|string $until): int
    {
        $from = Carbon::parse($from)->startOfDay();
        $until = Carbon::parse($until)->startOfDay();
        $contract->loadMissing(['parties.businessPartner', 'terminations', 'mainUnit.property', 'units.unit.property']);
        if (! $this->isResidentialUnit($contract->effectiveMainUnit())) {
            return 0;
        }

        return (int) $this->residentParties($contract)->sum(function (ContractParty $party) use ($contract, $from, $until): int {
            $interval = $this->partyInterval($contract, $party, $from, $until);

            return $interval ? $interval['start']->diffInDays($interval['end']) + 1 : 0;
        });
    }

    public function eventShare(Contract $contract, Carbon|string $date): array
    {
        $date = Carbon::parse($date)->startOfDay();
        $propertyId = $contract->effectiveMainUnit()?->property_id;
        if (! $propertyId || ! $this->isResidentialUnit($contract->effectiveMainUnit())) {
            return ['share' => 0.0, 'ownPersons' => 0, 'totalPersons' => 0, 'contracts' => 0, 'scope' => 'residential_units_only'];
        }
        $active = $this->contractsForProperty((string) $propertyId, $date, $date)
            ->flatMap(fn (Contract $candidate) => $this->residentParties($candidate)
                ->filter(fn (ContractParty $party): bool => $this->partyInterval($candidate, $party, $date, $date) !== null)
                ->map(fn (ContractParty $party): array => ['contractId' => (string) $candidate->id, 'partnerId' => (string) $party->business_partner_id]));
        $own = $active->where('contractId', (string) $contract->id)->count();
        $total = $active->count();

        return [
            'share' => $total > 0 ? $own / $total : 0.0,
            'ownPersons' => $own,
            'totalPersons' => $total,
            'contracts' => $active->pluck('contractId')->unique()->count(),
            'scope' => 'residential_units_only',
        ];
    }

    public function activeContracts(string $propertyId, Carbon|string $from, Carbon|string $until): Collection
    {
        $from = Carbon::parse($from)->startOfDay();
        $until = Carbon::parse($until)->startOfDay();

        return $this->contractsForProperty($propertyId, $from, $until)
            ->filter(fn (Contract $contract): bool => $this->forContract($contract, $from, $until) > 0)->values();
    }

    private function contractsForProperty(string $propertyId, Carbon $from, Carbon $until): Collection
    {
        return Contract::query()
            ->whereDate('starts_on', '<=', $until)
            ->whereNotIn('status', ['cancelled', 'archived'])
            ->where(function (Builder $query) use ($propertyId): void {
                $query->whereHas('mainUnit', fn (Builder $unit) => $unit->where('property_id', $propertyId)->where('operating_cost_billable', true))
                    ->orWhereHas('units.unit', fn (Builder $unit) => $unit->where('property_id', $propertyId)->where('operating_cost_billable', true));
            })
            ->with(['parties.businessPartner', 'terminations', 'mainUnit.property', 'units.unit.property'])
            ->get()->filter(function (Contract $contract) use ($from): bool {
                $unit = $contract->effectiveMainUnit();
                if (! $this->isResidentialUnit($unit)) return false;
                $end = $this->contractEnd($contract);

                return ! $end || $end->gte($from);
            })->values();
    }

    private function residentParties(Contract $contract): Collection
    {
        return $contract->parties
            ->filter(fn (ContractParty $party): bool => in_array($party->party_role, ContractParty::TENANT_ROLES, true) && $party->business_partner_id)
            ->unique(fn (ContractParty $party): string => (string) $party->business_partner_id)->values();
    }

    private function partyInterval(Contract $contract, ContractParty $party, Carbon $from, Carbon $until): ?array
    {
        $contractStart = Carbon::parse($contract->starts_on)->startOfDay();
        $contractEnd = $this->contractEnd($contract) ?? $until->copy();
        $partyStart = $party->valid_from ? Carbon::parse($party->valid_from)->startOfDay() : $contractStart->copy();
        $partyEnd = $party->valid_until ? Carbon::parse($party->valid_until)->startOfDay() : $contractEnd->copy();
        $start = collect([$from, $contractStart, $partyStart])->sortByDesc(fn (Carbon $date): int => $date->timestamp)->first()->copy();
        $end = collect([$until, $contractEnd, $partyEnd])->sortBy(fn (Carbon $date): int => $date->timestamp)->first()->copy();
        if ($start->gt($end)) return null;
        $unit = $contract->effectiveMainUnit();

        return [
            'start' => $start,
            'end' => $end,
            'contractId' => (string) $contract->id,
            'contractNumber' => (string) $contract->contract_number,
            'unitId' => (string) $unit?->id,
            'unit' => collect([$unit?->unit_number, $unit?->name])->filter()->join(' · '),
        ];
    }

    private function contractEnd(Contract $contract): ?Carbon
    {
        $value = $contract->confirmed_end_on ?? ($contract->term_type === 'fixed' ? $contract->fixed_until : null);

        return $value ? Carbon::parse($value)->startOfDay() : null;
    }

    private function isResidentialUnit(?Unit $unit): bool
    {
        return (bool) $unit?->operating_cost_billable
            && in_array(mb_strtolower(trim((string) $unit?->unit_type)), ['apartment', 'residential', 'wohnung'], true);
    }
}
