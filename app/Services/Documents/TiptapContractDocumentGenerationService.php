<?php

namespace App\Services\Documents;

use App\Models\Contract;
use App\Models\Document;
use App\Models\DocumentCategory;
use App\Models\DocumentTemplate;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

/** Server-side orchestration for semantic Tiptap Community reports. */
final class TiptapContractDocumentGenerationService
{
    public function __construct(
        private readonly ContractDocumentContextResolver $contextResolver,
        private readonly ContractDocumentDataRegistry $dataRegistry,
        private readonly ContractDocumentScopeEnricher $scopeEnricher,
        private readonly DocumentInputResolver $inputResolver,
        private readonly TemplatePlaceholderEngine $placeholders,
        private readonly TiptapFpdfRenderer $renderer,
        private readonly TiptapPaperChromeProjector $paperChrome,
    ) {}

    public function available(Contract $contract): array
    {
        // Filter contract types in SQL before hydrating large Tiptap documents.
        // Resolving contract context is unnecessary if no template matches.
        $templates = DocumentTemplate::query()
            ->where('is_active', true)
            ->whereJsonContains('contract_types', $contract->contract_type)
            ->when(
                ! in_array($contract->contract_type, ['residential_lease', 'mixed_lease'], true),
                fn ($query) => $query->where('main_contract_only', false),
            )
            ->orderBy('sort_order')->orderBy('name')->get()
            ->filter(fn (DocumentTemplate $template): bool => $template->appliesTo($contract) && $this->isTiptap($template))
            ->values();

        if ($templates->isEmpty()) return [];

        $context = $this->documentContext($contract);
        return $templates
            ->map(fn (DocumentTemplate $template): array => $this->templateDescriptor($template, $context))
            ->all();
    }

    /** @return array{pdf:string,filename:string} */
    public function renderPreview(DocumentTemplate $template, ?Contract $contract = null, ?array $previewOverride = null): array
    {
        $effective = clone $template;
        $blocksOverride = is_array($previewOverride['blocks'] ?? null) ? $previewOverride['blocks'] : null;
        if ($previewOverride !== null) {
            $effective->forceFill([
                'name' => is_string($previewOverride['name'] ?? null) ? $previewOverride['name'] : $template->name,
                'title' => is_string($previewOverride['title'] ?? null) ? $previewOverride['title'] : $template->title,
                'subtitle' => array_key_exists('subtitle', $previewOverride) ? $previewOverride['subtitle'] : $template->subtitle,
                'style' => [...($template->style ?? []), ...(is_array($previewOverride['style'] ?? null) ? $previewOverride['style'] : []), 'engine' => 'tiptap-fpdf'],
                'blocks' => $blocksOverride ?? ($template->blocks ?? []),
                'input_definitions' => is_array($previewOverride['inputDefinitions'] ?? null) ? $previewOverride['inputDefinitions'] : ($template->input_definitions ?? []),
            ]);
        }

        $context = $contract ? $this->documentContext($contract) : $this->scopeEnricher->enrich(null, $this->dataRegistry->sampleContext());
        $resolved = $this->inputResolver->resolve(
            $effective->input_definitions ?? [], $context,
            is_array($previewOverride['inputs'] ?? null) ? $previewOverride['inputs'] : [], false,
        );
        $context = $resolved['context'];
        if ($contract) $this->assertUsable($effective, $contract, $blocksOverride);
        elseif (! $effective->is_active) throw ValidationException::withMessages(['template' => 'Die Dokumentvorlage ist nicht aktiv.']);
        $this->assertTiptapTemplate($effective, $blocksOverride);
        $this->assertReady($effective, $context, $blocksOverride);

        $renderTemplate = $this->paperChrome->project($effective, $context, $blocksOverride);
        return ['pdf' => $this->renderer->render($renderTemplate, $context), 'filename' => $this->filename($effective, $context)];
    }

    /** @param array<int, array{template:DocumentTemplate,inputs?:array<string,mixed>}> $requests */
    public function generateManyAndArchive(Contract $contract, array $requests): array
    {
        if ($requests === []) return [];
        $baseContext = $this->documentContext($contract);
        $prepared = [];
        foreach ($requests as $request) {
            $template = $request['template'];
            $this->assertUsable($template, $contract);
            $resolved = $this->inputResolver->resolve($template->input_definitions ?? [], $baseContext, is_array($request['inputs'] ?? null) ? $request['inputs'] : []);
            $context = $resolved['context'];
            $this->assertReady($template, $context);
            $renderTemplate = $this->paperChrome->project($template, $context);
            $prepared[] = [
                'template' => $template,
                'context' => $context,
                'inputValues' => $resolved['values'],
                'pdf' => $this->renderer->render($renderTemplate, $context),
            ];
        }
        return $this->archivePrepared($contract, $prepared);
    }

