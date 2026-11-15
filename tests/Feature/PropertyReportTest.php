<?php

namespace Tests\Feature;

use App\Domain\Property\Actions\BuildPropertyReport;
use App\Models\Property;
use App\Models\Unit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PropertyReportTest extends TestCase
{
    use RefreshDatabase;

    public function test_report_action_declares_sheet_and_renderer_paginates_long_unit_lists(): void
    {
        $this->actingAs(User::factory()->create());
        $property = Property::factory()->create(['name' => 'Müllerhöfe am Park']);
        Unit::factory()->count(60)->create(['property_id' => $property->id, 'name' => str_repeat('Geräumige Wohnung mit Balkon ', 4)]);
        $this->postJson('/api/v1/properties/actions/report', ['resources' => [$property->id]])->assertOk()->assertJsonPath('data.result.data.ui.presentation', 'sheet');
        $pdf = app(BuildPropertyReport::class)->handle($property);
        $this->assertStringStartsWith('%PDF-', $pdf);
        preg_match_all('~/Type /Page\b~', $pdf, $pages);
        $this->assertGreaterThan(2, count($pages[0]));
    }
}
