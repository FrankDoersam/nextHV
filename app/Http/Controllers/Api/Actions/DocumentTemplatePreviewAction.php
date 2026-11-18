<?php

namespace App\Http\Controllers\Api\Actions;

use App\Models\DocumentTemplate;
use App\Rules\TiptapDocumentContent;
use App\Services\Documents\TiptapContractDocumentGenerationService;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Routing\Controller;

final class DocumentTemplatePreviewAction extends Controller
{
    public function __invoke(
        Request $request,
        DocumentTemplate $template,
        TiptapContractDocumentGenerationService $tiptap,
    ): Response {
        abort_unless($request->isMethod('post'), 405);
        $values = $request->validate([
            'blocks' => ['required', 'array', 'max:10000', new TiptapDocumentContent()],
            'name' => ['sometimes', 'string', 'max:180'],
            'title' => ['sometimes', 'string', 'max:180'],
            'subtitle' => ['sometimes', 'nullable', 'string', 'max:255'],
            'style' => ['sometimes', 'array'],
            'inputDefinitions' => ['sometimes', 'array', 'max:50'],
            'inputs' => ['sometimes', 'array', 'max:50'],
            'inputs.*' => ['nullable', static function (string $attribute, mixed $value, \Closure $fail): void {
                if (! is_string($value) && ! is_bool($value)) $fail('Dokument-Eingaben müssen Text, Datum, Ja/Nein oder leer sein.');
            }],
        ]);

        // The generation service clones and hydrates the override exactly once.
        // Avoid a second model clone and block projection during preview.
        $values['style'] = [...(is_array($values['style'] ?? null) ? $values['style'] : []), 'engine' => 'tiptap-fpdf'];
        $rendered = $tiptap->renderPreview($template, null, $values);
        $filename = str_replace(['"', "\r", "\n"], '', $rendered['filename']);

        return response($rendered['pdf'], 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'inline; filename="'.$filename.'"',
            'Cache-Control' => 'private, no-store, max-age=0',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