    private function templateDescriptor(DocumentTemplate $template, array $context): array
    {
        $resolved = $this->inputResolver->resolve($template->input_definitions ?? [], $context, [], false);
        $context = $resolved['context'];
        $paths = $this->placeholderPaths([
            'filenamePattern' => $template->filename_pattern,
            'title' => $template->title,
            'subtitle' => $template->subtitle,
            'blocks' => $template->blocks ?? [],
        ]);
        $optional = collect([
            ...ContractDocumentDataRegistry::optionalPaths(),
            ...data_get($template->style ?? [], 'optionalPlaceholders', []),
            ...$this->inputResolver->inputPaths($template->input_definitions ?? []),
        ])->filter()->unique()->values();
        $missing = collect($paths)
            ->filter(fn (string $path): bool => ($value = data_get($context, $path)) === null || $value === '')
            ->reject(fn (string $path): bool => $optional->contains($path))->values();

        return [
            'id' => (string) $template->id,
            'code' => $template->code,
            'name' => $template->name,
            'description' => $template->description,
            'documentType' => $template->document_type,
            'version' => $template->version,
            'engine' => 'tiptap-fpdf',
            'selectedByDefault' => $template->is_default,
            'mainContractOnly' => $template->main_contract_only,
            'categoryPath' => $template->category_path,
            'categoryLabel' => implode(' / ', $template->category_path ?? []),
            'filename' => $this->filename($template, $context),
            'ready' => $missing->isEmpty(),
            'missing' => $missing->all(),
            'missingLabels' => $missing->map(fn (string $path): string => ContractDocumentDataRegistry::label($path))->all(),
            'inputDefinitions' => $template->input_definitions ?? [],
            'inputValues' => $resolved['values'],
        ];
    }

    private function documentContext(Contract $contract): array
    {
        return $this->scopeEnricher->enrich($contract, $this->contextResolver->resolve($contract));
    }

    private function assertUsable(DocumentTemplate $template, Contract $contract, ?array $blocksOverride = null): void
    {
        if (! $template->is_active || ! $template->appliesTo($contract)) throw ValidationException::withMessages(['template' => 'Die Dokumentvorlage ist für diesen Vertrag nicht verfügbar.']);
        $this->assertTiptapTemplate($template, $blocksOverride);
    }

    private function isTiptap(DocumentTemplate $template): bool
    {
        return (string) data_get($template->style ?? [], 'engine', '') === 'tiptap-fpdf';
    }

    private function assertTiptapTemplate(DocumentTemplate $template, ?array $blocksOverride = null): void
    {
        if (! $this->isTiptap($template)) throw ValidationException::withMessages(['template' => 'Die Dokumentvorlage verwendet nicht den Tiptap/FPDF-Renderer.']);
        $blocks = $blocksOverride ?? ($template->blocks ?? []);
        if (! is_array($blocks) || $blocks === []) throw ValidationException::withMessages(['template' => 'Die Dokumentvorlage enthält keinen Tiptap-Inhalt.']);
    }

    private function assertReady(DocumentTemplate $template, array $context, ?array $blocksOverride = null): void
    {
        $paths = $this->placeholderPaths(['filenamePattern' => $template->filename_pattern, 'title' => $template->title, 'subtitle' => $template->subtitle, 'blocks' => $blocksOverride ?? ($template->blocks ?? [])]);
        $optional = collect([...ContractDocumentDataRegistry::optionalPaths(), ...data_get($template->style ?? [], 'optionalPlaceholders', []), ...$this->inputResolver->inputPaths($template->input_definitions ?? [])])->filter()->unique()->values();
        $missing = collect($paths)->filter(fn (string $path): bool => ($value = data_get($context, $path)) === null || $value === '')->reject(fn (string $path): bool => $optional->contains($path))->values();
        if ($missing->isEmpty()) return;
        throw ValidationException::withMessages(['template' => 'Vor der Erzeugung fehlen Daten: '.$missing->map(fn (string $path): string => ContractDocumentDataRegistry::label($path))->implode(', ')]);
    }

    private function placeholderPaths(array $data): array
    {
        $paths = array_fill_keys($this->placeholders->paths($data), true);
        $walk = function (mixed $value) use (&$walk, &$paths): void {
            if (! is_array($value)) return;
            if (($value['type'] ?? null) === 'variable') {
                $path = data_get($value, 'attrs.path');
                if (is_string($path) && $path !== '') $paths[$path] = true;
            }
            if (($value['type'] ?? null) === 'signatureBlock') {
                foreach (['locationPath', 'datePath', 'leftNamePath', 'rightNamePath'] as $attribute) {
                    $path = data_get($value, 'attrs.'.$attribute);
                    if (is_string($path) && $path !== '') $paths[$path] = true;
                }
            }
            foreach ($value as $child) $walk($child);
        };
        $walk($data);
        return array_keys($paths);
    }

