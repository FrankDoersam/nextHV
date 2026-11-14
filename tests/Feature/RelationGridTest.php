<?php

namespace Tests\Feature;

use App\Models\Contract;
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
}
