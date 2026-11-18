<?php

namespace App\Http\Controllers\Api\Actions;

use App\Http\Controllers\Controller;
use App\Models\Contract;
use App\Models\Payment;
use App\Http\Requests\Finance\BookMonthlyAutoMatchingRequest;
use App\Services\Finance\MonthlyPaymentAutoMatchingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

final class MonthlyPaymentAutoMatchingAction extends Controller
{
    private const MEDIA_TYPE = 'application/vnd.api+json';

    public function preview(Request $request, MonthlyPaymentAutoMatchingService $service): JsonResponse
    {
        $input = $request->validate([
            'month' => ['required', 'date_format:Y-m'],
            'page' => ['sometimes', 'integer', 'min:1', 'max:10000'],
            'scope' => ['sometimes', 'string', \Illuminate\Validation\Rule::in(['page', 'summary'])],
            'view' => ['sometimes', 'string', \Illuminate\Validation\Rule::in(['all', 'review', 'ready'])],
            'search' => ['sometimes', 'string', 'max:100'],
        ]);
        if (($input['scope'] ?? 'page') === 'summary') {
            return response()->json([
                'jsonapi' => ['version' => '1.1'],
                'meta' => $service->monthSummary($input['month']),
            ], 200, ['Content-Type' => self::MEDIA_TYPE]);
        }

        $result = $service->preview($input['month'], (int) ($input['page'] ?? 1), $input['view'] ?? 'all', trim($input['search'] ?? ''));

        return response()->json([
            'jsonapi' => ['version' => '1.1'],
            'data' => collect($result['rows'])->map(static function (array $row): array {
                $id = $row['id'];
                unset($row['id']);
                return ['type' => 'monthly-payment-matches', 'id' => $id, 'attributes' => $row];
            })->values(),
            'meta' => $result['meta'],
        ], 200, ['Content-Type' => self::MEDIA_TYPE]);
    }

    /** Read-only, on-demand history for a verified related contract. */
    public function contractContext(Request $request, Payment $payment, MonthlyPaymentAutoMatchingService $service): JsonResponse
    {
        $input = $request->validate([
            'contractId' => ['required', 'uuid'],
            'researchOpenItemId' => ['sometimes', 'uuid'],
        ]);
        $contract = Contract::query()->findOrFail($input['contractId']);
        Gate::authorize('view', $contract);

        $history = $service->contractAllocationHistory($payment, (string) $contract->id, $input['researchOpenItemId'] ?? null);

        return response()->json([
            'jsonapi' => ['version' => '1.1'],
            'data' => collect($history['data'])->map(static function (array $row): array {
                $id = $row['id'];
                unset($row['id']);
                return ['type' => 'monthly-matching-allocation-histories', 'id' => $id, 'attributes' => $row];
            })->values(),
            'meta' => $history['meta'],
        ], 200, ['Content-Type' => self::MEDIA_TYPE]);
    }

    /** The current payment's historical distribution, without matching guesses. */
    public function paymentContext(Payment $payment, MonthlyPaymentAutoMatchingService $service): JsonResponse
    {
        $history = $service->paymentAllocationHistory($payment);

        return response()->json([
            'jsonapi' => ['version' => '1.1'],
            'data' => collect($history['data'])->map(static function (array $row): array {
                $id = $row['id'];
                unset($row['id']);
                return ['type' => 'monthly-matching-payment-allocations', 'id' => $id, 'attributes' => $row];
            })->values(),
            'meta' => $history['meta'],
        ], 200, ['Content-Type' => self::MEDIA_TYPE]);
    }

    /** An OP's actual payments across months, linked to this payment/contract. */
    public function openItemContext(Request $request, Payment $payment, MonthlyPaymentAutoMatchingService $service): JsonResponse
    {
        $input = $request->validate([
            'openItemId' => ['required', 'uuid'],
            'research' => ['sometimes', 'boolean'],
        ]);
        $openItem = \App\Models\OpenItem::query()->findOrFail($input['openItemId']);
        $history = $service->openItemAllocationHistory($payment, $openItem, (bool) ($input['research'] ?? false));

        return response()->json([
            'jsonapi' => ['version' => '1.1'],
            'data' => collect($history['data'])->map(static function (array $row): array {
                $id = $row['id'];
                unset($row['id']);
                return ['type' => 'monthly-matching-open-item-allocations', 'id' => $id, 'attributes' => $row];
            })->values(),
            'meta' => $history['meta'],
            'included' => [], // No guessed or unrelated OP records are returned.
            'openItem' => $history['openItem'],
        ], 200, ['Content-Type' => self::MEDIA_TYPE]);
    }

    public function book(BookMonthlyAutoMatchingRequest $request, MonthlyPaymentAutoMatchingService $service): JsonResponse
    {
        try {
            $result = $service->book(
                $request->validated('month'),
                $request->validated('items', []),
                $request->user()?->id,
                $request->validated('manualItems', []),
                (bool) $request->validated('includeAllSafe', false),
                $request->validated('excludedPaymentIds', []),
                $request->validated('expectedApprovalSnapshot'),
            );
        } catch (ValidationException $exception) {
            throw $request->asCommandValidationException($exception);
        }

        return response()->json([
            'jsonapi' => ['version' => '1.1'],
            'meta' => $result,
        ], 200, ['Content-Type' => self::MEDIA_TYPE]);
    }
}
