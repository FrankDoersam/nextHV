<?php

namespace Tests\Feature;

use App\Domain\Property\Actions\BuildPropertyReport;
use App\Models\AuditEvent;
use App\Models\Property;
use App\Models\Unit;
use App\Models\User;
use App\Reports\Support\ReportPdfDocument;
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

    public function test_report_uses_fpdf_document_with_encoded_german_text_and_reserved_footer(): void
    {
        $document = new ReportPdfDocument('Objektbericht', 'OBJ-1');
        $this->assertInstanceOf(\FPDF::class, $document);
        $this->assertSame("M\xFCllerh\xF6fe", $document->encodeText('Müllerhöfe'));
        $this->assertEqualsWithDelta(270.0, $document->bodyBottom(), 0.001);
    }

    public function test_report_is_read_only_and_declares_a_downloadable_document_for_one_record(): void
    {
        $this->actingAs(User::factory()->create());
        $property = Property::factory()->create();
        $version = $property->updated_at;
        $events = AuditEvent::count();
        $this->postJson('/api/v1/properties/actions/report', ['resources' => [$property->id]])
            ->assertOk()->assertJsonPath('data.result.data.ui.mime', 'application/pdf')
            ->assertJsonPath('data.result.data.ui.name', 'objekt-'.$property->id.'.pdf');
        $this->assertTrue($property->fresh()->updated_at->equalTo($version));
        $this->assertSame($events, AuditEvent::count());
        $other = Property::factory()->create();
        $this->postJson('/api/v1/properties/actions/report', ['resources' => [$property->id, $other->id]])->assertUnprocessable();
    }
}
