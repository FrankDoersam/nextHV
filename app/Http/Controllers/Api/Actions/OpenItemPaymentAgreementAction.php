<?php

namespace App\Http\Controllers\Api\Actions;

use App\Http\Controllers\Controller;
use App\Http\Requests\Finance\EndOpenItemPaymentAgreementRequest;
use App\Http\Requests\Finance\StoreOpenItemPaymentAgreementRequest;
use App\Models\OpenItem;
use App\Models\OpenItemPaymentAgreement;
use App\Services\Finance\OpenItemPaymentAgreementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

final class OpenItemPaymentAgreementAction extends Controller
{
    private const MEDIA_TYPE = 'application/vnd.api+json';

    public function index(Request $request, OpenItem $openItem, OpenItemPaymentAgreementService $service): JsonResponse
    {
        Gate::authorize('view', $openItem);
        $items = $openItem->paymentAgreements()->orderByDesc('created_at')->orderByDesc('id')->limit(51)->get();
        return response()->json([
            'jsonapi' => ['version' => '1.1'],
            'data' => $items->take(50)->map(fn (OpenItemPaymentAgreement $item): array => $this->resource($item, $openItem, $service))->values(),
            'meta' => ['truncated' => $items->count() > 50],
        ], 200, ['Content-Type' => self::MEDIA_TYPE]);
    }

    public function store(StoreOpenItemPaymentAgreementRequest $request, OpenItem $openItem, OpenItemPaymentAgreementService $service): JsonResponse
    {
        Gate::authorize('update', $openItem);
        $values = $request->safe()->except('meta');
        try {
            $agreement = $service->create($openItem, $values['payableOn'], $values['reason'], $request->user()?->id, $request->user()?->name);
        } catch (ValidationException $exception) {
            throw $request->asCommandValidationException($exception);
        }
        return response()->json([
            'jsonapi' => ['version' => '1.1'],
            'data' => $this->resource($agreement, $openItem, $service),
        ], 201, ['Content-Type' => self::MEDIA_TYPE]);
    }

    public function end(EndOpenItemPaymentAgreementRequest $request, OpenItem $openItem, OpenItemPaymentAgreementService $service): JsonResponse
    {
        Gate::authorize('update', $openItem);
        $values = $request->safe()->except('meta');
        try {
            $agreement = $service->end($openItem, $values['agreementId'], $values['reason'], $request->user()?->id, $request->user()?->name);
        } catch (ValidationException $exception) {
            throw $request->asCommandValidationException($exception);
        }
        return response()->json([
            'jsonapi' => ['version' => '1.1'],
            'data' => $this->resource($agreement, $openItem, $service),
        ], 200, ['Content-Type' => self::MEDIA_TYPE]);
    }

    /** @return array<string, mixed> */
    private function resource(OpenItemPaymentAgreement $agreement, OpenItem $openItem, OpenItemPaymentAgreementService $service): array
    {
        return [
            'id' => (string) $agreement->id,
            'type' => 'open-item-payment-agreements',
            'attributes' => $service->projection($agreement, $openItem),
        ];
    }
}
