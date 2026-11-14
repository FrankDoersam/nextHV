<?php

namespace Tests\Feature;

use App\Models\Property;
use App\Models\Unit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GroupedCountsTest extends TestCase
{
    use RefreshDatabase;

    public function test_groups_count_the_full_filtered_dataset_not_only_one_page(): void
    {
        $this->actingAs(User::factory()->create());
        $property = Property::factory()->create(['name' => 'Nordhof']);
        $other = Property::factory()->create(['name' => 'Südhof']);

        Unit::factory()->count(12)->create([
            'property_id' => $property->id,
            'status' => 'ready',
        ]);
        Unit::factory()->count(3)->create([
            'property_id' => $property->id,
            'status' => 'maintenance',
        ]);
        Unit::factory()->count(4)->create([
            'property_id' => $other->id,
            'status' => 'maintenance',
        ]);

        $this->postJson('/api/v1/units/search', [
            'search' => [
                'page' => 1,
                'limit' => 10,
                'filters' => [['field' => 'property_id', 'value' => $property->id]],
            ],
        ])->assertOk()->assertJsonPath('total', 15);

        $response = $this->postJson('/api/v1/units/metrics/groups', [
            'group' => 'status',
            'search' => [
                'filters' => [['field' => 'property_id', 'value' => $property->id]],
            ],
        ]);

        $response->assertOk()->assertJsonPath('data.total', 15)
            ->assertJsonPath('data.field', 'status');
        $groups = collect($response->json('data.groups'))->pluck('count', 'value')->all();
        $this->assertSame(['maintenance' => 3, 'ready' => 12], $groups);
    }

    public function test_group_fields_must_be_explicitly_whitelisted(): void
    {
        $this->actingAs(User::factory()->create());

        $this->postJson('/api/v1/units/metrics/groups', [
            'group' => 'property.name',
            'search' => [],
        ])->assertUnprocessable()->assertJsonValidationErrors('group');

        $this->postJson('/api/v1/units/metrics/groups', [
            'group' => 'id',
            'search' => [],
        ])->assertUnprocessable()->assertJsonValidationErrors('group');
    }
}
