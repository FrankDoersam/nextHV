<?php

namespace Tests\Feature;

use App\Contracts\Framework\HasCsvImport;
use App\Contracts\Framework\HasFeatureAvailability;
use App\Framework\AuditDefinition;
use App\Framework\Feature;
use App\Framework\FeatureContext;
use App\Framework\FeatureRegistry;
use App\Framework\ImportDefinition;
use App\Framework\SearchDefinition;
use App\Models\AuditEvent;
use App\Models\Property;
use App\Models\Unit;
use App\Models\User;
use App\Policies\PropertyPolicy;
use App\Rest\Resources\PropertyResource;
use App\Rest\Resources\UnitResource;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Route;
use Lomkit\Rest\Facades\Rest;
use Lomkit\Rest\Http\Controllers\Controller;
use Tests\TestCase;

class ResourceCapabilitiesTest extends TestCase
{
    use RefreshDatabase;

    private function registerFixture(): void
    {
        Route::middleware('auth:sanctum')->prefix('api/v1')->group(fn () => Rest::resource('feature-fixtures', FeatureFixtureController::class));
        Gate::policy(FeatureFixture::class, PropertyPolicy::class);
        $this->app->forgetInstance(FeatureRegistry::class);
    }

    public function test_capability_interfaces_drive_discovery_search_limits_and_model_audit_without_catalog_entry(): void
    {
        $this->registerFixture();
        $this->actingAs(User::factory()->create(['name' => 'Ada']));
        $first = FeatureFixture::create(Property::factory()->make(['code' => 'FIXTURE-1', 'name' => 'Prüfhaus'])->getAttributes());
        FeatureFixture::create(Property::factory()->make(['code' => 'FIXTURE-2', 'name' => 'Prüfhaus'])->getAttributes());
        $this->assertDatabaseCount('audit_events', 0);
        $this->postJson('/api/v1/global-search', ['query' => 'Prüfhaus'])->assertOk()
            ->assertJsonPath('data.0.resource', 'feature-fixtures')
            ->assertJsonPath('data.0.label', 'Testbestand')
            ->assertJsonPath('data.0.total', 2)
            ->assertJsonCount(1, 'data.0.items')
            ->assertJsonPath('data.0.items.0.title', 'FIXTURE-2');
        $first->update(['name' => 'Umbenannt', 'city' => 'Nicht protokolliert']);
        $event = AuditEvent::sole();
        $this->assertSame('feature-fixtures', $event->resource);
        $this->assertSame(['name' => ['before' => 'Prüfhaus', 'after' => 'Umbenannt']], $event->changes);
        $this->assertSame('Ada', $event->actor_name);
    }

    public function test_unconfigured_resources_stay_disabled_and_definitions_do_not_share_state(): void
    {
        $base = new SearchDefinition(subtitle: ['code']);
        $copy = $base->toArray();
        $copy['subtitle'][] = 'notes';
        $this->assertSame(['code'], $base->subtitle);
        $this->actingAs(User::factory()->create());
        $this->getJson('/api/v1/identity-documents')->assertOk()->assertJsonPath('data.meta.ui.features.audit', false)->assertJsonPath('data.meta.ui.features.import', false);
        $this->getJson('/api/v1/resource-features/identity-documents/import/schema')->assertNotFound();
    }

    public function test_invalid_import_foreign_key_is_rejected_before_any_query_or_write(): void
    {
        $resource = new class extends UnitResource
        {
            public function csvImport(): ImportDefinition
            {
                return new ImportDefinition(fields: ['property_id', 'code', 'name']);
            }
        };
        $this->expectException(\LogicException::class);
        $this->expectExceptionMessage('requires a relation declaration');
        app(FeatureRegistry::class)->forResource($resource);
    }

    public function test_hidden_audit_fields_are_rejected_as_configuration_errors(): void
    {
        $resource = new class extends PropertyResource
        {
            public static string $model = HiddenFeatureProperty::class;
        };
        $this->expectException(\LogicException::class);
        $this->expectExceptionMessage('hidden feature field: notes');
        app(FeatureRegistry::class)->forResource($resource);
    }

