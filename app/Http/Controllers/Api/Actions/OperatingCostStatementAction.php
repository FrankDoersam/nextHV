<?php

namespace App\Http\Controllers\Api\Actions;

use App\Http\Controllers\Controller;
use App\Http\Requests\Finance\ApplyExternalHeatingCostRequest;
use App\Http\Requests\Finance\EmptyJsonApiActionRequest;
use App\Http\Requests\Finance\GenerateOperatingCostStatementsRequest;
use App\Models\Contract;
use App\Models\Document;
use App\Models\OperatingCostStatement;
use App\Models\OperatingCostStatementUnit;
use App\Models\Property;
use App\Services\OperatingCosts\OperatingCostStatementCandidateService;
use App\Reports\OperatingCostStatementPdfReport;
use App\Services\OperatingCosts\ExternalHeatingCostService;
use App\Services\OperatingCosts\OperatingCostStatementDocumentArchiveService;
use App\Services\OperatingCosts\OperatingCostStatementOpenItemService;
use App\Services\OperatingCosts\OperatingCostStatementService;
use App\Services\OperatingCosts\OperatingCostStatementTemplateService;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Throwable;

class OperatingCostStatementAction extends Controller
{
    public function createProperties(OperatingCostStatementCandidateService $candidates): JsonResponse
    {
        $this->authorize('viewAny', Property::class);

        return response()->json([
            'jsonapi' => ['version' => '1.1'],
            'meta' => ['properties' => $candidates->properties()],
        ], 200, [
            'Content-Type' => 'application/vnd.api+json',
            'Cache-Control' => 'private, no-store',
        ]);
    }

    public function candidates(Request $request, OperatingCostStatementCandidateService $candidates): JsonResponse
    {
        $this->authorize('viewAny', Contract::class);
        $values = $request->validate([
            'propertyId' => ['required', 'uuid', Rule::exists('properties', 'id')->whereNull('deleted_at')],
            'periodFrom' => ['required', 'date_format:Y-m-d'],
            'periodUntil' => ['required', 'date_format:Y-m-d', 'after_or_equal:periodFrom'],
        ]);
        $property = Property::query()->findOrFail($values['propertyId']);
        $this->authorize('view', $property);

        return response()->json([
            'jsonapi' => ['version' => '1.1'],
            'meta' => ['contracts' => $candidates->contracts(
                $property,
                CarbonImmutable::parse($values['periodFrom']),
                CarbonImmutable::parse($values['periodUntil']),
            )],
        ], 200, [
            'Content-Type' => 'application/vnd.api+json',
            'Cache-Control' => 'private, no-store',
        ]);
    }

    public function generate(GenerateOperatingCostStatementsRequest $request): JsonResponse
    {
        $values = $request->safe()->except('meta');
        $property = Property::query()->findOrFail($values['propertyId']);
        $from = Carbon::parse($values['periodFrom'])->startOfDay();
        $until = Carbon::parse($values['periodUntil'])->startOfDay();
        $createdOn = isset($values['createdOn'])
            ? Carbon::parse($values['createdOn'])->startOfDay()
            : Carbon::today();
        $contractIds = collect($values['contractIds'])->unique()->values();
        $contracts = Contract::query()->with([
            'mainUnit.property',
            'units.unit.property',
            'parties.businessPartner.personProfile',
            'parties.businessPartner.organizationProfile',
            'parties.businessPartner.addresses',
            'parties.businessPartner.communicationChannels',
            'conditions',
            'terminations',
            'refundBankAccount.businessPartner',
        ])->whereIn('id', $contractIds)->get()->keyBy('id');
        if ($contracts->count() !== $contractIds->count() || $contracts->contains(function (Contract $contract) use ($property): bool {
            $unit = $contract->effectiveMainUnit();

            return in_array((string) $contract->contract_type, Contract::ANCILLARY_NOTICE_TYPES, true)
                || (string) $unit?->property_id !== (string) $property->id
                || $unit?->unit_type !== 'apartment'
                || ! $unit?->operating_cost_billable;
        })) {
            throw ValidationException::withMessages(['contractIds' => 'Mindestens ein Vertrag passt nicht zu einer für Betriebskosten freigegebenen Wohnung des ausgewählten Objekts.']);
        }

        $storedPaths = [];
        try {
            $statement = DB::transaction(function () use (
                $property,
                $from,
                $until,
                $createdOn,
                $contractIds,
                $contracts,
                &$storedPaths,
            ): OperatingCostStatement {
                $statement = OperatingCostStatement::query()->create([
                    'property_id' => $property->id,
                    'status' => 'created',
                    'period_from' => $from,
                    'period_until' => $until,
                    'created_on' => $createdOn,
                    'header_text_snapshot' => null,
                    'footer_text_snapshot' => null,
                    'input_snapshot' => [
                        'propertyId' => $property->id,
                        'contractIds' => $contractIds->all(),
                        'billingMode' => $property->billing_mode,
                        'settlementBankAccountId' => $property->settlement_bank_account_id,
                        'documentSnapshotSchemaVersion' => OperatingCostStatementTemplateService::DOCUMENT_SCHEMA_VERSION,
                    ],
                ]);
                $templates = app(OperatingCostStatementTemplateService::class);
                $cost = $advance = $balance = 0.0;

                foreach ($contractIds as $contractId) {
                    /** @var Contract $contract */
                    $contract = $contracts->get($contractId);
                    $snapshot = app()->makeWith(OperatingCostStatementService::class, [
                        'contractId' => $contractId,
                        'periodFrom' => $from,
                        'periodUntil' => $until,
                    ])->calculate();
                    $summary = $snapshot['summary'];
                    $documentSnapshot = $templates->freeze($contract, $snapshot, $createdOn);

                    $statementUnit = $statement->units()->create([
                        'unit_id' => $contract->effectiveMainUnitId(),
                        'contract_id' => $contract->id,
                        'tenant_name' => $contract->tenant_labels,
                        'calculation_snapshot' => $snapshot,
                        'document_snapshot' => $documentSnapshot,
                        'cost_total' => $summary['costTotal'],
                        'advance_total' => $summary['advanceTotal'],
                        'advance_scope' => data_get($snapshot, 'property.statementBillingMode'),
                        'balance' => $summary['balance'],
                    ]);
                    $archive = app(OperatingCostStatementDocumentArchiveService::class)->archive(
                        $statementUnit,
                        auth()->id() === null ? null : (string) auth()->id(),
                    );
                    $storedPaths[] = ['disk' => $archive->disk, 'path' => $archive->path];
                    $cost += $summary['costTotal'];
                    $advance += $summary['advanceTotal'];
                    $balance += $summary['balance'];
                }

                $statement->update([
                    'cost_total' => round($cost, 2),
                    'advance_total' => round($advance, 2),
                    'balance_total' => round($balance, 2),
                    'calculation_snapshot' => [
                        'schemaVersion' => 4,
                        'contracts' => $contractIds->count(),
                        'unitCalculationSchemaVersion' => 10,
                        'documentSnapshotSchemaVersion' => OperatingCostStatementTemplateService::DOCUMENT_SCHEMA_VERSION,
                    ],
                ]);

                return $statement;
            });
        } catch (Throwable $exception) {
            foreach ($storedPaths as $storedPath) {
                Storage::disk($storedPath['disk'])->delete($storedPath['path']);
            }

            throw $exception;
        }

        return response()->json([
            'jsonapi' => ['version' => '1.1'],
            'data' => $statement->units()->get(['id'])->map(fn (OperatingCostStatementUnit $unit): array => [
                'type' => 'operating-cost-statement-units',
                'id' => (string) $unit->id,
            ])->values(),
            'meta' => ['created' => $statement->units()->count()],
        ], 201, ['Content-Type' => 'application/vnd.api+json']);
    }

