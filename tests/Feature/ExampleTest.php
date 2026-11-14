<?php

namespace Tests\Feature;

// use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExampleTest extends TestCase
{
    /**
     * A basic test example.
     */
    public function test_the_application_returns_a_successful_response(): void
    {
        $response = $this->withoutVite()->get('/');

        $response->assertStatus(200);
    }

    public function test_a_missing_vite_chunk_is_not_rewritten_to_the_app_page(): void
    {
        $this->withoutVite()
            ->get('/build/assets/form-layer-missing.js')
            ->assertNotFound();
    }

    public function test_a_resource_deep_link_still_serves_the_app_page(): void
    {
        $this->withoutVite()
            ->get('/contracts/123')
            ->assertOk();
    }
}