    /** @param array<int, array{template:DocumentTemplate,context:array,inputValues:array,pdf:string}> $prepared */
    private function archivePrepared(Contract $contract, array $prepared): array
    {
        $archives = [];
        $categoryCache = [];
        $archiveDate = now();
        foreach ($prepared as $item) {
            $template = $item['template'];
            $pdf = $item['pdf'];
            if (! is_string($pdf) || strlen($pdf) < 8 || ! str_starts_with($pdf, '%PDF-')) throw ValidationException::withMessages(['file' => 'Der serverseitige FPDF-Renderer hat kein gültiges PDF erzeugt.']);
            $categoryPath = $template->category_path ?? [];
            $categoryKey = implode("\0", $categoryPath);
            $category = $categoryCache[$categoryKey] ??= $this->resolveCategory($categoryPath);
            $snapshot = $template->snapshot();
            $archives[] = [
                ...$item, 'category' => $category, 'filename' => $this->filename($template, $item['context']),
                'path' => sprintf('documents/contracts/%s/%s/%s/%s.pdf', $archiveDate->format('Y'), $archiveDate->format('m'), $contract->id, Str::uuid()),
                'snapshot' => $snapshot, 'snapshotHash' => hash('sha256', json_encode($snapshot, JSON_THROW_ON_ERROR)),
            ];
        }

        $written = [];
        try {
            foreach ($archives as $archive) {
                $written[] = $archive['path'];
                if (! Storage::disk('local')->put($archive['path'], $archive['pdf'])) throw ValidationException::withMessages(['file' => "„{$archive['template']->name}“ konnte nicht gespeichert werden."]);
            }
            return DB::transaction(fn (): array => array_map(function (array $archive) use ($contract): array {
                $template = $archive['template'];
                $document = Document::query()->create([
                    'documentable_type' => $contract->getMorphClass(), 'documentable_id' => $contract->id, 'category_id' => $archive['category']->id,
                    'title' => $template->name.' · '.$contract->contract_number, 'description' => trim((string) $template->description) ?: 'Aus der Vertragsakte erzeugtes Dokument.',
                    'status' => 'completed', 'disk' => 'local', 'path' => $archive['path'], 'original_name' => $archive['filename'], 'mime_type' => 'application/pdf',
                    'size_bytes' => strlen($archive['pdf']), 'sha256' => hash('sha256', $archive['pdf']), 'uploaded_by' => auth()->id(),
                    'metadata' => [
                        'source' => 'document-template', 'generator' => 'tiptap-fpdf', 'generatorVersion' => '2', 'renderedIn' => 'laravel',
                        'resourceType' => 'contracts', 'contractNumber' => $contract->contract_number,
                        'linkedContractIds' => data_get($archive['context'], 'contract.linkedContractIds', []),
                        'linkedContractNumbers' => data_get($archive['context'], 'contract.linkedContractNumbers', []),
                        'documentTemplateId' => (string) $template->id, 'documentTemplateCode' => $template->code, 'documentTemplateVersion' => (int) $template->version,
                        'documentTemplateSnapshotHash' => $archive['snapshotHash'], 'documentTemplateSnapshot' => $archive['snapshot'], 'documentInputs' => $archive['inputValues'],
                    ],
                ]);
                return ['id' => (string) $document->id, 'templateId' => (string) $template->id, 'templateCode' => $template->code, 'name' => $template->name, 'filename' => $archive['filename'], 'category' => implode(' / ', $template->category_path ?? []), 'previewUrl' => $document->preview_url];
            }, $archives));
        } catch (Throwable $error) {
            foreach ($written as $path) try { Storage::disk('local')->delete($path); } catch (Throwable) {}
            throw $error;
        }
    }

    private function resolveCategory(array $path): DocumentCategory
    {
        $parentId = null; $current = null;
        foreach ($path as $name) {
            $current = DocumentCategory::query()->where('parent_id', $parentId)->where('slug', Str::slug((string) $name))->where('is_active', true)->first();
            if (! $current) throw ValidationException::withMessages(['categoryPath' => 'Die Dokumentablage „'.implode(' / ', $path).'“ ist nicht vorhanden.']);
            $parentId = $current->id;
        }
        $resourceTypes = $current?->resource_types;
        if (! $current || ($resourceTypes !== null && ! in_array('contracts', $resourceTypes, true))) throw ValidationException::withMessages(['categoryPath' => 'Die Zielkategorie ist nicht für Vertragsdokumente freigegeben.']);
        return $current;
    }

    public function filename(DocumentTemplate $template, array $context): string
    {
        $missing = [];
        $name = $this->placeholders->render($template->filename_pattern, $context, $missing);
        $name = str_replace(['\\', '/', ':', '*', '?', chr(34), '<', '>', '|'], '-', trim($name));
        $name = preg_replace('/\s+/u', ' ', $name) ?: $name;
        $name = trim($name, " .-\t\n\r\0\x0B");
        if (! str_ends_with(strtolower($name), '.pdf')) $name .= '.pdf';
        $name = Str::limit($name, 240, '');
        return $name !== '.pdf' ? $name : 'Dokument.pdf';
    }
}
