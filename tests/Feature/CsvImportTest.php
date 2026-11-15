<?php

namespace Tests\Feature;

use App\Models\ImportBatch;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Gate;
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
}
