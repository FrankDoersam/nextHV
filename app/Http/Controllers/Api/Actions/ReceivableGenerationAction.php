<?php

namespace App\Http\Controllers\Api\Actions;

use App\Http\Controllers\Controller;
use App\Http\Requests\Finance\CancelDunningNoticeRequest;
use App\Http\Requests\Finance\GenerateReceivablesRequest;
use App\Http\Requests\Finance\IssueDunningNoticesRequest;
use App\Models\DunningNotice;
use App\Models\OpenItem;
use App\Services\Finance\DunningNoticeService;
use App\Services\Finance\ReceivableGenerationService;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

final class ReceivableGenerationAction extends Controller
{
    public function scope(Request $request, ReceivableGenerationService $service): JsonResponse
    {
        $values = $request->validate([
            'periodFrom' => ['required', 'date_format:Y-m'],
            'periodUntil' => ['required', 'date_format:Y-m', 'after_or_equal:periodFrom'],
        ]);
        $scope = $service->scopeForPeriod(
            CarbonImmutable::createFromFormat('Y-m', $values['periodFrom'])->startOfMonth(),
            CarbonImmutable::createFromFormat('Y-m', $values['periodUntil'])->startOfMonth(),
        );

        return response()->json([
            'jsonapi' => ['version' => '1.1'],
            'meta' => $scope,
        ], 200, ['Content-Type' => 'application/vnd.api+json']);
    }

    public function preview(GenerateReceivablesRequest $request, ReceivableGenerationService $service): JsonResponse
    {
        $values = $request->safe()->except('meta');
        $rows = $service->preview(CarbonImmutable::createFromFormat('Y-m', $values['periodFrom'])->startOfMonth(), CarbonImmutable::createFromFormat('Y-m', $values['periodUntil'])->startOfMonth(), $values['contractIds'] ?? null, $values['propertyIds'] ?? null, $values['unitIds'] ?? null);

        return response()->json(['jsonapi' => ['version' => '1.1'], 'data' => collect($rows)->map(fn (array $row) => ['type' => 'open-item-generation-items', 'id' => hash('sha256', $row['key']), 'attributes' => $this->previewAttributes($row)])->values()], 200, ['Content-Type' => 'application/vnd.api+json']);
    }

    public function generate(GenerateReceivablesRequest $request, ReceivableGenerationService $service): JsonResponse
    {
        $values = $request->safe()->except('meta');
        $result = $service->generate(CarbonImmutable::createFromFormat('Y-m', $values['periodFrom'])->startOfMonth(), CarbonImmutable::createFromFormat('Y-m', $values['periodUntil'])->startOfMonth(), $values['contractIds'] ?? null, $request->user()?->id, $values['selectedKeys'] ?? null, $values['propertyIds'] ?? null, $values['unitIds'] ?? null);

        return response()->json([
            'jsonapi' => ['version' => '1.1'],
            'data' => collect($result['created'])->map(fn (OpenItem $row) => ['type' => 'open-items', 'id' => $row->id, 'attributes' => ['number' => $row->number, 'description' => $row->description, 'amount' => (float) $row->amount, 'dueDate' => $row->due_date?->toDateString()]])->values(),
            'meta' => ['contractsProcessed' => $result['contractsProcessed'], 'imported' => count($result['created']), 'duplicates' => count($result['duplicates']), 'skipped' => count($result['skipped']), 'errors' => 0, 'duplicateRows' => $result['duplicates'], 'skippedRows' => $result['skipped']],
        ], 201, ['Content-Type' => 'application/vnd.api+json']);
    }

    public function dunning(IssueDunningNoticesRequest $request, DunningNoticeService $service): JsonResponse
    {
        $values = $request->safe()->except('meta');

        try {
            $notices = $service->issueUsingSettings($values['receivableIds'], $values['level'], $values['issuedOn'], $values['requestId'], $request->user()?->id);
        } catch (ValidationException $exception) {
            throw $request->asCommandValidationException($exception);
        }

        return response()->json([
            'jsonapi' => ['version' => '1.1'],
            'data' => $notices->map(fn ($notice): array => [
                'type' => 'dunning-notices', 'id' => (string) $notice->id,
                'attributes' => ['number' => $notice->number, 'level' => $notice->level, 'status' => $notice->status, 'contractNumber' => $notice->contract_number, 'totalDue' => (float) $notice->total_due, 'documentPreviewUrl' => $notice->document_preview_url],
            ])->values(),
            'meta' => ['created' => $notices->count()],
        ], 201, ['Content-Type' => 'application/vnd.api+json']);
    }

    public function dunningWorkQueue(Request $request, DunningNoticeService $service): JsonResponse
    {
        $input = $request->validate([
            'view' => ['sometimes', 'in:now,planned'],
            'page' => ['sometimes', 'integer', 'min:1', 'max:200'],
            'pageSize' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'search' => ['sometimes', 'nullable', 'string', 'max:100'],
        ]);
        $result = isset($input['view'])
            ? $service->workQueuePaged(
                $input['view'],
                (int) ($input['page'] ?? 1),
                (int) ($input['pageSize'] ?? 25),
                (string) ($input['search'] ?? ''),
            )
            : $service->workQueue();

        return response()->json([
            'jsonapi' => ['version' => '1.1'],
            'data' => collect($result['rows'])->map(fn (array $row): array => [
                'type' => 'dunning-work-items',
                'id' => $row['id'],
                'attributes' => array_diff_key($row, ['id' => true]),
            ])->values(),
            'meta' => $result['meta'],
        ], 200, ['Content-Type' => 'application/vnd.api+json']);
    }

    public function cancelDunning(CancelDunningNoticeRequest $request, DunningNotice $notice, DunningNoticeService $service): JsonResponse
    {
        $values = $request->safe()->except('meta');

        try {
            $cancelled = $service->cancel($notice, $values['reason'], $request->user()?->id);
        } catch (ValidationException $exception) {
            throw $request->asCommandValidationException($exception);
        }

        return response()->json([
            'jsonapi' => ['version' => '1.1'],
            'data' => [
                'type' => 'dunning-notices',
                'id' => (string) $cancelled->id,
                'attributes' => [
                    'number' => $cancelled->number,
                    'level' => $cancelled->level,
                    'status' => $cancelled->status,
                    'cancellationReason' => $cancelled->cancellation_reason,
                    'cancelledAt' => $cancelled->cancelled_at?->toISOString(),
                    'cancelledByLabel' => $cancelled->cancelled_by_label,
                    'feeReceivableNumber' => $cancelled->fee_receivable_number,
                    'documentPreviewUrl' => $cancelled->document_preview_url,
                ],
            ],
            'meta' => ['feeReceivableReversed' => (bool) $cancelled->feeReceivable?->trashed()],
        ], 200, ['Content-Type' => 'application/vnd.api+json']);
    }

    private function previewAttributes(array $row): array
    {
        $row['openItemType'] = $row['type'] ?? null;
        unset($row['type']);

        return $row;
    }
}
