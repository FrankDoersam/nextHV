<?php

namespace Tests\Feature;

use App\Models\BusinessPartner;
use App\Models\Contract;
use App\Models\IdentityDocument;
use App\Models\Property;
use App\Models\RentCondition;
use App\Models\Unit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ColumnFiltersTest extends TestCase
{
    use RefreshDatabase;

    public function test_computed_address_and_unit_count_filter_search_and_kpis_consistently(): void
    {
        $this->actingAs(User::factory()->create());
        $property = Property::factory()->create(['street' => 'Parkweg', 'house_number' => '12', 'postal_code' => '10115', 'city' => 'Berlin']);
        Unit::factory()->count(3)->create(['property_id' => $property->id]);
        Property::factory()->create(['street' => 'Parkweg', 'house_number' => '12', 'postal_code' => '10115', 'city' => 'Berlin']);
        $search = ['filters' => [['field' => 'full_address', 'operator' => 'like', 'value' => '%Parkweg 12, 10115 Berlin%'], ['field' => 'unit_count', 'operator' => '>=', 'value' => 2]]];
        $this->postJson('/api/v1/properties/search', ['search' => [...$search, 'aggregates' => [['relation' => 'units', 'type' => 'count']]]])
            ->assertOk()->assertJsonPath('total', 1)->assertJsonPath('data.0.id', $property->id)->assertJsonPath('data.0.units_count', 3);
        $this->postJson('/api/v1/properties/metrics/summary', ['search' => $search])->assertOk()->assertJsonPath('data.total', 1)->assertJsonPath('data.units', 3);
    }

    public function test_composed_names_keep_person_company_and_fallback_semantics_and_bound_values(): void
    {
        $this->actingAs(User::factory()->create());
        $person = BusinessPartner::create(['code' => 'P1', 'kind' => 'person', 'display_name' => 'Kontakt', 'first_name' => "Anne O'Neil", 'last_name' => 'Müller']);
        $company = BusinessPartner::create(['code' => 'P2', 'kind' => 'company', 'display_name' => 'Fallback GmbH', 'company_name' => null]);
        foreach ([[$person, "Anne O'Neil Müller"], [$company, 'Fallback GmbH']] as [$record, $name]) {
            $this->postJson('/api/v1/business-partners/search', ['search' => ['filters' => [['field' => 'full_name', 'operator' => '=', 'value' => $name]]]])->assertOk()->assertJsonPath('total', 1)->assertJsonPath('data.0.id', $record->id);
        }
        $this->postJson('/api/v1/business-partners/search', ['search' => ['filters' => [['field' => 'full_name', 'operator' => 'like', 'value' => "%x' OR 1=1 --%"]]]])->assertOk()->assertJsonPath('total', 0);
    }

    public function test_numeric_ranges_and_computed_currency_filter_on_the_database(): void
    {
        $this->actingAs(User::factory()->create());
        $unit = Unit::factory()->create(['area' => 85]);
        Unit::factory()->create(['area' => 30]);
        $this->postJson('/api/v1/units/search', ['search' => ['filters' => [['field' => 'area', 'operator' => 'between', 'value' => [80, 90]]]]])->assertOk()->assertJsonPath('total', 1)->assertJsonPath('data.0.id', $unit->id);
        $contract = Contract::create(['code' => 'C1', 'unit_id' => $unit->id, 'starts_on' => '2026-01-01']);
        $condition = RentCondition::create(['contract_id' => $contract->id, 'effective_from' => '2026-01-01', 'base_rent' => 100, 'service_charge' => 20, 'heating_cost' => 10, 'vat_rate' => 19]);
        $this->postJson('/api/v1/rent-conditions/search', ['search' => ['filters' => [['field' => 'monthly_total', 'operator' => 'between', 'value' => [154.69, 154.71]]]]])->assertOk()->assertJsonPath('total', 1)->assertJsonPath('data.0.monthly_total', 154.7);
    }

    public function test_dates_relations_and_nulls_work_but_write_only_and_unknown_columns_are_rejected(): void
    {
        $this->actingAs(User::factory()->create());
        $partner = BusinessPartner::create(['code' => 'P1', 'kind' => 'person', 'display_name' => 'Demo Partner']);
        $document = IdentityDocument::create(['business_partner_id' => $partner->id, 'title' => 'Ausweis', 'type' => 'passport', 'expires_on' => '2027-06-01', 'verified_on' => null]);
        $this->postJson('/api/v1/identity-documents/search', ['search' => ['filters' => [['field' => 'expires_on', 'operator' => 'between', 'value' => ['2027-01-01', '2027-12-31']], ['field' => 'verified_on', 'operator' => 'is null'], ['field' => 'businessPartner.display_name', 'operator' => '=', 'value' => 'Demo Partner']]]])->assertOk()->assertJsonPath('total', 1)->assertJsonPath('data.0.id', $document->id);
        foreach (['document_number', 'storage_path', 'unknown'] as $field) {
            $this->postJson('/api/v1/identity-documents/search', ['search' => ['filters' => [['field' => $field, 'value' => 'x']]]])->assertUnprocessable()->assertJsonValidationErrors('search.filters.0.field');
        }
    }
}
