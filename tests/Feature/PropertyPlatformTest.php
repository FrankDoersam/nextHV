<?php

namespace Tests\Feature;

use App\Contracts\PermissionAdapter;
use App\Models\BusinessPartner;
use App\Models\Contract;
use App\Models\IdentityDocument;
use App\Models\Property;
use App\Models\RentCondition;
use App\Models\TerminationNotice;
use App\Models\Unit;
use App\Models\User;
use Database\Seeders\PropertySeeder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PropertyPlatformTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAs(User::factory()->create());
    }

    private function createRecord(string $resource, array $attributes)
    {
        return $this->postJson('/api/v1/'.$resource.'/mutate', ['mutate' => [['operation' => 'create', 'attributes' => $attributes]], 'response' => (object) []]);
    }

    private function draft(?Unit $unit = null): Contract
    {
        return Contract::create(['code' => 'MV-'.fake()->unique()->numerify('######'), 'unit_id' => ($unit ?? Unit::factory()->create())->id, 'starts_on' => today()->subYears(2)->startOfYear(), 'deposit' => 1000]);
    }

    private function prepare(Contract $contract): void
    {
        $partner = BusinessPartner::create(['code' => 'GP-'.$contract->id, 'display_name' => 'Test Mieter']);
        $contract->parties()->create(['business_partner_id' => $partner->id, 'role' => 'tenant']);
        $contract->conditions()->create(['effective_from' => $contract->starts_on, 'base_rent' => 800.25, 'service_charge' => 120.50, 'heating_cost' => 60]);
    }

    private function confirmed(string $path, array $body)
    {
        $method = str_ends_with($path, '/destroy') ? 'deleteJson' : 'postJson';
        $path = str_replace('/destroy', '', $path);
        $response = $this->$method($path, $body);
        $response->assertStatus(428);

        return $this->$method($path, [...$body, 'confirmation' => $response->json('confirmation.token')]);
    }

    public function test_api_requires_authentication(): void
    {
        auth('web')->logout();
        app('auth')->forgetGuards();
        $this->postJson('/api/v1/properties/search', [])->assertUnauthorized();
        $this->getJson('/auth/user')->assertUnauthorized();
    }

    public function test_login_and_logout(): void
    {
        auth('web')->logout();
        app('auth')->forgetGuards();
        $user = User::factory()->create(['password' => 'a-secure-test-password']);
        $this->postJson('/auth/login', ['email' => $user->email, 'password' => 'wrong'])->assertUnprocessable();
        $this->postJson('/auth/login', ['email' => $user->email, 'password' => 'a-secure-test-password'])->assertOk()->assertJsonPath('data.id', $user->id);
        $this->getJson('/auth/user')->assertOk();
        $this->postJson('/auth/logout', [])->assertOk();
        $this->assertGuest();
    }

    public function test_seeder_is_repeatable_and_creates_exact_ten_by_five(): void
    {
        $this->seed(PropertySeeder::class);
        $this->seed(PropertySeeder::class);
        $this->assertDatabaseCount('properties', 10);
        $this->assertDatabaseCount('units', 50);
        $this->assertTrue(Property::withCount('units')->get()->every(fn ($p) => $p->units_count === 5));
        $this->assertDatabaseCount('contract_links', 10);
        $this->assertSame(Contract::count() * 2, RentCondition::count());
        $this->assertSame(10, Unit::where('type', 'garage')->count());
    }

    public function test_search_pagination_text_and_relations(): void
    {
        $this->seed(PropertySeeder::class);
        $this->postJson('/api/v1/properties/search', ['search' => ['text' => ['value' => 'Linden'], 'limit' => 10, 'aggregates' => [['relation' => 'units', 'type' => 'count']]]])->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.units_count', 5);
        $this->postJson('/api/v1/units/search', ['search' => ['filters' => [['field' => 'property.city', 'value' => 'Berlin']], 'includes' => [['relation' => 'property']], 'limit' => 10]])->assertOk()->assertJsonCount(10, 'data');
    }

    public function test_property_create_update_and_stale_version_conflict(): void
    {
        $r = $this->createRecord('properties', ['code' => 'P-1', 'name' => 'Test', 'street' => 'Straße', 'house_number' => '1', 'postal_code' => '10000', 'city' => 'Berlin'])->assertOk();
        $row = $r->json('records.0');
        $this->postJson('/api/v1/properties/mutate', ['mutate' => [['operation' => 'update', 'key' => $row['id'], 'version' => $row['updated_at'], 'attributes' => ['name' => 'Neu']]]])->assertOk();
        $this->postJson('/api/v1/properties/mutate', ['mutate' => [['operation' => 'update', 'key' => $row['id'], 'version' => '2000-01-01T00:00:00.000000Z', 'attributes' => ['name' => 'Alt']]]])->assertConflict();
        $this->assertDatabaseHas('properties', ['name' => 'Neu']);
    }

    public function test_property_validation_and_undeclared_fields(): void
    {
        $this->createRecord('properties', ['name' => 'Bad'])->assertUnprocessable();
        $this->createRecord('properties', ['code' => '1', 'name' => 'Bad', 'street' => 's', 'house_number' => '1', 'postal_code' => '1', 'city' => 'c', 'admin' => true])->assertUnprocessable();
    }

    public function test_nested_unit_creation_and_duplicate_codes_are_transactional(): void
    {
        $this->postJson('/api/v1/properties/mutate', ['mutate' => [['operation' => 'create', 'attributes' => ['code' => 'P', 'name' => 'Test', 'street' => 's', 'house_number' => '1', 'postal_code' => '1', 'city' => 'c'], 'relations' => ['units' => [['operation' => 'create', 'attributes' => ['code' => 'A', 'name' => 'Wohnung']]]]]]])->assertOk();
        $p = Property::first();
        $this->assertSame(1, $p->units()->count());
        $this->createRecord('units', ['property_id' => $p->id, 'code' => 'A', 'name' => 'Duplikat'])->assertUnprocessable();
        $this->assertDatabaseCount('units', 1);
    }

    public function test_empty_property_delete_requires_signed_confirmation(): void
    {
        $p = Property::factory()->create(['status' => 'archived']);
        $body = ['resources' => [$p->id]];
        $this->deleteJson('/api/v1/properties', [...$body, 'confirmation' => 'invalid'])->assertStatus(428);
        $this->confirmed('/api/v1/properties/destroy', $body)->assertOk();
        $this->assertSoftDeleted($p);
    }

    public function test_property_with_units_cannot_be_deleted(): void
    {
        $u = Unit::factory()->create();
        $this->deleteJson('/api/v1/properties', ['resources' => [$u->property_id]])->assertUnprocessable();
        $this->assertNotSoftDeleted($u->property);
    }

    public function test_archive_bulk_and_clone_single_limit(): void
    {
        $a = Property::factory()->create();
        $b = Property::factory()->create();
        $this->confirmed('/api/v1/properties/actions/archive', ['resources' => [$a->id, $b->id]])->assertOk();
        $this->assertSame(2, Property::where('status', 'archived')->count());
        $this->postJson('/api/v1/properties/actions/clone', ['resources' => [$a->id, $b->id], 'fields' => [['name' => 'code', 'value' => 'C'], ['name' => 'name', 'value' => 'Clone']]])->assertUnprocessable();
    }

    public function test_clone_copies_physical_units_without_contracts(): void
    {
        $c = $this->draft();
        $this->prepare($c);
        $source = $c->unit->property;
        $r = $this->postJson('/api/v1/properties/actions/clone', ['resources' => [$source->id], 'fields' => [['name' => 'code', 'value' => 'COPY'], ['name' => 'name', 'value' => 'Kopie'], ['name' => 'with_units', 'value' => true]]])->assertOk();
        $copy = Property::where('code', 'COPY')->firstOrFail();
        $this->assertSame(1, $copy->units()->count());
        $this->assertSame(0, $copy->units->first()->contracts()->count());
    }

    public function test_currency_is_numeric_and_validation_rejects_negative_and_extra_precision(): void
    {
        $c = $this->draft();
        $this->createRecord('rent-conditions', ['contract_id' => $c->id, 'effective_from' => $c->starts_on->toDateString(), 'base_rent' => 1234.56])->assertOk()->assertJsonPath('records.0.base_rent', 1234.56);
        $this->createRecord('rent-conditions', ['contract_id' => $c->id, 'effective_from' => today()->toDateString(), 'base_rent' => -1])->assertUnprocessable();
        $this->createRecord('rent-conditions', ['contract_id' => $c->id, 'effective_from' => today()->toDateString(), 'base_rent' => 2.345])->assertUnprocessable();
    }

    public function test_activation_requires_tenant_and_initial_condition(): void
    {
        $c = $this->draft();
        $this->confirmed('/api/v1/contracts/actions/activate', ['resources' => [$c->id]])->assertUnprocessable();
        $this->prepare($c);
        $this->confirmed('/api/v1/contracts/actions/activate', ['resources' => [$c->id]])->assertOk();
        $this->assertSame('active', $c->fresh()->status);
    }

    public function test_overlapping_contracts_are_rejected_at_activation(): void
    {
        $c = $this->draft();
        $this->prepare($c);
        $c->update(['status' => 'active']);
        $second = $this->draft($c->unit);
        $this->prepare($second);
        $this->confirmed('/api/v1/contracts/actions/activate', ['resources' => [$second->id]])->assertUnprocessable();
        $this->assertSame('draft', $second->fresh()->status);
    }

    public function test_current_condition_is_selected_and_future_condition_is_not_counted(): void
    {
        $c = $this->draft();
        $this->prepare($c);
        $c->conditions()->create(['effective_from' => today()->startOfYear(), 'base_rent' => 900.50, 'service_charge' => 140.25, 'heating_cost' => 70]);
        $c->conditions()->create(['effective_from' => today()->addYear()->startOfYear(), 'base_rent' => 9999]);
        $c->update(['status' => 'active']);
        $this->postJson('/api/v1/properties/metrics/overview', ['search' => ['filters' => [['field' => 'id', 'value' => $c->unit->property_id]]]])->assertOk()->assertJsonPath('data.monthly_rent', 900.5)->assertJsonPath('data.monthly_charges', 210.25)->assertJsonPath('data.rented', 1);
    }

    public function test_historical_conditions_are_immutable_and_duplicates_are_validation_errors(): void
    {
        $c = $this->draft();
        $this->prepare($c);
        $c->update(['status' => 'active']);
        $row = $this->postJson('/api/v1/rent-conditions/search', [])->json('data.0');
        $this->postJson('/api/v1/rent-conditions/mutate', ['mutate' => [['operation' => 'update', 'key' => $row['id'], 'version' => $row['updated_at'], 'attributes' => ['base_rent' => 1]]]])->assertUnprocessable();
        $this->createRecord('rent-conditions', ['contract_id' => $c->id, 'effective_from' => $c->starts_on->toDateString(), 'base_rent' => 950])->assertUnprocessable();
    }

    public function test_contract_stammdaten_cannot_be_rewritten_after_activation(): void
    {
        $c = $this->draft();
        $this->prepare($c);
        $c->update(['status' => 'active']);
        $r = $this->postJson('/api/v1/contracts/search', [])->json('data.0');
        $this->postJson('/api/v1/contracts/mutate', ['mutate' => [['operation' => 'update', 'key' => $c->id, 'version' => $r['updated_at'], 'attributes' => ['starts_on' => '2020-01-01']]]])->assertUnprocessable();
    }

    public function test_termination_is_a_separate_record_and_confirmation_sets_end(): void
    {
        $c = $this->draft();
        $this->prepare($c);
        $c->update(['status' => 'active']);
        $row = $this->createRecord('termination-notices', ['contract_id' => $c->id, 'declared_on' => today()->subDays(2)->toDateString(), 'received_on' => today()->toDateString(), 'requested_end_on' => today()->addMonths(3)->toDateString(), 'reason' => 'Umzug'])->assertOk()->json('records.0');
        $this->assertNull($c->fresh()->ends_on);
        $this->confirmed('/api/v1/termination-notices/actions/confirm', ['resources' => [$row['id']], 'fields' => [['name' => 'confirmed_end_on', 'value' => today()->addMonths(3)->toDateString()]]])->assertOk();
        $this->assertSame('ended', $c->fresh()->status);
        $this->assertSame('confirmed', TerminationNotice::find($row['id'])->status);
    }

    public function test_contract_links_cannot_link_self_or_duplicate_reverse(): void
    {
        $a = $this->draft();
        $b = $this->draft();
        $this->createRecord('contract-links', ['contract_id' => $a->id, 'related_contract_id' => $a->id])->assertUnprocessable();
        $this->createRecord('contract-links', ['contract_id' => $a->id, 'related_contract_id' => $b->id])->assertOk();
        $this->createRecord('contract-links', ['contract_id' => $b->id, 'related_contract_id' => $a->id])->assertUnprocessable();
    }

    public function test_identity_is_separate_encrypted_and_number_is_not_returned(): void
    {
        $partner = BusinessPartner::create(['code' => 'GP', 'display_name' => 'Test']);
        $row = $this->createRecord('identity-documents', ['business_partner_id' => $partner->id, 'title' => 'Personalausweis', 'document_number' => 'ABC12345678'])->assertOk()->json('records.0');
        $this->assertArrayNotHasKey('document_number', $row);
        $this->assertSame('5678', $row['number_last_four']);
        $this->assertStringNotContainsString('ABC12345678', DB::table('identity_documents')->value('document_number'));
    }

    public function test_file_upload_is_private_encrypted_and_download_requires_login(): void
    {
        Storage::fake('local');
        $partner = BusinessPartner::create(['code' => 'GP', 'display_name' => 'Test']);
        $doc = IdentityDocument::create(['business_partner_id' => $partner->id, 'title' => 'ID']);
        $this->post('/api/v1/identity-documents/'.$doc->id.'/file', ['file' => UploadedFile::fake()->createWithContent('id.pdf', "%PDF-1.4\nsecret-document")], ['Accept' => 'application/json'])->assertOk();
        $doc->refresh();
        $this->assertStringNotContainsString('secret-document', Storage::disk('local')->get($doc->storage_path));
        $this->get('/api/v1/identity-documents/'.$doc->id.'/file')->assertOk()->assertHeader('Cache-Control', 'no-store, private');
        auth('web')->logout();
        app('auth')->forgetGuards();
        $this->getJson('/api/v1/identity-documents/'.$doc->id.'/file')->assertUnauthorized();
    }

    public function test_disabled_permission_adapter_is_never_called(): void
    {
        $this->app->bind(PermissionAdapter::class, fn () => throw new \RuntimeException('Adapter must remain inactive'));
        $this->postJson('/api/v1/properties/search', [])->assertOk();
    }

    public function test_enabled_permission_adapter_denies_access(): void
    {
        config(['nexthv.permissions.enabled' => true]);
        $this->app->bind(PermissionAdapter::class, fn () => new class implements PermissionAdapter
        {
            public function allows(User $u, string $a, ?Model $m = null): bool
            {
                return false;
            }
        });
        $this->postJson('/api/v1/properties/search', [])->assertForbidden();
    }

    public function test_active_contract_accepts_notes_with_unchanged_protected_values(): void
    {
        $contract = $this->draft();
        $this->prepare($contract);
        $contract->update(['status' => 'active']);
        $row = $this->postJson('/api/v1/contracts/search', [])->json('data.0');
        $this->postJson('/api/v1/contracts/mutate', ['mutate' => [['operation' => 'update', 'key' => $contract->id, 'version' => $row['updated_at'], 'attributes' => ['starts_on' => $contract->starts_on->toDateString(), 'unit_id' => $contract->unit_id, 'deposit' => $contract->deposit, 'notes' => 'Rückruf am Freitag']]]])->assertOk();
        $this->assertSame('Rückruf am Freitag', $contract->fresh()->notes);
    }

    public function test_primary_contact_is_unique_per_contract_role_and_assigns_partner_role(): void
    {
        $contract = $this->draft();
        $a = BusinessPartner::create(['code' => 'A', 'display_name' => 'A']);
        $b = BusinessPartner::create(['code' => 'B', 'display_name' => 'B']);
        $this->createRecord('contract-parties', ['contract_id' => $contract->id, 'business_partner_id' => $a->id, 'role' => 'tenant', 'is_primary' => true])->assertOk();
        $this->createRecord('contract-parties', ['contract_id' => $contract->id, 'business_partner_id' => $b->id, 'role' => 'tenant', 'is_primary' => true])->assertUnprocessable()->assertJsonValidationErrors('is_primary');
        $this->assertDatabaseCount('contract_parties', 1);
        $this->assertDatabaseHas('partner_roles', ['business_partner_id' => $a->id, 'role' => 'tenant']);
    }

    public function test_duplicate_partner_roles_return_validation_error(): void
    {
        $partner = BusinessPartner::create(['code' => 'ROLE', 'display_name' => 'Test']);
        $partner->roles()->create(['role' => 'tenant']);
        $this->createRecord('partner-roles', ['business_partner_id' => $partner->id, 'role' => 'tenant'])->assertUnprocessable()->assertJsonValidationErrors('role');
        $this->assertDatabaseCount('partner_roles', 1);
    }

    public function test_minimum_term_before_start_is_rejected(): void
    {
        $unit = Unit::factory()->create();
        $this->createRecord('contracts', ['code' => 'INVALID', 'unit_id' => $unit->id, 'starts_on' => '2026-01-01', 'minimum_term_until' => '2025-01-01'])->assertUnprocessable()->assertJsonValidationErrors('minimum_term_until');
        $this->assertDatabaseCount('contracts', 0);
    }
}
