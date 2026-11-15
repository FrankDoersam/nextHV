<?php

namespace Tests\Feature;

use App\Domain\Property\Enums\UnitStatus;
use App\Models\ImportBatch;
use App\Models\Property;
use App\Models\User;
use App\Rest\Resources\UnitResource;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Gate;
use Lomkit\Rest\Fields\Enum;
use Tests\TestCase;

class CsvImportTest extends TestCase
{
    use RefreshDatabase;

    private function preview(string $csv)
    {
        return $this->postJson('/api/v1/resource-features/units/import/preview', [
            'file' => UploadedFile::fake()->createWithContent('units.csv', $csv),
            'mapping' => json_encode([
                ['field' => 'property_id', 'column' => 0, 'match' => 'code'], ['field' => 'code', 'column' => 1], ['field' => 'name', 'column' => 2],
            ]),
        ]);
    }

    public function test_import_previews_relations_and_commits_once_with_native_validation(): void
    {
        $this->actingAs(User::factory()->create());
        $property = Property::factory()->create(['code' => 'P-100', 'status' => 'active']);
        $preview = $this->preview("Objekt;Nummer;Name\nP-100;E-01;Wohnung\nP-100;E-02;Garage")->assertOk()->assertJsonPath('valid', true);
        $this->assertStringContainsString($property->name, $preview->json('rows.0.values.property_id'));
        $this->assertDatabaseCount('units', 0);
        $token = $preview->json('token');
        $this->postJson('/api/v1/resource-features/units/import/commit', ['token' => $token])->assertOk()->assertJsonPath('count', 2);
        $this->postJson('/api/v1/resource-features/units/import/commit', ['token' => $token])->assertOk()->assertJsonPath('count', 2);
        $this->assertDatabaseCount('units', 2);
        $this->assertDatabaseCount('audit_events', 3);
        $this->assertSame([], ImportBatch::find($token)->payload);
    }

    public function test_bad_relations_and_fields_are_explained_without_writes(): void
    {
        $this->actingAs(User::factory()->create());
        $this->preview("Objekt;Nummer;Name\nMISSING;E-01;Wohnung")->assertOk()->assertJsonPath('valid', false)->assertJsonPath('token', null)->assertJsonStructure(['rows' => [['errors' => ['property_id']]]]);
        $this->postJson('/api/v1/resource-features/units/import/inspect', ['file' => UploadedFile::fake()->createWithContent('bad.csv', "A;A\nx;y")])->assertUnprocessable();
        Property::factory()->create(['code' => 'P', 'status' => 'active']);
        $preview = $this->preview("Objekt;Nummer;Name\nP;;")->assertOk()->assertJsonPath('valid', false);
        $this->assertStringNotContainsString('mutate.', json_encode($preview->json('rows.0.errors')));
        $this->postJson('/api/v1/resource-features/units/import/preview', [
            'file' => UploadedFile::fake()->createWithContent('units.csv', "Nummer;Name\nE;Wohnung"),
            'mapping' => json_encode([['field' => 'code', 'column' => 0], ['field' => 'name', 'column' => 1]]),
        ])->assertOk()->assertJsonPath('valid', false)->assertJsonPath('token', null)->assertJsonStructure(['rows' => [['errors' => ['property_id']]]]);
        $this->assertDatabaseCount('units', 0);
    }

    public function test_commit_is_atomic_and_rechecks_business_rules_and_identity(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $property = Property::factory()->create(['code' => 'P', 'status' => 'active']);
        $token = $this->preview("Objekt;Nummer;Name\nP;DUP;Wohnung\nP;DUP;Garage")->assertOk()->json('token');
        $this->postJson('/api/v1/resource-features/units/import/commit', ['token' => $token])->assertUnprocessable();
        $this->assertDatabaseCount('units', 0);
        $this->assertDatabaseCount('audit_events', 1);
        $this->actingAs(User::factory()->create());
        $this->postJson('/api/v1/resource-features/units/import/commit', ['token' => $token])->assertNotFound();
        $this->actingAs($user);
        $this->travel(16)->minutes();
        $this->postJson('/api/v1/resource-features/units/import/commit', ['token' => $token])->assertUnprocessable();
    }

