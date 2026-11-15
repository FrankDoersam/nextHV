<?php

namespace Tests\Feature;

use App\Models\Contract;
use App\Models\Property;
use App\Models\Unit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;
use Tests\TestCase;

class GlobalSearchTest extends TestCase
{
    use RefreshDatabase;

    public function test_search_uses_native_related_search_and_only_returns_safe_captions(): void
    {
        $this->actingAs(User::factory()->create());
        $property = Property::factory()->create(['name' => 'Suchbarer Lindenhof', 'notes' => 'PRIVATE NOTE']);
        $unit = Unit::factory()->create(['property_id' => $property->id, 'name' => 'Wohnung 01']);
        Contract::create(['code' => 'MV-SUCHBAR', 'unit_id' => $unit->id, 'starts_on' => '2026-01-01']);
        $response = $this->postJson('/api/v1/global-search', ['query' => 'Lindenhof'])->assertOk();
        $this->assertSame('Suchbarer Lindenhof', $response->json('data.0.items.0.title'));
        $this->assertStringContainsString('Lindenhof', $response->json('data.1.items.0.subtitle'));
        $response->assertDontSee('PRIVATE NOTE');
        $contracts = $this->postJson('/api/v1/global-search', ['query' => 'MV-SUCHBAR'])->assertOk();
        $this->assertStringContainsString('Wohnung 01', $contracts->json('data.3.items.0.subtitle'));
        $this->assertStringContainsString('Lindenhof', $contracts->json('data.3.items.0.subtitle'));
    }

    public function test_search_is_authenticated_bounded_and_honours_disabled_resources_and_policies(): void
    {
        $this->postJson('/api/v1/global-search', ['query' => 'Test'])->assertUnauthorized();
        $this->actingAs(User::factory()->create());
        Property::factory()->count(12)->create(['name' => 'Test Objekt']);
        $this->postJson('/api/v1/global-search', ['query' => 'Test'])->assertOk()->assertJsonCount(10, 'data.0.items')->assertJsonPath('data.0.total', 12);
        $this->postJson('/api/v1/global-search', ['query' => ' '])->assertUnprocessable();
        config(['resource_features.units.search' => false]);
        Gate::before(fn ($user, string $ability, array $arguments) => $ability === 'viewAny' && ($arguments[0] ?? null) === Property::class ? false : null);
        $response = $this->postJson('/api/v1/global-search', ['query' => 'Test'])->assertOk();
        $this->assertNotContains('properties', array_column($response->json('data'), 'resource'));
        $this->assertNotContains('units', array_column($response->json('data'), 'resource'));
    }
}
