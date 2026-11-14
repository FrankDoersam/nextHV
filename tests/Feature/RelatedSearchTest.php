<?php

namespace Tests\Feature;

use App\Models\BusinessPartner;
use App\Models\Contract;
use App\Models\Property;
use App\Models\Unit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RelatedSearchTest extends TestCase
{
    use RefreshDatabase;

    public function test_participation_search_matches_contract_numbers_and_keeps_the_partner_scope(): void
    {
        $this->actingAs(User::factory()->create());
        $partner = BusinessPartner::create(['code' => 'GP1', 'display_name' => 'Beispiel Mieter', 'kind' => 'person']);
        $other = BusinessPartner::create(['code' => 'GP2', 'display_name' => 'Anderer Kontakt', 'kind' => 'person']);
        $contract = Contract::create(['code' => 'MV-SUCH-101', 'unit_id' => Unit::factory()->create()->id, 'starts_on' => '2026-01-01']);
        $party = $contract->parties()->create(['business_partner_id' => $partner->id, 'role' => 'tenant']);
        $contract->parties()->create(['business_partner_id' => $other->id, 'role' => 'owner']);
        $scope = [['field' => 'business_partner_id', 'value' => $partner->id]];

        foreach (['MV-SUCH', 'MV-SUCH-101 tenant', 'Beispiel'] as $term) {
            $this->postJson('/api/v1/contract-parties/search', ['search' => ['text' => ['value' => $term], 'filters' => $scope]])
                ->assertOk()->assertJsonPath('total', 1)->assertJsonPath('data.0.id', $party->id);
        }
        $this->postJson('/api/v1/contract-parties/search', ['search' => ['text' => ['value' => 'MV-SUCH-10_'], 'filters' => $scope]])
            ->assertOk()->assertJsonPath('total', 0);
        $this->assertDatabaseCount('contract_parties', 2);
    }

    public function test_units_can_sort_by_related_property_name_in_both_directions(): void
    {
        $this->actingAs(User::factory()->create());

        $alpha = Property::factory()->create(['name' => 'Alpha Objekt']);
        $zeta = Property::factory()->create(['name' => 'Zeta Objekt']);
        $alphaUnit = Unit::factory()->create(['property_id' => $alpha->id, 'name' => 'Gleiche Einheit']);
        $zetaUnit = Unit::factory()->create(['property_id' => $zeta->id, 'name' => 'Gleiche Einheit']);

        foreach ([
            ['asc', [$alphaUnit->id, $zetaUnit->id]],
            ['desc', [$zetaUnit->id, $alphaUnit->id]],
        ] as [$direction, $expectedIds]) {
            $response = $this->postJson('/api/v1/units/search', [
                'search' => [
                    'sorts' => [['field' => 'property.name', 'direction' => $direction]],
                    'includes' => [['relation' => 'property']],
                ],
            ]);

            $response->assertOk()->assertJsonPath('total', 2);
            $this->assertSame($expectedIds, array_column($response->json('data'), 'id'));
        }
    }

    public function test_unit_picker_can_search_property_names_and_loads_context_in_one_include(): void
    {
        $this->actingAs(User::factory()->create());
        $property = Property::factory()->create(['name' => 'Eindeutiger Lindenhof', 'city' => 'Berlin']);
        $unit = Unit::factory()->create(['name' => 'Wohnung 01', 'property_id' => $property->id]);
        Unit::factory()->create(['name' => 'Wohnung 01']);
        $this->postJson('/api/v1/units/search', ['search' => ['text' => ['value' => 'Wohnung Lindenhof'], 'includes' => [['relation' => 'property']]]])
            ->assertOk()->assertJsonPath('total', 1)->assertJsonPath('data.0.id', $unit->id)->assertJsonPath('data.0.property.name', 'Eindeutiger Lindenhof');
        $this->getJson('/api/v1/units?with=fields.capabilities,fields.filter,fields.rules,fields.meta,relations')
            ->assertOk()->assertJsonPath('data.meta.ui.picker.secondaryFields', ['property.name', 'property.city', 'code'])
            ->assertJsonPath('data.meta.ui.picker.includes.0.relation', 'property');
    }
}
