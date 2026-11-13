<?php

namespace App\Domain\Property\Actions;

use App\Models\Contract;
use App\Models\RentCondition;
use App\Models\Unit;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;

final class CalculateOverview
{
    public function handle(Builder $properties): array
    {
        $ids = (clone $properties)->select('properties.id')->reorder();
        $units = Unit::whereIn('property_id', $ids);
        $today = today()->toDateString();
        $contracts = Contract::whereIn('unit_id', (clone $units)->select('id'))->whereIn('status', ['active', 'ended'])->whereDate('starts_on', '<=', $today)->where(fn ($q) => $q->whereNull('ends_on')->orWhereDate('ends_on', '>=', $today));
        $conditions = RentCondition::whereIn('contract_id', (clone $contracts)->select('id'))->whereDate('effective_from', '<=', $today)->whereRaw('effective_from = (SELECT MAX(rc.effective_from) FROM rent_conditions rc WHERE rc.contract_id = rent_conditions.contract_id AND rc.effective_from <= ?)', [$today]);
        $sums = (clone $conditions)->selectRaw('SUM(base_rent) as rent, SUM(service_charge + heating_cost) as charges, SUM((base_rent+service_charge+heating_cost)*vat_rate/100) as vat')->first();
        $count = (clone $units)->count();
        $rented = (clone $contracts)->distinct()->count('unit_id');
        $starts = (clone $contracts)->pluck('starts_on');
        $monthly = round((float) $sums->rent, 2);

        return [
            'properties' => (clone $properties)->count(),
            'units' => $count,
            'rented' => $rented,
            'vacant' => $count - $rented,
            'maintenance' => (clone $units)->where('status', 'maintenance')->count(),
            'occupancy' => $count ? round($rented / $count * 100, 1) : 0,
            'monthly_rent' => $monthly,
            'annual_rent' => round($monthly * 12, 2),
            'monthly_charges' => round((float) $sums->charges, 2),
            'monthly_vat' => round((float) $sums->vat, 2),
            'area' => round((float) (clone $units)->sum('area'), 2),
            'average_tenancy_months' => $starts->isEmpty() ? null : round($starts->avg(fn ($d) => Carbon::parse($d)->diffInMonths(now())), 1),
            'inspections_this_year' => (clone $properties)->whereYear('next_inspection_on', now()->year)->count(),
            'overdue_inspections' => (clone $properties)->whereDate('next_inspection_on', '<', $today)->count(),
        ];
    }
}
