<?php

namespace Tests\Feature;

use App\Models\Property;
use App\Models\Unit;
use App\Models\User;
use App\Rest\Resources\PropertyResource;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LocalizedValidationTest extends TestCase
{
    use RefreshDatabase;

    public function test_empty_create_fields_report_one_required_message_with_readable_labels(): void
    {
        $this->actingAs(User::factory()->create());
        $response = $this->postJson('/api/v1/properties/mutate', ['mutate' => [['operation' => 'create', 'attributes' => ['code' => '', 'name' => null]]]])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Bitte prüfe die markierten Angaben.')
            ->assertJsonValidationErrors(['mutate.0.attributes.code' => 'Nummer ist erforderlich.', 'mutate.0.attributes.name' => 'Bezeichnung ist erforderlich.']);

        $this->assertSame(['Nummer ist erforderlich.'], $response->json('errors')['mutate.0.attributes.code']);
        foreach ($response->json('errors') as $messages) {
            $this->assertCount(1, $messages);
            $this->assertStringNotContainsString('mutate.', $messages[0]);
        }
        $this->assertDatabaseCount('properties', 0);
    }

    public function test_update_reports_localized_filled_and_type_errors_without_persisting(): void
    {
        $this->actingAs(User::factory()->create());
        $property = Property::factory()->create(['name' => 'Unverändert']);
        $payload = ['operation' => 'update', 'key' => $property->id, 'version' => $property->updated_at->toISOString(), 'attributes' => ['code' => '', 'manager_email' => 'keine-mail']];
        $response = $this->postJson('/api/v1/properties/mutate', ['mutate' => [$payload]])->assertUnprocessable()
            ->assertJsonValidationErrors(['mutate.0.attributes.code' => 'Nummer darf nicht leer sein.', 'mutate.0.attributes.manager_email' => 'Bitte eine gültige E-Mail-Adresse für E-Mail des Ansprechpartners eingeben.']);
        $this->assertCount(1, $response->json('errors')['mutate.0.attributes.code']);
        $this->assertDatabaseHas('properties', ['id' => $property->id, 'code' => $property->code, 'name' => 'Unverändert']);
        $this->postJson('/api/v1/properties/mutate', ['mutate' => [$payload]], ['Precognition' => 'true', 'Precognition-Validate-Only' => 'mutate.0.attributes.code'])
            ->assertUnprocessable()->assertJsonValidationErrors(['mutate.0.attributes.code' => 'Nummer darf nicht leer sein.'])
            ->assertJsonMissingValidationErrors(['mutate.0.attributes.manager_email']);

        $payload['attributes'] = ['name' => ['invalid']];
        $this->postJson('/api/v1/properties/mutate', ['mutate' => [$payload]])->assertUnprocessable()
            ->assertJsonValidationErrors(['mutate.0.attributes.name' => 'Bezeichnung muss als Text angegeben werden.']);
    }

    public function test_precognition_uses_the_same_messages_and_limits_validation_to_requested_fields(): void
    {
        $this->actingAs(User::factory()->create());
        $headers = ['Precognition' => 'true', 'Precognition-Validate-Only' => 'mutate.0.attributes.code'];
        $this->postJson('/api/v1/properties/mutate', ['mutate' => [['operation' => 'create', 'attributes' => ['code' => '']]]], $headers)
            ->assertUnprocessable()->assertJsonValidationErrors(['mutate.0.attributes.code' => 'Nummer ist erforderlich.'])
            ->assertJsonMissingValidationErrors(['mutate.0.attributes.name']);
        $this->postJson('/api/v1/properties/mutate', ['mutate' => [['operation' => 'create', 'attributes' => ['code' => 'PREVIEW']]]], $headers)
            ->assertNoContent()->assertHeader('Precognition-Success', 'true');
        $this->assertDatabaseCount('properties', 0);
    }

    public function test_native_nested_fields_keep_paths_and_name_the_relation_row(): void
    {
        $this->actingAs(User::factory()->create());
        $payload = ['operation' => 'create', 'attributes' => ['code' => 'P-NEST', 'name' => 'Hof', 'street' => 'Straße', 'house_number' => '1', 'postal_code' => '10000', 'city' => 'Berlin'], 'relations' => ['units' => [['operation' => 'create', 'attributes' => ['code' => '', 'name' => '']]]]];
        $this->postJson('/api/v1/properties/mutate', ['mutate' => [$payload]])->assertUnprocessable()
            ->assertJsonValidationErrors(['mutate.0.relations.units.0.attributes.code' => 'Einheiten, Zeile 1 · Nummer ist erforderlich.']);
        $this->assertDatabaseCount('properties', 0);
        $this->assertDatabaseCount('units', 0);
    }

    public function test_contract_nested_precognition_names_parties_and_conditions(): void
    {
        $this->actingAs(User::factory()->create());
        $unit = Unit::factory()->create();
        $payload = ['operation' => 'create', 'attributes' => ['code' => 'C-NEST', 'unit_id' => $unit->id, 'starts_on' => '2026-01-01'], 'relations' => [
            'parties' => [['operation' => 'create', 'attributes' => ['business_partner_id' => null, 'role' => 'tenant']]],
            'conditions' => [['operation' => 'create', 'attributes' => ['effective_from' => null, 'base_rent' => 200]]],
        ]];
        $this->postJson('/api/v1/contracts/mutate', ['mutate' => [$payload]], ['Precognition' => 'true', 'Precognition-Validate-Only' => 'mutate.0.relations.parties.0.attributes.business_partner_id,mutate.0.relations.conditions.0.attributes.effective_from'])
            ->assertUnprocessable()->assertJsonValidationErrors([
                'mutate.0.relations.parties.0.attributes.business_partner_id' => 'Vertragsbeteiligte, Zeile 1 · Geschäftspartner ist erforderlich.',
                'mutate.0.relations.conditions.0.attributes.effective_from' => 'Konditionen, Zeile 1 · Gültig ab ist erforderlich.',
            ])->assertJsonMissingValidationErrors(['mutate.0.attributes.code']);
        $this->assertDatabaseCount('contracts', 0);
    }

    public function test_explicit_resource_labels_override_shared_attribute_labels(): void
    {
        $this->app->bind(PropertyResource::class, fn () => new class extends PropertyResource
        {
            public function fields(): array
            {
                return array_map(fn ($field) => $field->name === 'code' ? $field->label('Objektreferenz') : $field, parent::fields());
            }
        });
        $this->actingAs(User::factory()->create());
        $this->postJson('/api/v1/properties/mutate', ['mutate' => [['operation' => 'create', 'attributes' => ['code' => '']]]])
            ->assertUnprocessable()->assertJsonValidationErrors(['mutate.0.attributes.code' => 'Objektreferenz ist erforderlich.']);
    }

    public function test_unique_rule_and_valid_partial_updates_keep_their_behavior(): void
    {
        $this->actingAs(User::factory()->create());
        $taken = Property::factory()->create();
        $property = Property::factory()->create();
        $payload = ['operation' => 'update', 'key' => $property->id, 'version' => $property->updated_at->toISOString(), 'attributes' => ['code' => $taken->code]];
        $this->postJson('/api/v1/properties/mutate', ['mutate' => [$payload]])->assertUnprocessable()
            ->assertJsonValidationErrors(['mutate.0.attributes.code' => 'Nummer ist bereits vergeben.']);
        $payload['attributes'] = ['name' => 'Neuer Name'];
        $this->postJson('/api/v1/properties/mutate', ['mutate' => [$payload]])->assertOk();
        $this->assertDatabaseHas('properties', ['id' => $property->id, 'name' => 'Neuer Name', 'code' => $property->code]);
    }
}
