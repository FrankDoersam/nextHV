<?php

namespace Tests\Feature;

use App\Models\BusinessPartner;
use App\Models\Contract;
use App\Models\Property;
use App\Models\RentCondition;
use App\Models\Unit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
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

    public function test_delete_rolls_back_the_complete_batch_when_a_record_is_active(): void
    {
        $empty = Property::factory()->create(['status' => 'archived']);
        $active = Property::factory()->create();

        $this->deleteJson('/api/v1/properties', ['resources' => [$empty->id, $active->id]])
            ->assertUnprocessable()->assertJsonValidationErrors(['status'])
            ->assertJsonPath('errors.status.0', 'Das Objekt ist aktiv. Bitte zuerst archivieren.');

        $this->assertNotSoftDeleted($empty);
        $this->assertNotSoftDeleted($active);
    }

    public function test_delete_rejects_archived_properties_with_archived_units(): void
    {
        $property = Property::factory()->create();
        Unit::factory()->create(['property_id' => $property->id])->delete();
        $property->update(['status' => 'archived']);

        $this->deleteJson('/api/v1/properties', ['resources' => [$property->id]])
            ->assertUnprocessable()->assertJsonValidationErrors(['units'])
            ->assertJsonPath('errors.units.0', 'Es sind Einheiten zugeordnet, einschließlich archivierter Einheiten.');

        $this->assertNotSoftDeleted($property);
    }

    public function test_deletion_preflight_route_is_removed(): void
    {
        $this->postJson('/api/v1/properties/deletion-check', ['resources' => [1]])->assertNotFound();
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

    public function test_clone_maps_domain_errors_to_action_fields_and_does_not_create_a_duplicate(): void
    {
        $unit = Unit::factory()->create();

        $this->postJson('/api/v1/units/actions/clone', ['resources' => [$unit->id], 'fields' => [['name' => 'code', 'value' => $unit->code]]])
            ->assertUnprocessable()->assertJsonValidationErrors(['fields.code']);
        $this->assertDatabaseCount('units', 1);
    }

    public function test_unit_clone_uses_shared_response_and_domain_defaults(): void
    {
        $unit = Unit::factory()->create(['status' => 'maintenance']);

        $response = $this->postJson('/api/v1/units/actions/clone', ['resources' => [$unit->id], 'fields' => []])->assertOk();

        $clone = Unit::findOrFail($response->json('data.result.data.ids.0'));
        $this->assertNotSame($unit->code, $clone->code);
        $this->assertDatabaseHas('units', ['id' => $clone->id, 'property_id' => $unit->property_id, 'name' => $unit->name.' · Kopie', 'status' => 'ready']);
    }

    public function test_grid_exclusion_operator_is_applied_by_the_server(): void
    {
        Property::factory()->create(['status' => 'active']);
        $archived = Property::factory()->create(['status' => 'archived']);

        $this->postJson('/api/v1/properties/search', ['search' => ['filters' => [
            ['field' => 'status', 'operator' => 'not in', 'value' => ['active']],
        ]]])->assertOk()->assertJsonPath('total', 1)->assertJsonPath('data.0.id', $archived->id);
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
