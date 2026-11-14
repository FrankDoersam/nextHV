<?php

namespace Tests\Feature;

use App\Models\BusinessPartner;
use App\Models\Contract;
use App\Models\Unit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\TestWith;
use Tests\TestCase;

class ContractNestedCreationTest extends TestCase
{
    use RefreshDatabase;

    public function test_creates_a_contract_with_two_parties_and_two_conditions_in_one_mutation(): void
    {
        $this->actingAs(User::factory()->create());
        $payload = $this->payload();

        $response = $this->postJson('/api/v1/contracts/mutate', $payload)
            ->assertOk()
            ->assertJsonPath('records.0.code', 'MV-NESTED')
            ->assertJsonPath('records.0.status', 'draft');

        $contractId = $response->json('records.0.id');
        $this->assertDatabaseCount('contracts', 1);
        $this->assertDatabaseCount('contract_parties', 2);
        $this->assertDatabaseCount('rent_conditions', 2);
        $this->assertDatabaseCount('partner_roles', 2);
        $this->assertDatabaseHas('contract_parties', [
            'contract_id' => $contractId,
            'business_partner_id' => $payload['mutate'][0]['relations']['parties'][0]['attributes']['business_partner_id'],
            'role' => 'tenant',
            'is_primary' => true,
        ]);
        $this->assertDatabaseHas('contract_parties', [
            'contract_id' => $contractId,
            'business_partner_id' => $payload['mutate'][0]['relations']['parties'][1]['attributes']['business_partner_id'],
            'role' => 'tenant',
            'is_primary' => false,
        ]);
        $this->assertDatabaseHas('rent_conditions', ['contract_id' => $contractId, 'base_rent' => 800, 'service_charge' => 100]);
        $this->assertDatabaseHas('rent_conditions', ['contract_id' => $contractId, 'base_rent' => 850, 'service_charge' => 120]);
        $this->assertSame(['2026-01-01', '2027-01-01'], Contract::findOrFail($contractId)->conditions->map(fn ($condition): string => $condition->effective_from->format('Y-m-d'))->all());
    }

