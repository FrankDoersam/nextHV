<?php

namespace Tests\Feature;

use App\Domain\Property\Enums\UnitStatus;
use App\Models\Property;
use App\Models\Unit;
use App\Models\User;
use App\Rest\Resources\UnitResource;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Lomkit\Rest\Fields\Enum;
use Tests\TestCase;

class ResourceMetadataTest extends TestCase
{
    use RefreshDatabase;

    private const string DETAILS = '?with=fields.capabilities,fields.filter,fields.rules,fields.meta,relations';

    public function test_native_details_are_authenticated_and_supply_enum_choices_and_relation_pickers(): void
    {
        $this->getJson('/api/v1/units'.self::DETAILS)->assertUnauthorized();
        $this->actingAs(User::factory()->create());
        $response = $this->getJson('/api/v1/units'.self::DETAILS)->assertOk();
        $response->assertJsonPath('data.meta.ui.version', 1)
            ->assertJsonPath('data.meta.ui.fields.status.options.0.value', 'ready')
            ->assertJsonPath('data.meta.ui.fields.status.options.0.label', 'Nutzbar')
            ->assertJsonPath('data.meta.ui.relations.property_id.resource', 'properties')
            ->assertJsonPath('data.meta.ui.relations.property_id.relation', 'property')
            ->assertJsonPath('data.meta.ui.relations.property_id.labelField', 'name')
            ->assertJsonPath('data.meta.ui.relations.property_id.filters.0.value', 'active')
            ->assertJsonPath('data.meta.ui.relations.property_id.filterFilters', []);
        $status = collect($response->json('data.fields'))->firstWhere('name', 'status');
        $this->assertSame(['=', '!=', 'in', 'not in'], $status['filter']['operators']);
        $this->assertTrue($status['create']);
        $this->assertTrue($status['update']);
    }

    public function test_offered_enum_choices_are_distinct_from_readable_filter_choices(): void
    {
        $this->app->bind(UnitResource::class, fn () => new class extends UnitResource
        {
            public function fields(): array
            {
                return array_map(fn ($field) => $field instanceof Enum && $field->name === 'status' ? $field->offered([UnitStatus::Maintenance]) : $field, parent::fields());
            }
        });
        $this->actingAs(User::factory()->create());
        $this->getJson('/api/v1/units'.self::DETAILS)->assertOk()
            ->assertJsonCount(2, 'data.meta.ui.fields.status.options')
            ->assertJsonCount(1, 'data.meta.ui.fields.status.offeredOptions')
            ->assertJsonPath('data.meta.ui.fields.status.offeredOptions.0.value', 'maintenance')
            ->assertJsonPath('data.meta.ui.fields.status.default', 'maintenance');
    }

    public function test_native_in_rules_supply_choices_and_readonly_status_stays_readonly(): void
    {
        $this->actingAs(User::factory()->create());
        $response = $this->getJson('/api/v1/contracts'.self::DETAILS)->assertOk();
        $response->assertJsonPath('data.meta.ui.fields.type.options.0.label', 'Wohnraummiete')
            ->assertJsonPath('data.meta.ui.fields.deposit_status.options.0.value', 'outstanding')
            ->assertJsonPath('data.meta.ui.relations.unit_id.resource', 'units');
        $status = collect($response->json('data.fields'))->firstWhere('name', 'status');
        $this->assertFalse($status['create']);
        $this->assertFalse($status['update']);
    }

    public function test_all_registered_resources_expose_complete_native_details(): void
    {
        $this->actingAs(User::factory()->create());
        foreach (['properties', 'units', 'business-partners', 'contracts', 'termination-notices', 'rent-conditions', 'identity-documents', 'partner-roles', 'contract-parties', 'contract-links'] as $name) {
            $this->getJson('/api/v1/'.$name.self::DETAILS)->assertOk()
                ->assertJsonPath('data.meta.ui.version', 1)
                ->assertJsonStructure(['data' => ['fields' => [['name', 'type', 'nullable', 'create', 'update', 'sort', 'select', 'filter', 'rules']], 'meta' => ['ui' => ['fields', 'relations', 'labels']]]]);
        }
    }

    public function test_form_relation_metadata_is_independent_of_filter_capability(): void
    {
        $this->app->bind(UnitResource::class, fn () => new class extends UnitResource
        {
            public function fields(): array
            {
                return array_map(fn ($field) => $field->name === 'property_id' ? $field->filterable(false) : $field, parent::fields());
            }
        });
        $this->actingAs(User::factory()->create());
        $response = $this->getJson('/api/v1/units'.self::DETAILS)->assertOk();
        $response->assertJsonPath('data.meta.ui.relations.property_id.resource', 'properties');
        $this->assertSame([], collect($response->json('data.fields'))->firstWhere('name', 'property_id')['filter']['operators']);
    }

    public function test_relation_filter_uses_actual_foreign_keys_with_searchable_property_choices(): void
    {
        $this->actingAs(User::factory()->create());
        $property = Property::factory()->create(['name' => 'Suchbarer Hof']);
        $unit = Unit::factory()->create(['property_id' => $property->id]);
        Unit::factory()->create();
        $this->postJson('/api/v1/properties/search', ['search' => ['text' => ['value' => 'Suchbarer Hof']]])->assertOk()->assertJsonPath('total', 1)->assertJsonPath('data.0.id', $property->id);
        $this->postJson('/api/v1/units/search', ['search' => ['filters' => [['field' => 'property_id', 'operator' => 'in', 'value' => [$property->id]]]]])->assertOk()->assertJsonPath('total', 1)->assertJsonPath('data.0.id', $unit->id);
    }
}
