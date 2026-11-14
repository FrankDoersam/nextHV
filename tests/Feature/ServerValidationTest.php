<?php

namespace Tests\Feature;

use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ServerValidationTest extends TestCase
{
    use RefreshDatabase;

    public function test_wizard_validates_only_its_fields_without_persisting_a_record(): void
    {
        $this->actingAs(User::factory()->create());
        $headers = ['Precognition' => 'true', 'Precognition-Validate-Only' => 'mutate.0.attributes.code,mutate.0.attributes.name'];
        $this->postJson('/api/v1/properties/mutate', ['mutate' => [['operation' => 'create', 'attributes' => ['code' => '', 'name' => '']]]], $headers)
            ->assertUnprocessable()->assertJsonValidationErrors(['mutate.0.attributes.code', 'mutate.0.attributes.name'])->assertJsonMissingValidationErrors(['mutate.0.attributes.street']);
        $this->postJson('/api/v1/properties/mutate', ['mutate' => [['operation' => 'create', 'attributes' => ['code' => 'WIZ-01', 'name' => 'Vorschau']]]], $headers)
            ->assertNoContent()->assertHeader('Precognition-Success', 'true');
        $this->assertDatabaseCount('properties', 0);
        $this->postJson('/api/v1/properties/mutate', ['mutate' => [['operation' => 'create', 'attributes' => ['code' => 'WIZ-01', 'name' => 'Vorschau']]]])
            ->assertUnprocessable()->assertJsonValidationErrors(['mutate.0.attributes.street']);
        $this->assertDatabaseCount('properties', 0);
    }

    public function test_validation_preview_requires_authentication(): void
    {
        $this->postJson('/api/v1/properties/mutate', ['mutate' => [['operation' => 'create', 'attributes' => []]]], ['Precognition' => 'true'])->assertUnauthorized();
    }

    public function test_update_preview_uses_contextual_unique_rule_and_never_changes_the_model(): void
    {
        $this->actingAs(User::factory()->create());
        $property = Property::factory()->create(['name' => 'Unverändert']);
        $this->postJson('/api/v1/properties/mutate', ['mutate' => [['operation' => 'update', 'key' => $property->id, 'version' => $property->updated_at->toISOString(), 'attributes' => ['code' => $property->code, 'name' => 'Vorschau']]]], ['Precognition' => 'true', 'Precognition-Validate-Only' => 'mutate.0.attributes.code,mutate.0.attributes.name'])
            ->assertNoContent();
        $this->assertDatabaseHas('properties', ['id' => $property->id, 'name' => 'Unverändert']);
    }

    public function test_bulk_update_preserves_unselected_fields_and_rejects_an_invalid_batch(): void
    {
        $this->actingAs(User::factory()->create());
        $properties = Property::factory()->count(2)->create(['manager_name' => 'Vorher']);
        $mutations = $properties->map(fn (Property $property): array => ['operation' => 'update', 'key' => $property->id, 'version' => $property->updated_at->toISOString(), 'attributes' => ['manager_name' => 'Neue Verwaltung']])->all();
        $invalid = $mutations;
        $invalid[1]['attributes']['manager_email'] = 'kein-email';
        $this->postJson('/api/v1/properties/mutate', ['mutate' => $invalid])->assertUnprocessable()->assertJsonValidationErrors(['mutate.1.attributes.manager_email']);
        foreach ($properties as $property) {
            $this->assertDatabaseHas('properties', ['id' => $property->id, 'manager_name' => 'Vorher']);
        }
        $this->postJson('/api/v1/properties/mutate', ['mutate' => $mutations, 'response' => ['aggregates' => [['relation' => 'units', 'type' => 'count']]]])->assertOk()->assertJsonCount(2, 'records');
        foreach ($properties as $property) {
            $this->assertDatabaseHas('properties', ['id' => $property->id, 'manager_name' => 'Neue Verwaltung', 'name' => $property->name]);
        }
    }

    public function test_stale_bulk_version_rolls_back_every_selected_row(): void
    {
        $this->actingAs(User::factory()->create());
        $properties = Property::factory()->count(2)->create(['manager_name' => 'Vorher']);
        $mutations = $properties->map(fn (Property $property): array => ['operation' => 'update', 'key' => $property->id, 'version' => $property->updated_at->toISOString(), 'attributes' => ['manager_name' => 'Neue Verwaltung']])->all();
        $mutations[1]['version'] = '2000-01-01T00:00:00.000000Z';
        $this->postJson('/api/v1/properties/mutate', ['mutate' => $mutations])->assertConflict();
        foreach ($properties as $property) {
            $this->assertDatabaseHas('properties', ['id' => $property->id, 'manager_name' => 'Vorher']);
        }
    }
}
