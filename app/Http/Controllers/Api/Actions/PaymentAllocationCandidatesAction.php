<?php

namespace App\Http\Controllers\Api\Actions;

use App\Http\Controllers\Controller;
use App\Models\Payment;
use App\Services\Finance\PaymentAllocationCandidateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

final class PaymentAllocationCandidatesAction extends Controller
{
    private const MEDIA_TYPE = 'application/vnd.api+json';
    private const MODES = ['suggestions', 'all', 'overpayment'];

    public function __construct(private readonly PaymentAllocationCandidateService $service) {}

    public function __invoke(Request $request, Payment $payment): JsonResponse
    {
        if ($negotiationError = $this->contentNegotiationError($request)) {
            return $negotiationError;
        }

        $filter = $request->query('filter', []);
        $filter = is_array($filter) ? $filter : [];
        $search = trim((string) ($filter['search'] ?? $request->input('filter.search', '')));
        $mode = (string) ($filter['mode'] ?? $request->input('filter.mode', 'suggestions'));
        if (! in_array($mode, self::MODES, true)) {
            $mode = 'suggestions';
        }

        $result = $this->service->candidates($payment, $mode, $search);

        return response()->json([
            'jsonapi' => ['version' => '1.1'],
            'data' => $result['data'],
            'meta' => $result['meta'],
        ], 200, ['Content-Type' => self::MEDIA_TYPE]);
    }

    private function contentNegotiationError(Request $request): ?JsonResponse
    {
        $contentType = trim((string) $request->header('Content-Type', ''));
        if ($contentType !== '' && $this->hasInvalidJsonApiContentType($contentType)) {
            return $this->jsonApiError(415, 'Unsupported Media Type', 'Der JSON:API Content-Type enthält nicht unterstützte Media-Type-Parameter.');
        }

        $accept = trim((string) $request->header('Accept', '*/*'));
        if (! $this->acceptsJsonApi($accept)) {
            return $this->jsonApiError(406, 'Not Acceptable', 'Diese Aktion liefert ausschließlich JSON:API-Dokumente.');
        }

        return null;
    }

    private function hasInvalidJsonApiContentType(string $header): bool
    {
        $parts = array_map('trim', explode(';', $header));
        $mediaType = strtolower((string) array_shift($parts));
        if ($mediaType !== self::MEDIA_TYPE) return false;

        foreach ($parts as $parameter) {
            $name = strtolower(trim((string) Str::before($parameter, '=')));
            if ($name === 'profile') continue;
            if ($name === 'ext') return true;
            return true;
        }

        return false;
    }

    private function acceptsJsonApi(string $header): bool
    {
        foreach (explode(',', $header) as $range) {
            $parts = array_map('trim', explode(';', trim($range)));
            $mediaType = strtolower((string) array_shift($parts));
            $quality = 1.0;
            $unsupported = false;

            foreach ($parts as $parameter) {
                [$rawName, $rawValue] = array_pad(explode('=', $parameter, 2), 2, '');
                $name = strtolower(trim($rawName));
                $value = trim($rawValue, " \t\n\r\0\x0B\"");

                if ($name === 'q') {
                    $quality = is_numeric($value) ? (float) $value : 0.0;
                    continue;
                }
                if ($mediaType === self::MEDIA_TYPE && $name === 'profile') continue;
                if ($mediaType === self::MEDIA_TYPE && $name === 'ext') {
                    $unsupported = true;
                    continue;
                }
                if ($mediaType === self::MEDIA_TYPE) $unsupported = true;
            }

            if ($quality <= 0) continue;
            if ($mediaType === '*/*') return true;
            if ($mediaType === self::MEDIA_TYPE && ! $unsupported) return true;
        }

        return false;
    }

    private function jsonApiError(int $status, string $title, string $detail): JsonResponse
    {
        return response()->json([
            'jsonapi' => ['version' => '1.1'],
            'errors' => [[
                'status' => (string) $status,
                'title' => $title,
                'detail' => $detail,
            ]],
        ], $status, ['Content-Type' => self::MEDIA_TYPE]);
    }
}