    public function test_audit_does_not_resolve_routes_or_compile_unrelated_resources(): void
    {
        $this->app->bind(FeatureRegistry::class, fn () => throw new \LogicException('Registry must not be resolved on model writes'));
        $row = FeatureFixture::create(Property::factory()->make(['name' => 'Vorher'])->getAttributes());
        $row->update(['name' => 'Nachher']);
        $event = AuditEvent::sole();
        $this->assertSame('System', $event->actor_name);
        $this->assertSame('feature-fixtures', $event->resource);
        $this->assertSame(['name' => ['before' => 'Vorher', 'after' => 'Nachher']], $event->changes);
    }

    public function test_tagged_modules_are_discovered_and_duplicate_registration_is_idempotent(): void
    {
        $this->registerFixture();
        $this->app->tag([FeatureFixtureResource::class], FeatureRegistry::RESOURCE_TAG);
        $this->assertSame(1, count(array_filter(array_keys(app(FeatureRegistry::class)->all()), fn ($key) => $key === 'feature-fixtures')));
        $this->app->tag([TaggedFixtureResource::class], FeatureRegistry::RESOURCE_TAG);
        $this->app->forgetInstance(FeatureRegistry::class);
        $this->assertSame(TaggedFixtureResource::class, app(FeatureRegistry::class)->get('module-fixtures')['resource']);
    }

    public function test_different_resources_cannot_claim_the_same_identifier(): void
    {
        $this->app->tag([DuplicateFixtureResource::class], FeatureRegistry::RESOURCE_TAG);
        $this->expectException(\LogicException::class);
        $this->expectExceptionMessage('Duplicate feature resource: properties');
        app(FeatureRegistry::class)->all();
    }

    public function test_availability_uses_current_actor_without_poisoning_the_compiled_definition(): void
    {
        $resource = new ContextualFixtureResource;
        $registry = app(FeatureRegistry::class);
        $this->assertNull($registry->forResource($resource)['import']);
        $this->actingAs(User::factory()->create(['name' => 'Importer']));
        $this->assertNotNull($registry->forResource($resource)['import']);
        $this->actingAs(User::factory()->create(['name' => 'Reader']));
        $this->assertNull($registry->forResource($resource)['import']);
        $this->assertNotNull($registry->forResource($resource, applyAvailability: false)['import']);
        $this->assertSame(1, $resource->compilations);
    }

    public function test_availability_applies_to_metadata_and_all_import_endpoints_including_commit(): void
    {
        $this->app->bind(PropertyResource::class, ContextualFixtureResource::class);
        $this->actingAs(User::factory()->create(['name' => 'Importer']));
        $file = UploadedFile::fake()->createWithContent('properties.csv', "Nummer;Bezeichnung;Straße;Hausnummer;PLZ;Ort\nCAP-001;Capability Test;Testweg;1;10115;Berlin");
        $preview = $this->post('/api/v1/resource-features/properties/import/preview', [
            'file' => $file, 'mapping' => json_encode([['column' => 0, 'field' => 'code'], ['column' => 1, 'field' => 'name'], ['column' => 2, 'field' => 'street'], ['column' => 3, 'field' => 'house_number'], ['column' => 4, 'field' => 'postal_code'], ['column' => 5, 'field' => 'city']]),
        ], ['Accept' => 'application/json'])->assertOk()->assertJsonPath('valid', true);
        auth()->user()->update(['name' => 'Reader']);
        $this->getJson('/api/v1/properties')->assertOk()->assertJsonPath('data.meta.ui.features.import', false);
        $this->getJson('/api/v1/resource-features/properties/import/schema')->assertNotFound();
        $this->postJson('/api/v1/resource-features/properties/import/inspect')->assertNotFound();
        $this->postJson('/api/v1/resource-features/properties/import/preview')->assertNotFound();
        $this->postJson('/api/v1/resource-features/properties/import/commit', ['token' => $preview->json('token')])->assertNotFound();
        $this->assertDatabaseMissing('properties', ['code' => 'CAP-001']);
        Property::factory()->create(['name' => 'Audit remains enabled']);
        $this->assertDatabaseHas('audit_events', ['resource' => 'properties', 'event' => 'created']);
    }

