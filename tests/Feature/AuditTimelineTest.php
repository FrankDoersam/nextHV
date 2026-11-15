<?php

namespace Tests\Feature;

use App\Models\AuditEvent;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Tests\TestCase;

class AuditTimelineTest extends TestCase
{
    use RefreshDatabase;

    public function test_native_mutations_record_actor_and_changes_but_not_unapproved_fields(): void
    {
        $user = User::factory()->create(['name' => 'Verwalterin']);
        $this->actingAs($user);
        $property = Property::factory()->create(['name' => 'Alt']);
        $property->update(['name' => 'Neu', 'notes' => 'GEHEIM']);
        $response = $this->getJson('/api/v1/resource-features/properties/'.$property->id.'/audit')->assertOk();
        $response->assertJsonPath('data.0.actor', 'Verwalterin')->assertJsonPath('data.0.event', 'updated')->assertJsonPath('data.0.changes.0.before', 'Alt')->assertJsonPath('data.0.changes.0.after', 'Neu')->assertDontSee('GEHEIM');
        $count = AuditEvent::count();
        DB::beginTransaction();
        $property->update(['name' => 'Rollback']);
        DB::rollBack();
        $this->assertSame($count, AuditEvent::count());
    }

    public function test_history_respects_authorization_and_uses_non_overlapping_cursor_pages(): void
    {
        $property = Property::factory()->create();
        $url = '/api/v1/resource-features/properties/'.$property->id.'/audit';
        $this->getJson($url)->assertUnauthorized();
        $this->actingAs(User::factory()->create());
        for ($i = 0; $i < 23; $i++) {
            $property->update(['name' => 'Name '.$i]);
        }
        $first = $this->getJson($url)->assertOk()->assertJsonCount(20, 'data');
        $second = $this->getJson($url.'?before='.$first->json('next_cursor'))->assertOk();
        $this->assertEmpty(array_intersect(array_column($first->json('data'), 'id'), array_column($second->json('data'), 'id')));
        Gate::before(fn () => false);
        $this->getJson($url)->assertForbidden();
    }
}
