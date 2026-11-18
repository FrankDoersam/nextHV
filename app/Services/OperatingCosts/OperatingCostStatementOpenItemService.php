<?php

namespace App\Services\OperatingCosts;

use App\Models\OperatingCostStatementUnit;
use App\Models\Receivable;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class OperatingCostStatementOpenItemService
{
    public function create(OperatingCostStatementUnit $statementUnit): OperatingCostStatementUnit
    {
        return DB::transaction(function () use ($statementUnit): OperatingCostStatementUnit {
            $locked = OperatingCostStatementUnit::query()
                ->with(['statement.property', 'unit', 'contract', 'receivable.allocations'])
                ->lockForUpdate()
                ->findOrFail($statementUnit->id);

            if ($locked->receivable) {
                return $this->freshStatementUnit($locked->id);
            }

            if (abs((float) $locked->balance) < 0.005) {
                throw ValidationException::withMessages([
                    'statement' => 'Für ausgeglichene Abrechnungen wird kein offener Abrechnungsposten erstellt.',
                ]);
            }

            $idempotencyKey = $this->idempotencyKey($locked);
            $receivable = Receivable::withTrashed()->where('idempotency_key', $idempotencyKey)->first();
            if (! $receivable) {
                $receivable = new Receivable();
                $receivable->number = $this->number($locked);
                $receivable->idempotency_key = $idempotencyKey;
            } elseif ($receivable->trashed()) {
                $receivable->restore();
            }

            $receivable->fill($this->values($locked));
            $receivable->save();
            $locked->forceFill(['receivable_id' => $receivable->id])->save();

            return $this->freshStatementUnit($locked->id);
        }, 3);
    }

    public function deleteOpenItem(OperatingCostStatementUnit $statementUnit): OperatingCostStatementUnit
    {
        return DB::transaction(function () use ($statementUnit): OperatingCostStatementUnit {
            $locked = OperatingCostStatementUnit::query()
                ->with(['statement.property', 'unit', 'contract', 'receivable.allocations'])
                ->lockForUpdate()
                ->findOrFail($statementUnit->id);

            if (! $locked->receivable) {
                return $this->freshStatementUnit($locked->id);
            }

            if ($locked->receivable->allocations->isNotEmpty()) {
                throw ValidationException::withMessages([
                    'openItem' => 'Der offene Abrechnungsposten kann nicht gelöscht werden, weil bereits Zahlungsbuchungen darauf verweisen.',
                ]);
            }

            $receivable = $locked->receivable;
            $locked->forceFill(['receivable_id' => null])->save();
            $receivable->delete();

            return $this->freshStatementUnit($locked->id);
        }, 3);
    }

    public function deleteStatementUnit(OperatingCostStatementUnit $statementUnit): void
    {
        DB::transaction(function () use ($statementUnit): void {
            $locked = OperatingCostStatementUnit::query()
                ->with(['statement', 'receivable.allocations'])
                ->lockForUpdate()
                ->findOrFail($statementUnit->id);

            if ($locked->receivable?->allocations?->isNotEmpty()) {
                throw ValidationException::withMessages([
                    'statement' => 'Die Abrechnung kann wegen vorhandener Zahlungsbuchungen nicht gelöscht werden.',
                ]);
            }

            $statement = $locked->statement;
            $locked->receivable?->delete();
            $locked->delete();

            if ($statement && ! $statement->units()->exists()) {
                $statement->delete();
            }
        }, 3);
    }

    public function serialize(OperatingCostStatementUnit $row): array
    {
        $receivable = $row->receivable;
        $allocationCount = $receivable
            ? ($receivable->relationLoaded('allocations') ? $receivable->allocations->count() : $receivable->allocations()->count())
            : 0;
        $balance = round((float) $row->balance, 2);
        $openItemKind = $receivable?->isPayoutLike() || ($receivable === null && $balance < 0)
            ? 'credit'
            : ($receivable !== null || $balance > 0 ? 'receivable' : null);
        $openItemLabel = match ($openItemKind) {
            'credit' => 'Gutschrift',
            'receivable' => 'Nachzahlung',
            default => null,
        };
        $base = '/api/v1/operating-cost-statement-units/'.$row->id;

        return [
            'id' => (string) $row->id,
            'type' => 'operating-cost-statement-units',
            'attributes' => [
                'number' => $row->statement?->number,
                'status' => $row->statement?->status,
                'propertyLabel' => trim((string) ($row->statement?->property?->property_number.' · '.$row->statement?->property?->name)),
                'unitLabel' => trim((string) ($row->unit?->unit_number.' · '.$row->unit?->name)),
                'contractNumber' => $row->contract?->contract_number,
                'tenantName' => $row->tenant_name,
                'periodFrom' => $row->statement?->period_from?->toDateString(),
                'periodUntil' => $row->statement?->period_until?->toDateString(),
                'createdOn' => $row->statement?->created_on?->toDateString(),
                'costTotal' => (float) $row->cost_total,
                'advanceTotal' => (float) $row->advance_total,
                'balance' => $balance,
            ],
            'relationships' => [
                'statement' => ['data' => ['type' => 'operating-cost-statements', 'id' => (string) $row->operating_cost_statement_id]],
                'unit' => $row->unit_id ? ['data' => ['type' => 'units', 'id' => (string) $row->unit_id]] : ['data' => null],
                'contract' => $row->contract_id ? ['data' => ['type' => 'contracts', 'id' => (string) $row->contract_id]] : ['data' => null],
                'openItem' => [
                    'data' => $row->receivable_id ? ['type' => 'receivables', 'id' => (string) $row->receivable_id] : null,
                    'links' => ['related' => $row->receivable_id ? '/api/v1/receivables/'.$row->receivable_id : null],
                ],
            ],
            'links' => [
                'self' => $base,
                'pdf' => $base.'/actions/pdf',
            ],
            'meta' => [
                'openItem' => [
                    'id' => $row->receivable_id,
                    'number' => $receivable?->number,
                    'status' => $receivable?->status,
                    'openAmount' => $receivable ? (float) $receivable->open_amount : null,
                    'allocationCount' => $allocationCount,
                    'kind' => $openItemKind,
                    'label' => $openItemLabel,
                    'canCreate' => $receivable === null && abs($balance) >= 0.005,
                    'canDelete' => $receivable !== null && $allocationCount === 0,
                ],
                'canDeleteStatement' => $allocationCount === 0,
                'actions' => [
                    'self' => $base,
                    'pdf' => $base.'/actions/pdf',
                    'createOpenItem' => $base.'/actions/open-item',
                    'deleteOpenItem' => $base.'/actions/open-item',
                ],
            ],
        ];
    }

    private function values(OperatingCostStatementUnit $statementUnit): array
    {
        $document = (array) ($statementUnit->document_snapshot ?? []);
        if ((int) ($document['schemaVersion'] ?? 0) !== OperatingCostStatementTemplateService::DOCUMENT_SCHEMA_VERSION) {
            throw ValidationException::withMessages([
                'statement' => 'Die Abrechnung besitzt keinen aktuellen eingefrorenen Dokumentstand und muss neu erstellt werden.',
            ]);
        }

        $balance = round((float) $statementUnit->balance, 2);
        $amount = abs($balance);
        $credit = $balance < 0;
        $expectedKind = $credit ? 'credit' : 'payment';
        if (($document['kind'] ?? null) !== $expectedKind) {
            throw ValidationException::withMessages([
                'statement' => 'Abrechnungsergebnis und eingefrorener Dokumentstand stimmen nicht überein. Die Abrechnung muss neu erstellt werden.',
            ]);
        }

        $year = $statementUnit->statement?->period_until?->format('Y');
        $dueOn = $document['dueOn'] ?? null;
        if (! is_string($dueOn) || trim($dueOn) === '') {
            throw ValidationException::withMessages([
                'statement' => 'Die Abrechnung besitzt kein eingefrorenes Fälligkeits- bzw. Erstattungsdatum und muss neu erstellt werden.',
            ]);
        }
        try {
            $dueDate = Carbon::parse($dueOn)->startOfDay();
        } catch (\Throwable) {
            throw ValidationException::withMessages([
                'statement' => 'Das eingefrorene Fälligkeits- bzw. Erstattungsdatum ist ungültig. Die Abrechnung muss neu erstellt werden.',
            ]);
        }

        return [
            'external_number' => data_get($statementUnit->calculation_snapshot, 'reference'),
            'contract_id' => $statementUnit->contract_id,
            'description' => ($credit ? 'Gutschrift Betriebskostenabrechnung ' : 'Betriebskostenabrechnung ').$year,
            'type' => $credit ? 'settlement_credit' : 'settlement',
            'cost_area' => 'settlement',
            'service_month' => $statementUnit->statement?->period_until?->copy()->startOfMonth(),
            'status' => 'open',
            'amount' => $amount,
            'open_amount' => $amount,
            'due_date' => $dueDate,
            'settled_at' => null,
            'notes' => null,
        ];
    }

    private function number(OperatingCostStatementUnit $statementUnit): string
    {
        $prefix = (float) $statementUnit->balance < 0 ? 'BKG' : 'BKA';

        return $prefix.'-'.now()->format('YmdHis').'-'.Str::upper(Str::substr($statementUnit->id, 0, 6));
    }

    private function idempotencyKey(OperatingCostStatementUnit $statementUnit): string
    {
        return 'operating-cost-statement-unit:'.$statementUnit->id;
    }

    private function freshStatementUnit(string $id): OperatingCostStatementUnit
    {
        return OperatingCostStatementUnit::query()
            ->with(['statement.property', 'unit', 'contract', 'receivable.allocations'])
            ->findOrFail($id);
    }
}