    public function test_ambiguous_relations_and_lost_visibility_cannot_be_imported(): void
    {
        $this->actingAs(User::factory()->create());
        Property::factory()->count(2)->create(['name' => 'Doppelt', 'status' => 'active']);
        $this->postJson('/api/v1/resource-features/units/import/preview', [
            'file' => UploadedFile::fake()->createWithContent('units.csv', "Objekt;Nummer;Name\nDoppelt;E;Wohnung"),
            'mapping' => json_encode([['field' => 'property_id', 'column' => 0, 'match' => 'name'], ['field' => 'code', 'column' => 1], ['field' => 'name', 'column' => 2]]),
        ])->assertOk()->assertJsonPath('valid', false)->assertJsonPath('token', null);
        $property = Property::factory()->create(['code' => 'P', 'status' => 'active']);
        $token = $this->preview("Objekt;Nummer;Name\nP;E;Wohnung")->assertOk()->json('token');
        $property->update(['status' => 'archived']);
        $property->delete();
        $this->postJson('/api/v1/resource-features/units/import/commit', ['token' => $token])->assertUnprocessable();
        $this->assertDatabaseCount('units', 0);
    }

    public function test_capability_and_create_policy_are_enforced(): void
    {
        $this->postJson('/api/v1/resource-features/units/import/inspect')->assertUnauthorized();
        $this->actingAs(User::factory()->create());
        $this->postJson('/api/v1/resource-features/contracts/import/inspect')->assertNotFound();
        Gate::before(fn ($user, $ability) => $ability === 'create' ? false : null);
        $this->postJson('/api/v1/resource-features/units/import/inspect')->assertForbidden();
    }

    public function test_schema_and_inspection_derive_enum_choices_relation_labels_aliases_and_required_fields(): void
    {
        $this->actingAs(User::factory()->create());
        $schema = $this->getJson('/api/v1/resource-features/units/import/schema')->assertOk();
        $fields = collect($schema->json('fields'))->keyBy('name');
        $this->assertSame('Nummer', $fields['property_id']['matchOptions'][0]['label']);
        $this->assertSame('Objekte', $fields['property_id']['relation']['label']);
        $this->assertSame('Wohnung', $fields['type']['options'][0]['label']);
        $this->assertTrue($fields['code']['required']);
        $this->assertTrue($fields['property_id']['required']);
        $this->assertStringContainsString('Bezeichnung', $schema->json('template'));
        $this->postJson('/api/v1/resource-features/units/import/inspect', [
            'file' => UploadedFile::fake()->createWithContent('units.csv', "Objektnummer;Einheitennummer;Einheitenname;Art\nP;U;Wohnung;Whg"),
        ])->assertOk()->assertJsonPath('mapping.0.field', 'property_id')->assertJsonPath('mapping.0.match', 'code')->assertJsonPath('mapping.2.field', 'name')->assertJsonPath('values.3.0', 'Whg');
    }

    public function test_custom_enum_mapping_normalizes_preview_and_preserves_server_validation(): void
    {
        $this->actingAs(User::factory()->create());
        $property = Property::factory()->create(['code' => 'P', 'status' => 'active']);
        $data = [
            'file' => UploadedFile::fake()->createWithContent('units.csv', "Objekt;Nummer;Name;Art;Zustand;Balkon\nP;E;Import;Whg;Nutzbar;Ja"),
            'mapping' => json_encode([
                ['field' => 'property_id', 'column' => 0, 'match' => 'code'], ['field' => 'code', 'column' => 1], ['field' => 'name', 'column' => 2],
                ['field' => 'type', 'column' => 3, 'values' => [['from' => 'Whg', 'to' => 'apartment']]], ['field' => 'status', 'column' => 4], ['field' => 'has_balcony', 'column' => 5],
            ]),
        ];
        $preview = $this->postJson('/api/v1/resource-features/units/import/preview', $data)->assertOk()->assertJsonPath('valid', true)->assertJsonPath('rows.0.values.type', 'Wohnung')->assertJsonPath('rows.0.values.has_balcony', 'Ja');
        $this->postJson('/api/v1/resource-features/units/import/commit', ['token' => $preview->json('token')])->assertOk();
        $this->assertDatabaseHas('units', ['property_id' => $property->id, 'type' => 'apartment', 'status' => 'ready', 'has_balcony' => 1]);
        $maps = json_decode($data['mapping'], true);
        $maps[3]['values'][0]['to'] = 'not-an-enum';
        $data['mapping'] = json_encode($maps);
        $this->postJson('/api/v1/resource-features/units/import/preview', $data)->assertUnprocessable()->assertJsonValidationErrors('mapping');
        $this->assertDatabaseCount('units', 1);
    }

