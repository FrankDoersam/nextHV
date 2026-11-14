<?php

namespace Tests\Feature;

use App\Models\Contract;
use App\Models\Property;
use App\Models\Unit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RelationGridTest extends TestCase
{
    use RefreshDatabase;

    public function test_contract_search_filters_related_unit_name_on_the_server(): void
    {
        $this->actingAs(User::factory()->create());
        $matching = Contract::create(['code' => 'MATCH-01', 'starts_on' => '2026-01-01', 'unit_id' => Unit::factory()->create(['name' => 'Wohnung 01'])->id]);
        Contract::create(['code' => 'OTHER-01', 'starts_on' => '2026-01-01', 'unit_id' => Unit::factory()->create(['name' => 'Garage 01'])->id]);
        $this->postJson('/api/v1/contracts/search', ['search' => ['filters' => [['field' => 'unit.name', 'operator' => '=', 'value' => 'Wohnung 01']]]])
            ->assertOk()->assertJsonPath('total', 1)->assertJsonPath('data.0.id', $matching->id);
        $this->postJson('/api/v1/contracts/search', ['search' => ['filters' => [['field' => 'unit.name', 'operator' => '!=', 'value' => 'Wohnung 01']]]])
            ->assertOk()->assertJsonPath('total', 1)->assertJsonMissing(['id' => $matching->id, 'code' => $matching->code]);
    }

    public function test_relation_filters_reject_unregistered_paths_and_disallowed_operators(): void
    {
        $this->actingAs(User::factory()->create());
        $this->postJson('/api/v1/contracts/search', ['search' => ['filters' => [['field' => 'unit.private_column', 'value' => 'secret']]]])
            ->assertUnprocessable()->assertJsonValidationErrors('search.filters.0.field');
        $this->postJson('/api/v1/contracts/search', ['search' => ['filters' => [['field' => 'unit.name', 'operator' => '>', 'value' => 'A']]]])
            ->assertUnprocessable()->assertJsonValidationErrors('search.filters.0.operator');
    }
    public function test_unit_search_sorts_by_related_property_name_on_the_server(): void
    {
        $this->actingAs(User::factory()->create());
        $birkenhof = Property::factory()->create(['name' => 'Birkenhof']);
        $zedernhof = Property::factory()->create(['name' => 'Zedernhof']);
        $zedernUnit = Unit::factory()->create(['property_id' => $zedernhof->id, 'name' => 'Wohnung Z']);
        $birkenUnit = Unit::factory()->create(['property_id' => $birkenhof->id, 'name' => 'Wohnung B']);

        $this->postJson('/api/v1/units/search', [
            'search' => ['sorts' => [['field' => 'property.name', 'direction' => 'asc']]],
        ])->assertOk()
            ->assertJsonPath('total', 2)
            ->assertJsonPath('data.0.id', $birkenUnit->id)
            ->assertJsonPath('data.1.id', $zedernUnit->id);

        $this->postJson('/api/v1/units/search', [
            'search' => ['sorts' => [['field' => 'property.name', 'direction' => 'desc']]],
        ])->assertOk()
            ->assertJsonPath('total', 2)
            ->assertJsonPath('data.0.id', $zedernUnit->id)
            ->assertJsonPath('data.1.id', $birkenUnit->id);
    }

    public function test_unit_search_rejects_unregistered_related_sort_fields(): void
    {
        $this->actingAs(User::factory()->create());

        $this->postJson('/api/v1/units/search', [
            'search' => ['sorts' => [['field' => 'property.secret', 'direction' => 'asc']]],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('search.sorts.0.field');
    }

}
