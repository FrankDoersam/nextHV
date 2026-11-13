<?php

namespace Tests\Feature;

use App\Framework\Crud\CloneService;
use App\Framework\Crud\CrudRuleExecutor;
use App\Framework\Crud\CrudRules;
use App\Framework\Crud\DeleteFilter;
use App\Models\BusinessPartner;
use App\Models\Contract;
use App\Models\IdentityDocument;
use App\Models\Property;
use App\Models\Unit;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\Gate;
use Tests\TestCase;

class AdvancedCrudTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAs(User::factory()->create());
    }

    private function contractFor(BusinessPartner $partner, string $code, bool $active = false): Contract
    {
        $unit = Unit::factory()->create();
        $starts = today()->subYear()->toDateString();
        $contract = Contract::create([
            'code' => $code,
            'unit_id' => $unit->id,
            'starts_on' => $starts,
            'ends_on' => today()->addMonth()->toDateString(),
        ]);
        $contract->parties()->create([
            'business_partner_id' => $partner->id,
            'role' => 'tenant',
        ]);
        $contract->conditions()->create([
            'effective_from' => $starts,
            'base_rent' => 700,
        ]);
        if ($active) {
            $contract->update(['status' => 'active']);
        }

        return $contract;
    }

    public function test_contract_delete_status_filter_guards_active_and_historical_contracts(): void
    {
        $partner = BusinessPartner::create(['code' => 'GP-A', 'display_name' => 'A']);
        $active = $this->contractFor($partner, 'MV-A', true);
        try {
            $active->delete();
            $this->fail('Active contracts must be protected.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('contract', $exception->errors());
        }

        $draft = $this->contractFor($partner, 'MV-B');
        $draft->delete();
        $this->assertSoftDeleted($draft);
    }

    public function test_partner_delete_only_blocks_active_contracts_via_nested_relation_filter(): void
    {
        $partner = BusinessPartner::create(['code' => 'GP-B', 'display_name' => 'B']);
        $contract = $this->contractFor($partner, 'MV-C');

        // A draft relationship is not a blocker.
        $check = BusinessPartner::crudRules()->deleteRestrictions()[0];
        $this->assertInstanceOf(DeleteFilter::class, $check['filter']);
        app(CrudRuleExecutor::class)->deleting($partner, BusinessPartner::crudRules());

        $contract->update(['status' => 'active']);
        try {
            $partner->delete();
            $this->fail('An active contractual relationship must prevent deletion.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('partner', $exception->errors());
        }
        $this->assertNotSoftDeleted($partner);

        // Historical but not active contracts do not trigger this particular restriction.
        $contract->update(['status' => 'ended']);
        $partner->delete();
        $this->assertSoftDeleted($partner);
    }

    public function test_and_or_and_in_filters_are_grouped_under_relation_scope(): void
    {
        $one = BusinessPartner::create(['code' => 'GP-C', 'display_name' => 'C']);
        $two = BusinessPartner::create(['code' => 'GP-D', 'display_name' => 'D']);
        $this->contractFor($one, 'MV-D');
        $this->contractFor($two, 'MV-E', true);

        $rules = CrudRules::make()->restrictDelete(
            'contractParties',
            'Mindestens eine passende Vertragsbeteiligung.',
            false,
            'partner',
            DeleteFilter::make()
                ->where('role', 'guarantor')
                ->orWhereHas('contract', DeleteFilter::make()->whereIn('status', ['active', 'ended'])),
        );

        // OR must not escape contractParties.business_partner_id.
        app(CrudRuleExecutor::class)->deleting($one, $rules);
        $this->expectException(ValidationException::class);
        app(CrudRuleExecutor::class)->deleting($two, $rules);
    }

    public function test_confirmed_termination_can_change_end_date_without_bypassing_other_guards(): void
    {
        $partner = BusinessPartner::create(['code' => 'GP-END', 'display_name' => 'Ende']);
        $contract = $this->contractFor($partner, 'MV-END', true);

        try {
            $contract->update(['ends_on' => today()->addYear()->toDateString()]);
            $this->fail('Direct edits to active contract end dates must be blocked.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('contract', $exception->errors());
        }

        $notice = $contract->terminations()->create([
            'declared_on' => today()->subDays(2)->toDateString(),
            'received_on' => today()->toDateString(),
            'requested_end_on' => today()->addDays(20)->toDateString(),
            'reason' => 'Einvernehmlich',
        ]);
        $this->assertSame('received', $notice->status);

        app(\App\Domain\Contract\Actions\ConfirmTermination::class)->handle(
            $notice,
            today()->addDays(20)->toDateString(),
        );
        $this->assertSame('ended', $contract->fresh()->status);
    }

    public function test_clone_service_copies_only_explicitly_allowlisted_relations(): void
    {
        $partner = BusinessPartner::create([
            'code' => 'GP-BASE',
            'display_name' => 'Erika Muster',
            'first_name' => 'Erika',
            'last_name' => 'Muster',
        ]);
        $partner->roles()->create(['role' => 'owner']);
        IdentityDocument::create([
            'business_partner_id' => $partner->id,
            'title' => 'Nachweis',
        ]);

        /** @var BusinessPartner $copy */
        $copy = app(CloneService::class)->handle(
            $partner,
            ['code' => 'GP-COPY', 'display_name' => 'Erika Kopie'],
            ['roles'],
        );
        $this->assertSame(1, $copy->roles()->count());
        $this->assertSame(0, $copy->identityDocuments()->count());
        $this->assertSame(0, $copy->contractParties()->count());
        $this->assertSame('Erika Muster', $copy->full_name);

        try {
            app(CloneService::class)->handle(
                $partner,
                ['code' => 'GP-INVALID', 'display_name' => 'Unzulässig'],
                ['identityDocuments'],
            );
            $this->fail('Non-allowlisted relations must never be copied.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('relations', $exception->errors());
        }
        $this->assertDatabaseMissing('business_partners', ['code' => 'GP-INVALID']);
    }

    public function test_clone_relation_may_copy_only_matching_entries(): void
    {
        Gate::policy(FilteredClonePartner::class, \App\Policies\BusinessPartnerPolicy::class);
        $partner = FilteredClonePartner::create(['code' => 'GP-FILTER', 'display_name' => 'Filter']);
        $partner->roles()->create(['role' => 'owner']);
        $partner->roles()->create(['role' => 'tenant']);

        /** @var FilteredClonePartner $copy */
        $copy = app(CloneService::class)->handle(
            $partner,
            ['code' => 'GP-FILTER-COPY', 'display_name' => 'Kopie'],
            ['roles'],
        );
        $this->assertSame(['owner'], $copy->roles()->pluck('role')->all());
    }

    public function test_default_property_clone_can_copy_units_but_never_contracts(): void
    {
        $property = Property::factory()->create(['code' => 'OBJ-SOURCE']);
        $unit = Unit::factory()->create(['property_id' => $property->id, 'code' => 'W-1']);
        Contract::create([
            'code' => 'MV-KEEP',
            'unit_id' => $unit->id,
            'starts_on' => today()->subYear()->toDateString(),
        ]);

        /** @var Property $copy */
        $copy = app(CloneService::class)->handle(
            $property,
            ['code' => 'OBJ-COPY', 'name' => 'Kopie'],
            ['units'],
        );
        $this->assertSame(1, $copy->units()->count());
        $this->assertSame(0, $copy->units()->first()->contracts()->count());
        $this->assertSame('ready', $copy->units()->first()->status->value);
    }

    public function test_full_name_is_virtual_and_read_only_in_the_api(): void
    {
        $partner = BusinessPartner::create([
            'code' => 'GP-NAME',
            'display_name' => 'Anzeigename',
            'first_name' => 'Max',
            'last_name' => 'Mustermann',
        ]);

        $this->assertSame('Max Mustermann', $partner->full_name);
        $this->assertArrayNotHasKey('full_name', $partner->getAttributes());

        $this->postJson('/api/v1/business-partners/search', [
            'search' => ['filters' => [['field' => 'id', 'value' => $partner->id]]],
        ])->assertOk()->assertJsonPath('data.0.full_name', 'Max Mustermann');
    }

    public function test_business_partner_summary_action_returns_message_record_and_navigation(): void
    {
        $partner = BusinessPartner::create([
            'code' => 'GP-SUMMARY',
            'display_name' => 'Max',
            'first_name' => 'Max',
            'last_name' => 'Muster',
        ]);
        $this->contractFor($partner, 'MV-SUMMARY', true);

        $response = $this->postJson('/api/v1/business-partners/actions/summary', [
            'resources' => [$partner->id],
            'fields' => [['name' => 'include_roles', 'value' => true]],
        ])->assertOk();

        $response->assertJsonPath('data.result.data.record.full_name', 'Max Muster')
            ->assertJsonPath('data.result.data.record.active_contracts', 1)
            ->assertJsonPath('data.result.data.navigate.resource', 'business-partners')
            ->assertJsonPath('data.result.data.navigate.id', $partner->id);

        $this->assertSame('Max Muster', $response->json('data.result.data.record.full_name'));
        $this->assertIsString($response->json('data.result.data.message'));
    }

    public function test_clone_business_partner_action_with_roles(): void
    {
        $partner = BusinessPartner::create(['code' => 'GP-ORIGINAL', 'display_name' => 'Original']);
        $partner->roles()->create(['role' => 'owner']);

        $this->postJson('/api/v1/business-partners/actions/clone', [
            'resources' => [$partner->id],
            'fields' => [
                ['name' => 'code', 'value' => 'GP-NEW'],
                ['name' => 'display_name', 'value' => 'Kopie'],
                ['name' => 'with_roles', 'value' => true],
            ],
        ])->assertOk();

        $copy = BusinessPartner::where('code', 'GP-NEW')->firstOrFail();
        $this->assertSame('Kopie', $copy->display_name);
        $this->assertSame(1, $copy->roles()->count());
    }
}


class FilteredClonePartner extends BusinessPartner
{
    protected $table = 'business_partners';

    public static function crudRules(): CrudRules
    {
        return CrudRules::make()
            ->cloneUnique(['code'])
            ->cloneRelation('roles', [], false, fn (Builder $query) => $query->where('role', 'owner'));
    }
}
