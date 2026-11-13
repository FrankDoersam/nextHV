<?php

namespace Tests\Feature;

use App\Domain\Property\Actions\CheckPropertyDeletion;
use App\Models\BusinessPartner;
use App\Models\Contract;
use App\Models\Property;
use App\Models\RentCondition;
use App\Models\Unit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class FrameworkOperationsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAs(User::factory()->create());
    }

    public function test_mutation_projects_the_updated_row_with_relations_counts_and_computed_values(): void
    {
        $property = Property::factory()->create(['street' => 'Parkstraße', 'house_number' => '5', 'postal_code' => '10115', 'city' => 'Berlin']);
        Unit::factory()->create(['property_id' => $property->id]);

        $this->postJson('/api/v1/properties/mutate', [
            'mutate' => [['operation' => 'update', 'key' => $property->id, 'version' => $property->updated_at->toISOString(), 'attributes' => ['name' => 'Neuer Name']]],
            'response' => ['includes' => [['relation' => 'units']], 'aggregates' => [['relation' => 'units', 'type' => 'count']]],
        ])->assertOk()->assertJsonPath('records.0.name', 'Neuer Name')->assertJsonPath('records.0.full_address', 'Parkstraße 5, 10115 Berlin')->assertJsonPath('records.0.units_count', 1)->assertJsonCount(1, 'records.0.units');
        $this->assertDatabaseHas('properties', ['id' => $property->id, 'name' => 'Neuer Name']);
    }

    public function test_preflight_reports_every_blocker_with_one_projection_query(): void
    {
        $active = Property::factory()->create();
        $archived = Property::factory()->create();
        Unit::factory()->create(['property_id' => $archived->id])->delete();
        $archived->update(['status' => 'archived']);
        $empty = Property::factory()->create(['status' => 'archived']);
        $models = Property::all();
        DB::enableQueryLog();
        $result = app(CheckPropertyDeletion::class)->handle($models);
        $queries = DB::getQueryLog();
        DB::disableQueryLog();
        $this->assertCount(1, $queries);
        $this->assertFalse($result[0]['allowed']);
        $this->assertFalse($result[1]['allowed']);
        $this->assertTrue($result[2]['allowed']);
        $this->postJson('/api/v1/properties/deletion-check', ['resources' => [$active->id, $archived->id, $empty->id]])->assertOk()->assertJsonCount(3, 'data');
        $this->deleteJson('/api/v1/properties', ['resources' => [$active->id, $empty->id]])->assertUnprocessable();
        $this->assertNotSoftDeleted($active);
        $this->assertNotSoftDeleted($empty);
    }

    public function test_confirmation_rechecks_status_before_delete(): void
    {
        $property = Property::factory()->create(['status' => 'archived']);
        $body = ['resources' => [$property->id]];
        $token = $this->deleteJson('/api/v1/properties', $body)->assertStatus(428)->json('confirmation.token');
        $property->update(['status' => 'active']);
        $this->deleteJson('/api/v1/properties', [...$body, 'confirmation' => $token])->assertUnprocessable();
        $this->assertNotSoftDeleted($property);
    }

    public function test_clone_defaults_are_owned_by_the_backend_and_optional_in_the_action(): void
    {
        $property = Property::factory()->create();
        $defaults = $this->getJson('/api/v1/properties/'.$property->id.'/clone-defaults')->assertOk()->json('data');
        $this->assertSame($property->name.' · Kopie', $defaults['name']);
        $this->assertNotSame($property->code, $defaults['code']);
        $result = $this->postJson('/api/v1/properties/actions/clone', ['resources' => [$property->id], 'fields' => []])->assertOk();
        $clone = Property::findOrFail($result->json('data.result.data.ids.0'));
        $this->assertSame($defaults['name'], $clone->name);
        $this->assertSame('active', $clone->status->value);
        $unit = Unit::factory()->create();
        $this->getJson('/api/v1/units/'.$unit->id.'/clone-defaults')->assertOk()->assertJsonPath('data.name', $unit->name.' · Kopie');
    }

    public function test_composite_and_calculated_fields_are_api_values_and_read_only(): void
    {
        $property = Property::factory()->create(['street' => 'Parkstraße', 'house_number' => '5', 'postal_code' => '10115', 'city' => 'Berlin']);
        $this->postJson('/api/v1/properties/search', [])->assertOk()->assertJsonPath('data.0.full_address', 'Parkstraße 5, 10115 Berlin');
        $partner = BusinessPartner::create(['code' => 'P1', 'display_name' => 'Kontakt', 'kind' => 'person', 'first_name' => 'Anna', 'last_name' => 'Müller']);
        $this->postJson('/api/v1/business-partners/search', [])->assertOk()->assertJsonPath('data.0.full_name', 'Anna Müller');
        $contract = Contract::create(['code' => 'C1', 'unit_id' => Unit::factory()->create()->id, 'starts_on' => '2026-01-01']);
        $condition = RentCondition::create(['contract_id' => $contract->id, 'effective_from' => '2026-01-01', 'base_rent' => 100.25, 'service_charge' => 20.5, 'heating_cost' => 10, 'vat_rate' => 19]);
        $this->postJson('/api/v1/rent-conditions/search', [])->assertOk()->assertJsonPath('data.0.monthly_total', 155.59);
        $this->postJson('/api/v1/properties/mutate', ['mutate' => [['operation' => 'update', 'key' => $property->id, 'version' => $property->updated_at->toISOString(), 'attributes' => ['full_address' => 'forged']]]])->assertUnprocessable();
    }

    public function test_custom_action_and_unicode_pdf_are_scoped_to_authenticated_user(): void
    {
        $property = Property::factory()->create(['name' => 'Müllerhöfe']);
        $this->postJson('/api/v1/properties/actions/inspect', ['resources' => [$property->id]])->assertOk()->assertJsonPath('data.result.data.ui.type', 'details');
        $url = $this->postJson('/api/v1/properties/actions/report', ['resources' => [$property->id]])->assertOk()->json('data.result.data.ui.url');
        $response = $this->get($url)->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF-', $response->getContent());
        $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
        $this->actingAs(User::factory()->create())->get($url)->assertForbidden();
        $this->get(str_replace('signature=', 'signature=x', $url))->assertForbidden();
    }

    public function test_contract_workspace_selects_the_latest_effective_condition_and_supports_faceted_search(): void
    {
        $unit = Unit::factory()->create();
        $contract = Contract::create(['code' => 'WORKSPACE-1', 'unit_id' => $unit->id, 'starts_on' => '2025-01-01']);
        RentCondition::create(['contract_id' => $contract->id, 'effective_from' => '2025-01-01', 'base_rent' => 700]);
        $current = RentCondition::create(['contract_id' => $contract->id, 'effective_from' => '2026-01-01', 'base_rent' => 800, 'service_charge' => 100]);
        RentCondition::create(['contract_id' => $contract->id, 'effective_from' => '2027-01-01', 'base_rent' => 990]);
        $other = Contract::create(['code' => 'WORKSPACE-2', 'unit_id' => $unit->id, 'starts_on' => '2025-01-01']);
        RentCondition::create(['contract_id' => $other->id, 'effective_from' => '2026-10-01', 'base_rent' => 5000]);

        $this->postJson('/api/v1/rent-conditions/search', ['search' => [
            'limit' => 10,
            'filters' => [['field' => 'contract_id', 'value' => $contract->id], ['field' => 'effective_from', 'operator' => '<=', 'value' => '2026-11-13']],
            'sorts' => [['field' => 'effective_from', 'direction' => 'desc']],
        ]])->assertOk()->assertJsonPath('total', 2)->assertJsonPath('data.0.id', $current->id)->assertJsonPath('data.0.monthly_total', 900);

        $this->postJson('/api/v1/contracts/search', ['search' => [
            'filters' => [['field' => 'status', 'operator' => 'in', 'value' => ['draft', 'active']]],
        ]])->assertOk()->assertJsonPath('total', 2);
    }
}
