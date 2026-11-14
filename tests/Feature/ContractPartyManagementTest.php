<?php

namespace Tests\Feature;

use App\Models\BusinessPartner;
use App\Models\Contract;
use App\Models\ContractParty;
use App\Models\Unit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\TestWith;
use Tests\TestCase;

class ContractPartyManagementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAs(User::factory()->create());
    }

    #[TestWith(['draft'])]
    #[TestWith(['active'])]
    #[TestWith(['ended'])]
    public function test_adds_parties_in_every_contract_state_and_assigns_the_partner_role(string $status): void
    {
        $contract = $this->contract($status);
        $partner = $this->partner('ADDED');

        $this->postJson('/api/v1/contract-parties/mutate', [
            'mutate' => [['operation' => 'create', 'attributes' => ['contract_id' => $contract->id, 'business_partner_id' => $partner->id, 'role' => 'guarantor', 'is_primary' => true]]],
            'response' => (object) [],
        ])->assertOk()->assertJsonPath('records.0.role', 'guarantor');

        $this->assertDatabaseHas('contract_parties', ['contract_id' => $contract->id, 'business_partner_id' => $partner->id, 'role' => 'guarantor', 'is_primary' => true]);
        $this->assertDatabaseHas('partner_roles', ['business_partner_id' => $partner->id, 'role' => 'guarantor']);
    }

    #[TestWith(['draft'])]
    #[TestWith(['active'])]
    #[TestWith(['ended'])]
    public function test_edits_and_deletes_an_additional_party_in_every_contract_state(string $status): void
    {
        $contract = $this->contract($status);
        $party = $contract->parties()->create(['business_partner_id' => $this->partner('OLD')->id, 'role' => 'owner']);
        $replacement = $this->partner('NEW');

        $this->updateParty($party, ['business_partner_id' => $replacement->id, 'role' => 'guarantor', 'is_primary' => true])->assertOk()->assertJsonPath('records.0.business_partner_id', $replacement->id);

        $this->assertDatabaseHas('contract_parties', ['id' => $party->id, 'business_partner_id' => $replacement->id, 'role' => 'guarantor', 'is_primary' => true]);
        $this->assertDatabaseHas('partner_roles', ['business_partner_id' => $replacement->id, 'role' => 'guarantor']);
        $this->deleteParties([$party->id])->assertOk();
        $this->assertModelMissing($party);
    }

    public function test_rejects_duplicate_partners_and_a_second_primary_contact_on_active_contracts(): void
    {
        $contract = $this->contract('active');
        $tenant = $contract->parties()->firstOrFail();
        $this->updateParty($tenant, ['is_primary' => true])->assertOk();
        $other = $this->partner('OTHER');

        $this->postJson('/api/v1/contract-parties/mutate', ['mutate' => [['operation' => 'create', 'attributes' => ['contract_id' => $contract->id, 'business_partner_id' => $tenant->business_partner_id, 'role' => 'tenant']]]])
            ->assertUnprocessable()->assertJsonValidationErrors(['business_partner_id' => 'Dieser Beteiligte ist bereits zugeordnet.']);
        $this->postJson('/api/v1/contract-parties/mutate', ['mutate' => [['operation' => 'create', 'attributes' => ['contract_id' => $contract->id, 'business_partner_id' => $other->id, 'role' => 'tenant', 'is_primary' => true]]]])
            ->assertUnprocessable()->assertJsonValidationErrors(['is_primary' => 'Pro Rolle kann nur ein Hauptansprechpartner bestimmt werden.']);

        $this->assertDatabaseCount('contract_parties', 1);
        $this->assertDatabaseMissing('partner_roles', ['business_partner_id' => $other->id, 'role' => 'tenant']);
    }

    public function test_rejects_changing_the_last_active_tenant_to_another_role(): void
    {
        $tenant = $this->contract('active')->parties()->firstOrFail();

        $this->updateParty($tenant, ['role' => 'owner'])->assertUnprocessable()->assertJsonValidationErrors(['role' => 'Ein aktiver Vertrag benötigt mindestens einen Mieter.']);

        $this->assertDatabaseHas('contract_parties', ['id' => $tenant->id, 'role' => 'tenant']);
        $this->assertDatabaseMissing('partner_roles', ['business_partner_id' => $tenant->business_partner_id, 'role' => 'owner']);
    }

    public function test_rejects_deleting_the_last_active_tenant(): void
    {
        $tenant = $this->contract('active')->parties()->firstOrFail();

        $this->deleteParties([$tenant->id])->assertUnprocessable()->assertJsonValidationErrors(['role' => 'Ein aktiver Vertrag benötigt mindestens einen Mieter.']);

        $this->assertModelExists($tenant);
    }

    public function test_allows_a_tenant_role_change_or_deletion_when_another_active_tenant_remains(): void
    {
        $contract = $this->contract('active');
        $remaining = $contract->parties()->firstOrFail();
        $party = $contract->parties()->create(['business_partner_id' => $this->partner('SECOND')->id, 'role' => 'tenant']);

        $this->updateParty($party, ['role' => 'owner'])->assertOk();
        $this->assertDatabaseHas('contract_parties', ['id' => $party->id, 'role' => 'owner']);
        $this->updateParty($party->fresh(), ['role' => 'tenant'])->assertOk();
        $this->deleteParties([$party->id])->assertOk();

        $this->assertModelMissing($party);
        $this->assertModelExists($remaining);
    }

    public function test_bulk_deletion_rolls_back_when_it_would_remove_all_active_tenants(): void
    {
        $contract = $this->contract('active');
        $first = $contract->parties()->firstOrFail();
        $second = $contract->parties()->create(['business_partner_id' => $this->partner('SECOND')->id, 'role' => 'tenant']);

        $this->deleteParties([$first->id, $second->id])->assertUnprocessable()->assertJsonValidationErrors('role');

        $this->assertModelExists($first);
        $this->assertModelExists($second);
    }

    #[TestWith(['draft'])]
    #[TestWith(['ended'])]
    public function test_allows_removing_the_only_tenant_from_nonactive_contracts(string $status): void
    {
        $tenant = $this->contract($status)->parties()->firstOrFail();

        $this->deleteParties([$tenant->id])->assertOk();

        $this->assertModelMissing($tenant);
    }

    public function test_contract_reference_remains_immutable(): void
    {
        $tenant = $this->contract('active')->parties()->firstOrFail();
        $other = $this->contract('draft');

        $this->updateParty($tenant, ['contract_id' => $other->id])->assertUnprocessable()->assertJsonValidationErrors(['mutate.0.attributes' => 'Diese Angabe darf bei dieser Aktion nicht geändert werden.']);

        $this->assertDatabaseHas('contract_parties', ['id' => $tenant->id, 'contract_id' => $tenant->contract_id]);
    }

    private function partner(string $code): BusinessPartner
    {
        return BusinessPartner::create(['code' => $code, 'display_name' => $code]);
    }

    private function contract(string $status): Contract
    {
        $contract = Contract::create(['code' => 'MV-'.$status, 'unit_id' => Unit::factory()->create()->id, 'starts_on' => '2026-01-01']);
        $contract->parties()->create(['business_partner_id' => $this->partner('TENANT-'.$status)->id, 'role' => 'tenant']);
        $contract->update(['status' => $status, 'ends_on' => $status === 'ended' ? '2026-10-31' : null]);

        return $contract;
    }

    private function updateParty(ContractParty $party, array $attributes): TestResponse
    {
        return $this->postJson('/api/v1/contract-parties/mutate', [
            'mutate' => [['operation' => 'update', 'key' => $party->id, 'version' => $party->updated_at->toISOString(), 'attributes' => $attributes]],
            'response' => (object) [],
        ]);
    }

    private function deleteParties(array $ids): TestResponse
    {
        return $this->deleteJson('/api/v1/contract-parties', ['resources' => $ids]);
    }
}
