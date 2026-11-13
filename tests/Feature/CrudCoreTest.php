<?php

namespace Tests\Feature;

use App\Framework\Crud\CrudRegistry;
use App\Framework\Crud\CrudRules;
use App\Framework\Crud\HasCrudRules;
use App\Models\BusinessPartner;
use App\Models\Contract;
use App\Models\Property;
use App\Models\Unit;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class CrudCoreTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAs(User::factory()->create());
    }

    public function test_rules_apply_to_eloquent_saves_with_defaults_forced_values_and_immutable_fields(): void
    {
        $property = CrudProbeProperty::create([
            'code' => 'P-PROBE',
            'name' => 'Probe',
            'status' => 'archived',
            'street' => 'Musterstraße',
            'house_number' => '1',
            'postal_code' => '04109',
            'city' => 'Leipzig',
        ]);

        $this->assertSame('DE', $property->country);
        $this->assertSame('active', $property->status);

        $property->update(['status' => 'archived', 'name' => 'Neu']);
        $this->assertSame('active', $property->fresh()->status);
        $this->assertSame('Neu', $property->fresh()->name);

        try {
            $property->update(['code' => 'CHANGED']);
            $this->fail('Create-only rule must prevent updates.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('code', $e->errors());
        }
        $this->assertDatabaseHas('properties', ['code' => 'P-PROBE']);
    }

    public function test_defaults_are_enforced_for_direct_api_creates(): void
    {
        $response = $this->postJson('/api/v1/properties/mutate', [
            'mutate' => [[
                'operation' => 'create',
                'attributes' => [
                    'code' => 'P-API',
                    'name' => 'API Property',
                    'street' => 'Straße',
                    'house_number' => '1',
                    'postal_code' => '04109',
                    'city' => 'Leipzig',
                ],
            ]],
            'response' => (object) [],
        ])->assertOk();

        $property = Property::findOrFail($response->json('records.0.id'));
        $this->assertSame('DE', $property->country);
        $this->assertSame('active', $property->status->value);
        $this->assertSame('residential', $property->type->value);
    }

    public function test_automatic_backend_registration_and_authenticated_metadata(): void
    {
        $this->assertArrayHasKey('properties', CrudRegistry::controllers());
        $this->assertArrayHasKey('business-partners', CrudRegistry::controllers());
        $this->assertArrayHasKey('termination-notices', CrudRegistry::controllers());

        $this->getJson('/api/v1/_meta/resources/properties')
            ->assertOk()
            ->assertJsonPath('data.defaults.country', 'DE')
            ->assertJsonPath('data.deleteRestrictions.0', 'units');

        $this->getJson('/api/v1/_meta/resources/not-registered')->assertNotFound();

        auth('web')->logout();
        app('auth')->forgetGuards();
        $this->getJson('/api/v1/_meta/resources/properties')->assertUnauthorized();
    }

    public function test_deletion_guards_include_soft_deleted_related_contracts(): void
    {
        $unit = Unit::factory()->create();
        $contract = Contract::create([
            'code' => 'MV-00001',
            'unit_id' => $unit->id,
            'starts_on' => today()->subDay()->toDateString(),
        ]);
        $contract->delete();

        try {
            $unit->delete();
            $this->fail('The unit must retain contract history.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('unit', $e->errors());
        }
        $this->assertNotSoftDeleted($unit);
    }

    public function test_create_only_relations_are_protected_even_on_direct_model_updates(): void
    {
        $first = BusinessPartner::create(['code' => 'GP-1', 'display_name' => 'Eins']);
        $second = BusinessPartner::create(['code' => 'GP-2', 'display_name' => 'Zwei']);
        $role = $first->roles()->create(['role' => 'tenant']);

        try {
            $role->update(['business_partner_id' => $second->id]);
            $this->fail('An assigned role may not be transferred.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('business_partner_id', $e->errors());
        }
        $this->assertDatabaseHas('partner_roles', [
            'id' => $role->id,
            'business_partner_id' => $first->id,
        ]);
    }
}

class CrudProbeProperty extends Model
{
    use HasCrudRules;

    protected $table = 'properties';

    protected $guarded = ['id'];

    public static function crudRules(): CrudRules
    {
        return CrudRules::make()
            ->default('country', 'DE')
            ->force('status', 'active')
            ->createOnly('code');
    }
}
