<?php

namespace Tests\Feature;

use App\Models\Contract;
use App\Models\Property;
use App\Models\Unit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CollectionSummaryTest extends TestCase
{
    use RefreshDatabase;

    public function test_contract_rollups_apply_search_and_relation_filters_to_the_whole_result(): void
    {
        $this->actingAs(User::factory()->create());
        $unit = Unit::factory()->create(['name' => 'Rollup Wohnung']);
        for ($i = 1; $i <= 12; $i++) {
            Contract::create(['code' => 'ROLL-'.$i, 'starts_on' => '2026-01-01', 'unit_id' => $unit->id, 'deposit' => 100]);
        }
        Contract::create(['code' => 'OTHER', 'starts_on' => '2026-01-01', 'unit_id' => $unit->id, 'deposit' => 500]);
        Contract::create(['code' => 'ROLL-EXCLUDED', 'starts_on' => '2026-01-01', 'unit_id' => Unit::factory()->create(['name' => 'Garage'])->id, 'deposit' => 900]);

        $this->postJson('/api/v1/contracts/metrics/summary', ['search' => ['text' => ['value' => 'ROLL-'], 'filters' => [['field' => 'unit.name', 'value' => 'Rollup Wohnung']]]])
            ->assertOk()->assertJsonPath('data.total', 12)->assertJsonPath('data.draft', 12)->assertJsonPath('data.active', 0)->assertJsonPath('data.deposits', 1200.0);
    }

    public function test_property_rollups_scope_related_units_and_return_zero_for_no_matches(): void
    {
        $this->actingAs(User::factory()->create());
        $property = Property::factory()->create(['land_area' => 300, 'status' => 'active']);
        Unit::factory()->count(3)->create(['property_id' => $property->id]);
        Unit::factory()->create();

        $this->postJson('/api/v1/properties/metrics/summary', ['search' => ['filters' => [['field' => 'id', 'value' => $property->id]]]])
            ->assertOk()->assertJsonPath('data.total', 1)->assertJsonPath('data.active', 1)->assertJsonPath('data.units', 3)->assertJsonPath('data.area', 300.0);
        $this->postJson('/api/v1/properties/metrics/summary', ['search' => ['filters' => [['field' => 'id', 'value' => 999999]]]])
            ->assertOk()->assertJsonPath('data.total', 0)->assertJsonPath('data.units', 0)->assertJsonPath('data.area', 0.0);
    }

    public function test_rollups_require_authentication_and_reject_unregistered_filter_fields(): void
    {
        $this->postJson('/api/v1/contracts/metrics/summary', [])->assertUnauthorized();
        $this->actingAs(User::factory()->create());
        $this->postJson('/api/v1/contracts/metrics/summary', ['search' => ['filters' => [['field' => 'unit.secret', 'value' => 'x']]]])
            ->assertUnprocessable()->assertJsonValidationErrors('search.filters.0.field');
    }
}