    public function test_runtime_restrictions_hide_search_and_history_without_disabling_audit_writes(): void
    {
        $this->app->bind(PropertyResource::class, HiddenFixtureResource::class);
        $this->actingAs(User::factory()->create());
        $row = Property::factory()->create(['name' => 'Restricted House']);
        $this->postJson('/api/v1/global-search', ['query' => 'Restricted'])->assertOk()->assertJsonMissing(['resource' => 'properties']);
        $this->getJson('/api/v1/resource-features/properties/'.$row->id.'/audit')->assertNotFound();
        $this->assertDatabaseHas('audit_events', ['resource' => 'properties', 'record_id' => $row->id]);
        $this->assertNotNull(app(FeatureRegistry::class)->forResource(new HiddenFixtureResource, applyAvailability: false)['search']);
    }

    public function test_multiple_resource_views_read_one_model_audit_stream_without_duplicate_events(): void
    {
        $this->registerFixture();
        $this->app->tag([TaggedFixtureResource::class], FeatureRegistry::RESOURCE_TAG);
        $this->actingAs(User::factory()->create());
        $row = FeatureFixture::create(Property::factory()->make(['name' => 'Old'])->getAttributes());
        $row->update(['name' => 'New']);
        $this->assertDatabaseCount('audit_events', 1);
        $first = $this->getJson('/api/v1/resource-features/feature-fixtures/'.$row->id.'/audit')->assertOk();
        $second = $this->getJson('/api/v1/resource-features/module-fixtures/'.$row->id.'/audit')->assertOk();
        $this->assertSame($first->json('data'), $second->json('data'));
        $this->assertCount(1, $second->json('data'));
    }

    public function test_search_skips_resources_without_search_capability_before_compiling_them(): void
    {
        $this->app->tag([UnsearchableFixtureResource::class], FeatureRegistry::RESOURCE_TAG);
        $this->actingAs(User::factory()->create());
        $this->postJson('/api/v1/global-search', ['query' => 'Absent'])->assertOk();
        $this->expectException(\LogicException::class);
        $this->expectExceptionMessage('Invalid import declaration');
        app(FeatureRegistry::class)->all(applyAvailability: false);
    }
}

class FeatureFixture extends Property
{
    protected $table = 'properties';

    public static function auditTrail(): AuditDefinition
    {
        return new AuditDefinition(fields: ['name'], events: ['updated'], stream: 'feature-fixtures');
    }
}

class FeatureFixtureResource extends PropertyResource
{
    public static string $model = FeatureFixture::class;

    public function globalSearch(): SearchDefinition
    {
        return new SearchDefinition(title: 'code', subtitle: ['name'], limit: 1, priority: -1);
    }

    public function uiLabel(): string
    {
        return 'Testbestand';
    }

    public function uiResourceName(): string
    {
        return 'feature-fixtures';
    }
}

class FeatureFixtureController extends Controller
{
    public static string $resource = FeatureFixtureResource::class;
}

class HiddenFeatureProperty extends Property
{
    protected $table = 'properties';

    protected $hidden = ['notes'];

    public static function auditTrail(): AuditDefinition
    {
        return new AuditDefinition(fields: ['notes']);
    }
}

class TaggedFixtureResource extends FeatureFixtureResource
{
    public function uiResourceName(): string
    {
        return 'module-fixtures';
    }
}
class DuplicateFixtureResource extends PropertyResource {}
class ContextualFixtureResource extends PropertyResource implements HasFeatureAvailability
{
    public int $compilations = 0;

    public function csvImport(): ImportDefinition
    {
        $this->compilations++;

        return parent::csvImport();
    }

    public function featureAvailable(Feature $feature, FeatureContext $context): bool
    {
        return $feature !== Feature::Import || $context->actor?->name === 'Importer';
    }
}
class UnsearchableFixtureResource extends \App\Rest\Resources\Resource implements HasCsvImport
{
    public static string $model = Unit::class;

    public function uiResourceName(): string
    {
        return 'unsearchable-fixtures';
    }

    public function csvImport(): ImportDefinition
    {
        throw new \LogicException('Invalid import declaration');
    }
}

class HiddenFixtureResource extends PropertyResource implements HasFeatureAvailability
{
    public function featureAvailable(Feature $feature, FeatureContext $context): bool
    {
        return false;
    }
}
