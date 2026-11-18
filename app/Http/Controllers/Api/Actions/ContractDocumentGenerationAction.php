<?php

namespace App\Http\Controllers\Api\Actions;

use App\Models\Contract;
use App\Models\DocumentTemplate;
use App\Services\Documents\TiptapContractDocumentGenerationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Validation\ValidationException;

final class ContractDocumentGenerationAction extends Controller
{
    public function index(
        Contract $contract,
        TiptapContractDocumentGenerationService $tiptap,
    ): JsonResponse {
        return response()->json([
            'jsonapi' => ['version' => '1.1'],
            'meta' => [
                'contractId' => (string) $contract->id,
                'contractNumber' => (string) $contract->contract_number,
                'contractType' => (string) $contract->contract_type,
                'templates' => $tiptap->available($contract),
            ],
        ], 200, ['Content-Type' => 'application/vnd.api+json']);
    }

    public function generate(
        Request $request,
        Contract $contract,
        TiptapContractDocumentGenerationService $tiptap,
    ): JsonResponse {
        $mode = (string) $request->input('mode', 'generate');
        if ($mode !== 'generate') throw ValidationException::withMessages(['mode' => 'Dokumente werden ausschließlich serverseitig über Tiptap/FPDF erzeugt.']);

        $values = $request->validate([
            'mode' => ['sometimes', 'in:generate'],
            'documents' => ['required', 'array', 'min:1', 'max:20'],
            'documents.*.templateId' => ['required', 'uuid', 'distinct'],
            'documents.*.inputs' => ['sometimes', 'array', 'max:50'],
            'documents.*.inputs.*' => ['nullable', static function (string $attribute, mixed $value, \Closure $fail): void {
                if (! is_string($value) && ! is_bool($value)) $fail('Dokument-Eingaben müssen Text, Datum, Ja/Nein oder leer sein.');
            }],
        ]);

        $requests = $this->resolveRequests($values['documents']);
        foreach ($requests as $item) {
            if ((string) data_get($item['template']->style ?? [], 'engine', '') !== 'tiptap-fpdf') {
                throw ValidationException::withMessages(['documents' => 'Die ausgewählte Dokumentvorlage verwendet nicht den Tiptap/FPDF-Renderer.']);
            }
        }

        $documents = $tiptap->generateManyAndArchive($contract, $requests);
        return response()->json([
            'jsonapi' => ['version' => '1.1'],
            'meta' => ['generatedCount' => count($documents), 'documents' => $documents],
        ], 201, ['Content-Type' => 'application/vnd.api+json']);
    }

    /** @return array<int, array{template:DocumentTemplate,inputs:array}> */
    private function resolveRequests(array $items): array
    {
        $ids = array_column($items, 'templateId');
        $templates = DocumentTemplate::query()->whereIn('id', $ids)->get()->keyBy(fn (DocumentTemplate $template): string => (string) $template->id);
        if ($templates->count() !== count($ids)) throw ValidationException::withMessages(['documents' => 'Mindestens eine Dokumentvorlage ist nicht mehr verfügbar.']);

        return array_map(static function (array $item) use ($templates): array {
            return [
                'template' => $templates->get((string) $item['templateId']),
                'inputs' => is_array($item['inputs'] ?? null) ? $item['inputs'] : [],
            ];
        }, array_values($items));
    }
}
