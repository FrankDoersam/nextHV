<?php

namespace App\Services\OperatingCosts;

use App\Models\OperatingCostStatementUnit;
use App\Services\OperatingCosts\OperatingCostStatementDocumentArchiveService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Throwable;

final class ExternalHeatingCostService
{
    public const ADVANCE_SCOPES = ['operating_only', 'operating_and_heating'];
    private const SUPPORTED_CALCULATION_SCHEMA_VERSIONS = [9, 10];

    public function __construct(
        private readonly ActualAdvancePaymentService $advancePayments,
        private readonly OperatingCostStatementTemplateService $templates,
    ) {}

    public function apply(OperatingCostStatementUnit $row, float $amount, string $advanceScope): OperatingCostStatementUnit
    {
        $amount = round(max(0, $amount), 2);
        if (! in_array($advanceScope, self::ADVANCE_SCOPES, true)) {
            throw ValidationException::withMessages(['advanceScope' => 'Der ausgewählte Vorauszahlungsumfang ist ungültig.']);
        }
        if ($advanceScope === 'operating_and_heating' && $amount < 0.005) {
            throw ValidationException::withMessages(['advanceScope' => 'Heizkostenvorauszahlungen können nur berücksichtigt werden, wenn ein externer Heizkostenanteil übernommen wurde.']);
        }

        $storedPath = null;
        try {
            return DB::transaction(function () use ($row, $amount, $advanceScope, &$storedPath): OperatingCostStatementUnit {
                $row->refresh()->loadMissing([
                    'statement.property',
                    'contract.conditions',
                    'receivable',
                ]);
                if ($row->receivable_id) {
                    throw ValidationException::withMessages(['externalHeating' => 'Die externe HKA kann nicht mehr geändert werden, nachdem aus der Abrechnung ein offener Posten erzeugt wurde.']);
                }
                $property = $row->statement?->property;
                $billingMode = (string) ($property?->billing_mode ?: 'operating_and_heating');
                $heatingBillingType = (string) ($property?->heating_billing_type ?: 'internal');
                if (! in_array($billingMode, ['operating_and_heating', 'heating_only'], true) || $heatingBillingType === 'internal') {
                    throw ValidationException::withMessages(['externalHeating' => 'Die externe HKA kann nur bei einem Objekt mit externer Heizkostenabrechnung übernommen werden.']);
                }

                $snapshot = (array) ($row->calculation_snapshot ?? []);
                if (! in_array((int) ($snapshot['schemaVersion'] ?? 0), self::SUPPORTED_CALCULATION_SCHEMA_VERSIONS, true)) {
                    throw ValidationException::withMessages(['externalHeating' => 'Die Abrechnung besitzt keine unterstützte Berechnungsbasis und muss neu erstellt werden.']);
                }
                $contract = $row->contract;
                if (! $contract) {
                    throw ValidationException::withMessages(['externalHeating' => 'Der Abrechnung ist kein Vertrag zugeordnet.']);
                }

                $costs = collect((array) ($snapshot['costs'] ?? []))
                    ->reject(fn ($cost): bool => is_array($cost) && ($cost['sourceType'] ?? null) === 'external_hka')
                    ->values();
                if ($amount >= 0.005) {
                    $costs->push([
                        'category' => 'heating',
                        'label' => 'Heizkosten laut externer Heizkostenabrechnung',
                        'details' => 'Mieteranteil aus externer Heizkostenabrechnung; ohne weitere interne Umlage übernommen.',
                        'allocatedAmount' => $amount,
                        'sourceType' => 'external_hka',
                        'allocationKey' => 'external_hka',
                        'allocationKeyName' => 'Externe Heizkostenabrechnung',
                    ]);
                }
                $costTotal = round($costs->sum(fn ($cost): float => (float) data_get($cost, 'allocatedAmount', 0)), 2);
                $periodFrom = data_get($snapshot, 'period.from') ?: $row->statement?->period_from?->toDateString();
                $periodUntil = data_get($snapshot, 'period.until') ?: $row->statement?->period_until?->toDateString();
                $advance = $this->advancePayments->calculate($contract, $periodFrom, $periodUntil, $advanceScope);
                $advanceTotal = round((float) ($advance['total'] ?? 0), 2);
                $balance = round($costTotal - $advanceTotal, 2);

                $warnings = collect((array) data_get($snapshot, 'summary.warnings', []))
                    ->reject(fn ($warning): bool => str_contains((string) $warning, 'Heizkostenabrechnung ist am Objekt als extern'))
                    ->values();
                if ($amount < 0.005) {
                    $warnings->push('Heizkostenabrechnung ist am Objekt extern geführt; ein Mieteranteil aus der externen HKA wurde noch nicht übernommen.');
                }

                $summary = array_merge((array) ($snapshot['summary'] ?? []), [
                    'costTotal' => $costTotal,
                    'advanceTotal' => $advanceTotal,
                    'advanceDetails' => $advance['details'] ?? [],
                    'advanceGroups' => $advance['groups'] ?? [],
                    'advanceMonths' => $advance['months'] ?? [],
                    'paymentReceipts' => $advance['receipts'] ?? [],
                    'advanceSource' => $advance['source'] ?? 'none',
                    'balance' => $balance,
                    'label' => $balance >= 0 ? 'Nachzahlung' : 'Gutschrift',
                    'warnings' => $warnings->unique()->values()->all(),
                ]);
                $propertySnapshot = array_merge((array) ($snapshot['property'] ?? []), [
                    'statementBillingMode' => $advanceScope,
                    'heatingBillingType' => $heatingBillingType,
                    'hasHka' => $amount >= 0.005,
                ]);
                $sections = array_merge((array) ($snapshot['sections'] ?? []), ['heating' => $amount >= 0.005]);
                $snapshot = array_merge($snapshot, [
                    'costs' => $costs->all(),
                    'summary' => $summary,
                    'property' => $propertySnapshot,
                    'sections' => $sections,
                    'externalHeating' => [
                        'amount' => $amount,
                        'advanceScope' => $advanceScope,
                        'source' => 'manual_external_statement',
                        'updatedAt' => now()->toIso8601String(),
                    ],
                ]);

                $documentSnapshot = $this->templates->refreeze(
                    (array) ($row->document_snapshot ?? []),
                    $snapshot,
                );

                $row->forceFill([
                    'calculation_snapshot' => $snapshot,
                    'document_snapshot' => $documentSnapshot,
                    'cost_total' => $costTotal,
                    'advance_total' => $advanceTotal,
                    'balance' => $balance,
                    'external_heating_cost_amount' => $amount >= 0.005 ? $amount : null,
                    'advance_scope' => $advanceScope,
                ])->save();

                $statement = $row->statement;
                if ($statement) {
                    $statement->forceFill([
                        'cost_total' => round((float) $statement->units()->sum('cost_total'), 2),
                        'advance_total' => round((float) $statement->units()->sum('advance_total'), 2),
                        'balance_total' => round((float) $statement->units()->sum('balance'), 2),
                    ])->save();
                }

                $fresh = $row->fresh(['statement', 'unit', 'contract', 'receivable.allocations']);
                $archive = app(OperatingCostStatementDocumentArchiveService::class)->archive(
                    $fresh,
                    auth()->id() === null ? null : (string) auth()->id(),
                );
                $storedPath = ['disk' => $archive->disk, 'path' => $archive->path];

                return $fresh;
            });
        } catch (Throwable $exception) {
            if ($storedPath !== null) {
                Storage::disk($storedPath['disk'])->delete($storedPath['path']);
            }

            throw $exception;
        }
    }
}