    public function test_invalid_child_attributes_return_422_without_creating_any_records(): void
    {
        $this->actingAs(User::factory()->create());
        $payload = $this->payload();
        $payload['mutate'][0]['relations']['conditions'][1]['attributes']['base_rent'] = -1;

        $this->postJson('/api/v1/contracts/mutate', $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('mutate.0.relations.conditions.1.attributes.base_rent');

        $this->assertNoContractWrites();
    }

    public function test_duplicate_parties_return_422_and_roll_back_the_contract_and_assigned_roles(): void
    {
        $this->actingAs(User::factory()->create());
        $payload = $this->payload();
        $payload['mutate'][0]['relations']['parties'][1]['attributes']['business_partner_id'] = $payload['mutate'][0]['relations']['parties'][0]['attributes']['business_partner_id'];

        $this->postJson('/api/v1/contracts/mutate', $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['mutate.0.relations.parties.1.attributes.business_partner_id' => 'Dieser Beteiligte ist bereits zugeordnet.']);

        $this->assertNoContractWrites();
    }

    public function test_duplicate_primary_contacts_return_422_and_roll_back_the_contract(): void
    {
        $this->actingAs(User::factory()->create());
        $payload = $this->payload();
        $payload['mutate'][0]['relations']['parties'][1]['attributes']['is_primary'] = true;

        $this->postJson('/api/v1/contracts/mutate', $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('mutate.0.relations.parties.1.attributes.is_primary');

        $this->assertNoContractWrites();
    }

    public function test_duplicate_condition_dates_return_422_and_roll_back_saved_siblings(): void
    {
        $this->actingAs(User::factory()->create());
        $payload = $this->payload();
        $payload['mutate'][0]['relations']['conditions'][1]['attributes']['effective_from'] = '2026-01-01';

        $this->postJson('/api/v1/contracts/mutate', $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['mutate.0.relations.conditions.1.attributes.effective_from' => 'Für diesen Stichtag gibt es bereits eine Kondition.']);

        $this->assertNoContractWrites();
    }

    #[TestWith(['2025-12-31'])]
    #[TestWith(['2028-01-01'])]
    public function test_condition_dates_outside_the_contract_return_422_and_roll_back_the_contract(string $effectiveFrom): void
    {
        $this->actingAs(User::factory()->create());
        $payload = $this->payload();
        $payload['mutate'][0]['relations']['conditions'][1]['attributes']['effective_from'] = $effectiveFrom;

        $this->postJson('/api/v1/contracts/mutate', $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['mutate.0.relations.conditions.1.attributes.effective_from' => 'Der Gültigkeitsbeginn muss innerhalb der Vertragslaufzeit liegen.']);

        $this->assertNoContractWrites();
    }

    public function test_a_standalone_party_still_requires_a_contract_reference(): void
    {
        $this->actingAs(User::factory()->create());
        $partner = BusinessPartner::create(['code' => 'PARTNER', 'display_name' => 'Mieter']);

        $this->postJson('/api/v1/contract-parties/mutate', [
            'mutate' => [['operation' => 'create', 'attributes' => ['business_partner_id' => $partner->id, 'role' => 'tenant']]],
        ])->assertUnprocessable()->assertJsonValidationErrors('mutate.0.attributes.contract_id');

        $this->assertDatabaseCount('contract_parties', 0);
        $this->assertDatabaseCount('partner_roles', 0);
    }

    public function test_a_standalone_condition_still_requires_a_contract_reference(): void
    {
        $this->actingAs(User::factory()->create());

        $this->postJson('/api/v1/rent-conditions/mutate', [
            'mutate' => [['operation' => 'create', 'attributes' => ['effective_from' => '2026-01-01', 'base_rent' => 800]]],
        ])->assertUnprocessable()->assertJsonValidationErrors('mutate.0.attributes.contract_id');

        $this->assertDatabaseCount('rent_conditions', 0);
    }

    #[TestWith(['parties'])]
    #[TestWith(['conditions'])]
    public function test_a_nested_contract_reference_cannot_redirect_a_child_to_another_contract(string $relation): void
    {
        $this->actingAs(User::factory()->create());
        $other = Contract::create(['code' => 'MV-EXISTING', 'unit_id' => Unit::factory()->create()->id, 'starts_on' => '2026-01-01']);
        $payload = $this->payload();
        $payload['mutate'][0]['relations'][$relation][0]['attributes']['contract_id'] = $other->id;

        $this->postJson('/api/v1/contracts/mutate', $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors("mutate.0.relations.{$relation}.0.attributes.contract_id");

        $this->assertDatabaseCount('contracts', 1);
        $this->assertDatabaseCount('contract_parties', 0);
        $this->assertDatabaseCount('rent_conditions', 0);
        $this->assertDatabaseCount('partner_roles', 0);
        $this->assertModelExists($other);
    }

    public function test_nested_mutation_requires_authentication(): void
    {
        $payload = $this->payload();

        $this->postJson('/api/v1/contracts/mutate', $payload)->assertUnauthorized();

        $this->assertNoContractWrites();
    }

    #[TestWith(['parties'])]
    #[TestWith(['conditions'])]
    public function test_contract_creation_does_not_allow_updating_existing_related_records(string $relation): void
    {
        $this->actingAs(User::factory()->create());
        $payload = $this->payload();
        $other = Contract::create(['code' => 'MV-EXISTING', 'unit_id' => Unit::factory()->create()->id, 'starts_on' => '2026-01-01']);
        $child = $other->{$relation}()->create($payload['mutate'][0]['relations'][$relation][0]['attributes']);
        $payload['mutate'][0]['relations'][$relation][0] = [
            'operation' => 'update',
            'key' => $child->id,
            'version' => $child->updated_at->toISOString(),
            'attributes' => $payload['mutate'][0]['relations'][$relation][0]['attributes'],
        ];

        $this->postJson('/api/v1/contracts/mutate', $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors("mutate.0.relations.{$relation}.0.operation");

        $this->assertDatabaseCount('contracts', 1);
        $this->assertDatabaseHas($child->getTable(), ['id' => $child->id, 'contract_id' => $other->id]);
        $this->assertSame(1, $other->{$relation}()->count());
    }

    private function payload(): array
    {
        $first = BusinessPartner::create(['code' => 'PARTNER-1', 'display_name' => 'Erster Mieter']);
        $second = BusinessPartner::create(['code' => 'PARTNER-2', 'display_name' => 'Zweiter Mieter']);

        return [
            'mutate' => [[
                'operation' => 'create',
                'attributes' => ['code' => 'MV-NESTED', 'unit_id' => Unit::factory()->create()->id, 'starts_on' => '2026-01-01', 'ends_on' => '2027-12-31'],
                'relations' => [
                    'parties' => [
                        ['operation' => 'create', 'attributes' => ['business_partner_id' => $first->id, 'role' => 'tenant', 'is_primary' => true]],
                        ['operation' => 'create', 'attributes' => ['business_partner_id' => $second->id, 'role' => 'tenant', 'is_primary' => false]],
                    ],
                    'conditions' => [
                        ['operation' => 'create', 'attributes' => ['effective_from' => '2026-01-01', 'base_rent' => 800, 'service_charge' => 100]],
                        ['operation' => 'create', 'attributes' => ['effective_from' => '2027-01-01', 'base_rent' => 850, 'service_charge' => 120]],
                    ],
                ],
            ]],
            'response' => (object) [],
        ];
    }

    private function assertNoContractWrites(): void
    {
        $this->assertDatabaseCount('contracts', 0);
        $this->assertDatabaseCount('contract_parties', 0);
        $this->assertDatabaseCount('rent_conditions', 0);
        $this->assertDatabaseCount('partner_roles', 0);
    }
}
