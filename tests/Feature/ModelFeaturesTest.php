<?php

namespace Tests\Feature;

use App\Framework\FeatureRegistry;
use App\Framework\ModelFeatures;
use App\Models\AuditEvent;
use App\Models\Property;
use App\Models\Unit;
use App\Models\User;
use App\Policies\PropertyPolicy;
use App\Rest\Resources\PropertyResource;
use App\Rest\Resources\UnitResource;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Route;
use Lomkit\Rest\Facades\Rest;
use Lomkit\Rest\Http\Controllers\Controller;
use Tests\TestCase;

class ModelFeaturesTest extends TestCase
{
    use RefreshDatabase;

    private function registerFixture(): void
    {
        Route::middleware('auth:sanctum')->prefix('api/v1')->group(fn () => Rest::resource('feature-fixtures', FeatureFixtureController::class));
        Gate::policy(FeatureFixture::class, PropertyPolicy::class);
        $this->app->forgetInstance(FeatureRegistry::class);
    }

    public function test_model_definition_drives_discovery_search_limits_and_audit_events_without_catalog_entry(): void
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

    public function test_unconfigured_models_stay_disabled_and_builder_instances_do_not_share_state(): void
    {
        $base = ModelFeatures::make();
        $base->search()->audit(['name']);
        $this->assertNull($base->toArray()['search']);
        $this->actingAs(User::factory()->create());
        $this->getJson('/api/v1/identity-documents')->assertOk()->assertJsonPath('data.meta.ui.features.audit', false)->assertJsonPath('data.meta.ui.features.import', false);
        $this->getJson('/api/v1/resource-features/identity-documents/import/schema')->assertNotFound();
    }

    public function test_invalid_import_foreign_key_is_rejected_before_any_query_or_write(): void
    {
        $resource = new class extends UnitResource
        {
            public static string $model = InvalidFeatureUnit::class;
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
}

class FeatureFixture extends Property
{
    protected $table = 'properties';

    public static function framework(): ModelFeatures
    {
        return ModelFeatures::make()->label('Testbestand')->search(title: 'code', subtitle: ['name'], limit: 1, priority: -1)->audit(fields: ['name'], events: ['updated']);
    }
}

class FeatureFixtureResource extends PropertyResource
{
    public static string $model = FeatureFixture::class;

    public function uiResourceName(): string
    {
        return 'feature-fixtures';
    }
}

class FeatureFixtureController extends Controller
{
    public static string $resource = FeatureFixtureResource::class;
}

class InvalidFeatureUnit extends Unit
{
    protected $table = 'units';

    public static function framework(): ModelFeatures
    {
        return ModelFeatures::make()->import(['property_id', 'code', 'name']);
    }
}

class HiddenFeatureProperty extends Property
{
    protected $table = 'properties';

    protected $hidden = ['notes'];

    public static function framework(): ModelFeatures
    {
        return ModelFeatures::make()->audit(['notes']);
    }
}
