<?php

namespace App\Http\Controllers;

use App\Domain\Property\Actions\BuildPropertyReport;
use App\Domain\Property\Actions\CloneDefaults;
use App\Models\Property;
use App\Models\Unit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

class PropertyOperationsController extends Controller
{
    public function propertyCloneDefaults(Property $property, CloneDefaults $defaults): JsonResponse
    {
        Gate::authorize('view', $property);
        Gate::authorize('create', Property::class);

        return response()->json(['data' => $defaults->handle($property)]);
    }

    public function unitCloneDefaults(Unit $unit, CloneDefaults $defaults): JsonResponse
    {
        Gate::authorize('view', $unit);
        Gate::authorize('create', Unit::class);

        return response()->json(['data' => $defaults->handle($unit)]);
    }

    public function report(Request $request, Property $property, BuildPropertyReport $report): Response
    {
        Gate::authorize('view', $property);
        abort_unless((int) $request->query('user') === $request->user()->id, 403);

        return response($report->handle($property))->header('Content-Type', 'application/pdf')->header('Content-Disposition', 'inline; filename="objekt-'.$property->id.'.pdf"')->header('Cache-Control', 'private, no-store')->header('X-Content-Type-Options', 'nosniff');
    }
}