    public function pdf(
        OperatingCostStatementUnit $statementUnit,
        OperatingCostStatementPdfReport $report,
        OperatingCostStatementDocumentArchiveService $archive,
    ): Response {
        $statementUnit->load(['statement', 'unit', 'contract']);
        $snapshot = (array) ($statementUnit->document_snapshot ?? []);
        $documentId = trim((string) ($snapshot['archiveDocumentId'] ?? ''));
        $filename = $report->filename($statementUnit);

        if ($documentId !== '') {
            $document = Document::query()->find($documentId);
            if (! $document
                || $document->documentable_type !== $statementUnit->getMorphClass()
                || (string) $document->documentable_id !== (string) $statementUnit->id) {
                abort(404, 'Das archivierte Original-PDF der Abrechnung ist nicht verfügbar.');
            }

            $expectedHash = $archive->snapshotHash($statementUnit);
            $archivedHash = (string) ($snapshot['archiveContentHash'] ?? '');
            $storedHash = (string) data_get($document->metadata, 'contentHash', '');

            if ($expectedHash === $archivedHash && $expectedHash === $storedHash) {
                if (! Storage::disk($document->disk)->exists($document->path)) {
                    abort(404, 'Die archivierte Originaldatei der Abrechnung ist nicht verfügbar.');
                }

                return response(Storage::disk($document->disk)->get($document->path), 200, [
                    'Content-Type' => 'application/pdf',
                    'Content-Disposition' => 'inline; filename="'.($document->original_name ?: $filename).'"',
                    'Cache-Control' => 'private, no-store',
                ]);
            }
        }

        // Legacy rows, or a deliberately revised draft snapshot, render exclusively
        // from their stored calculation/document state—not current master settings.
        return response($report->render($statementUnit), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'inline; filename="'.$filename.'"',
            'Cache-Control' => 'private, no-store',
        ]);
    }

    public function createOpenItem(EmptyJsonApiActionRequest $request, OperatingCostStatementUnit $statementUnit, OperatingCostStatementOpenItemService $openItems): JsonResponse
    {
        $updated = $openItems->create($statementUnit);
        return response()->json(['jsonapi' => ['version' => '1.1'], 'data' => ['type' => 'operating-cost-statement-units', 'id' => (string) $updated->id]], 201, ['Content-Type' => 'application/vnd.api+json']);
    }

    public function destroyOpenItem(OperatingCostStatementUnit $statementUnit, OperatingCostStatementOpenItemService $openItems): JsonResponse
    {
        $updated = $openItems->deleteOpenItem($statementUnit);
        return response()->json(['jsonapi' => ['version' => '1.1'], 'data' => ['type' => 'operating-cost-statement-units', 'id' => (string) $updated->id]], 200, ['Content-Type' => 'application/vnd.api+json']);
    }

    public function externalHeating(ApplyExternalHeatingCostRequest $request, OperatingCostStatementUnit $statementUnit, ExternalHeatingCostService $service): JsonResponse
    {
        $values = $request->safe()->except('meta');
        $updated = $service->apply($statementUnit, (float) $values['amount'], $values['advanceScope']);
        return response()->json(['jsonapi' => ['version' => '1.1'], 'data' => ['type' => 'operating-cost-statement-units', 'id' => (string) $updated->id, 'attributes' => ['externalHeatingCostAmount' => $updated->external_heating_cost_amount === null ? null : (float) $updated->external_heating_cost_amount, 'advanceScope' => $updated->advance_scope, 'costTotal' => (float) $updated->cost_total, 'advanceTotal' => (float) $updated->advance_total, 'balance' => (float) $updated->balance]]], 200, ['Content-Type' => 'application/vnd.api+json']);
    }
}
