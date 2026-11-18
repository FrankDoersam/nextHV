<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Documents\TemplateVariableCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class TemplateVariableCatalogController extends Controller
{
    private const MEDIA_TYPE = 'application/vnd.api+json';

    public function __invoke(Request $request, string $catalog, TemplateVariableCatalog $catalogs): JsonResponse
    {
        if ($catalog !== TemplateVariableCatalog::ID) {
            return response()->json([
                'jsonapi' => ['version' => '1.1'],
                'errors' => [[
                    'status' => '404',
                    'code' => 'template_variable_catalog_not_found',
                    'title' => 'Variablenkatalog nicht gefunden',
                    'detail' => 'Der angeforderte Variablenkatalog ist nicht verfügbar.',
                    'source' => ['parameter' => 'catalog'],
                ]],
            ], 404, ['Content-Type' => self::MEDIA_TYPE]);
        }

        $validated = validator($request->query(), [
            'filter' => ['sometimes', 'array'],
            'filter.usage' => ['sometimes', Rule::in(TemplateVariableCatalog::USAGES)],
            'filter.recipientType' => ['sometimes', Rule::in(TemplateVariableCatalog::RECIPIENT_TYPES)],
        ])->validate();

        $usage = data_get($validated, 'filter.usage');
        $recipientType = data_get($validated, 'filter.recipientType');
        $attributes = $catalogs->catalog(
            is_string($usage) ? $usage : null,
            is_string($recipientType) ? $recipientType : null,
        );

        return response()->json([
            'jsonapi' => ['version' => '1.1'],
            'links' => ['self' => $request->fullUrl()],
            'data' => [
                'type' => 'template-variable-catalogs',
                'id' => TemplateVariableCatalog::ID,
                'attributes' => $attributes,
            ],
        ], 200, ['Content-Type' => self::MEDIA_TYPE]);
    }
}