    public function test_unknown_enum_value_is_a_readable_row_error_and_foreign_keys_cannot_bypass_picker_filters(): void
    {
        $this->actingAs(User::factory()->create());
        $property = Property::factory()->create(['code' => 'P', 'status' => 'active']);
        $response = $this->postJson('/api/v1/resource-features/units/import/preview', [
            'file' => UploadedFile::fake()->createWithContent('units.csv', "Objekt;Nummer;Name;Art\nP;E;Wohnung;UNBEKANNT"),
            'mapping' => json_encode([['field' => 'property_id', 'column' => 0, 'match' => 'code'], ['field' => 'code', 'column' => 1], ['field' => 'name', 'column' => 2], ['field' => 'type', 'column' => 3]]),
        ])->assertOk()->assertJsonPath('valid', false)->assertJsonPath('token', null);
        $this->assertStringContainsString('Wohnung', $response->json('rows.0.errors.type.0'));
        $this->assertStringNotContainsString('mutate.', $response->json('rows.0.errors.type.0'));
        $token = $this->preview("Objekt;Nummer;Name\nP;E;Wohnung")->assertOk()->json('token');
        $property->update(['status' => 'archived']);
        $this->postJson('/api/v1/resource-features/units/import/commit', ['token' => $token])->assertUnprocessable();
        $this->preview("Objekt;Nummer;Name\nP;E;Wohnung")->assertOk()->assertJsonPath('valid', false)->assertJsonPath('token', null);
        $this->assertDatabaseCount('units', 0);
    }

    public function test_duplicate_source_columns_and_forged_relation_match_fields_are_rejected(): void
    {
        $this->actingAs(User::factory()->create());
        $file = UploadedFile::fake()->createWithContent('units.csv', "Objekt;Nummer;Name\nP;E;Wohnung");
        $this->postJson('/api/v1/resource-features/units/import/preview', ['file' => $file, 'mapping' => json_encode([
            ['field' => 'code', 'column' => 1], ['field' => 'name', 'column' => 1],
        ])])->assertUnprocessable();
        $this->postJson('/api/v1/resource-features/units/import/preview', ['file' => $file, 'mapping' => json_encode([
            ['field' => 'property_id', 'column' => 0, 'match' => 'manager_email'],
        ])])->assertUnprocessable();
        $this->assertDatabaseCount('import_batches', 0);
    }

    public function test_import_only_offers_and_accepts_currently_creatable_enum_choices(): void
    {
        $this->app->bind(UnitResource::class, fn () => new class extends UnitResource
        {
            public function fields(): array
            {
                return array_map(fn ($field) => $field instanceof Enum && $field->name === 'status' ? $field->offered([UnitStatus::Maintenance]) : $field, parent::fields());
            }
        });
        $this->actingAs(User::factory()->create());
        $response = $this->getJson('/api/v1/resource-features/units/import/schema')->assertOk();
        $status = collect($response->json('fields'))->firstWhere('name', 'status');
        $this->assertSame([['value' => 'maintenance', 'label' => 'Instandhaltung']], $status['options']);
        $this->postJson('/api/v1/resource-features/units/import/preview', [
            'file' => UploadedFile::fake()->createWithContent('units.csv', "Zustand\nNutzbar"),
            'mapping' => json_encode([['field' => 'status', 'column' => 0]]),
        ])->assertOk()->assertJsonPath('valid', false)->assertJsonPath('token', null);
        $this->assertDatabaseCount('units', 0);
    }
}
