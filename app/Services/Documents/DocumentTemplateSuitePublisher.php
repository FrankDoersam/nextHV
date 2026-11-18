<?php

namespace App\Services\Documents;

use App\Models\DocumentTemplate;
use App\Models\DocumentTemplateVersion;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;

final class DocumentTemplateSuitePublisher
{
    private const CANONICAL_DEFINITIONS = [
        'lease-contract-parking-space' => 'lease-contract-parking-space.json',
        'housing-provider-confirmation-residential' => 'housing-provider-confirmation-residential.json',
    ];

    public function __construct(
        private readonly CanvasToTiptapDocumentMigrator $migrator,
        private readonly DocumentEditorContentPolicy $policy,
        private readonly DocumentProfessionalLayoutPolicy $layoutPolicy,
    ) {}

    /** @param array<int,string>|null $codes */
    public function publish(bool $force = false, ?array $codes = null): void
    {
        if (! Schema::hasTable('document_templates')) {
            return;
        }

        $query = DocumentTemplate::query()
            ->orderBy('sort_order')
            ->orderBy('name');

        if (is_array($codes) && $codes !== []) {
            $query->whereIn('code', array_values(array_unique($codes)));
        }

        $query->each(function (DocumentTemplate $template) use ($force): void {
            $code = (string) $template->code;
            $definition = $this->canonicalDefinition($code);
            $style = is_array($template->style) ? $template->style : [];
            $blocks = is_array($template->blocks) ? $template->blocks : [];

            if (! $force && (int) ($style['documentSuiteDesignVersion'] ?? 0) >= DocumentProfessionalLayoutPolicy::VERSION) {
                return;
            }

            if ($definition !== null && is_array($definition['editorBlocks'] ?? null)) {
                $blocks = $definition['editorBlocks'];
                $style = [
                    ...$style,
                    ...(is_array($definition['style'] ?? null) ? $definition['style'] : []),
                ];
            } elseif (($suiteBlocks = $this->canonicalSuiteBlocks($code)) !== null) {
                // Built-in reports are authored as semantic Tiptap content.
                // Store that content directly instead of rebuilding visible
                // structure from renderer metadata.
                $blocks = $suiteBlocks;
            } elseif (! $this->looksLikeTiptap($blocks)) {
                // Keep compatibility for user-created legacy Canvas reports.
                $transfer = $this->migrator->migrate(
                    $blocks,
                    $style,
                    (string) ($template->title ?: $template->name),
                );
                $blocks = is_array($transfer['blocks'] ?? null) ? $transfer['blocks'] : $blocks;
                $style = is_array($transfer['style'] ?? null) ? $transfer['style'] : $style;
            }

            $style = $this->policy->style($style);
            $style = $this->layoutPolicy->style($style, $code);
            $name = (string) ($definition['name'] ?? $template->name ?: $template->title ?: 'Dokument');
            $blocks = $this->policy->normalize($blocks, $code, $name, $style);
            $blocks = $this->layoutPolicy->normalize($blocks, $code, $name, $style);

            $version = DocumentTemplate::isSingleVersionCode($code)
                ? 0
                : max(1, (int) $template->version + 1);

            $attributes = [
                'style' => $style,
                'blocks' => $blocks,
                'version' => $version,
            ];

            if ($definition !== null) {
                $attributes = [
                    ...$attributes,
                    'name' => $definition['name'] ?? $template->name,
                    'description' => $definition['description'] ?? $template->description,
                    'title' => $definition['title'] ?? $template->title,
                    'subtitle' => $definition['subtitle'] ?? null,
                    'input_definitions' => $definition['inputDefinitions'] ?? ($template->input_definitions ?? []),
                ];
            }

            $template->forceFill($attributes)->saveQuietly();
            $this->snapshot($template->fresh(), $version);
        });
    }

    /** @return array<int,array<string,mixed>>|null */
    private function canonicalSuiteBlocks(string $code): ?array
    {
        return match ($code) {
            'lease-contract-residential-source' => (new ResidentialLeaseDocumentBuilder())->build(),
            'lease-contract-garage-source' => (new GarageLeaseDocumentBuilder())->build(),
            'privacy-notice-residential' => (new PrivacyNoticeDocumentBuilder())->build(),
            'house-rules-residential' => (new HouseRulesDocumentBuilder())->build(),
            'handover-protocol-residential-source' => (new HandoverProtocolDocumentBuilder())->build(),
            'return-protocol-residential-source' => (new ReturnProtocolDocumentBuilder())->build(),
            default => null,
        };
    }

    private function canonicalDefinition(string $code): ?array
    {
        $file = self::CANONICAL_DEFINITIONS[$code] ?? null;
        if ($file === null) {
            return null;
        }

        $path = database_path('seeders/data/document-templates/'.$file);
        if (! File::exists($path)) {
            return null;
        }

        $definition = json_decode(File::get($path), true, 512, JSON_THROW_ON_ERROR);

        return is_array($definition) ? $definition : null;
    }

    /** @param array<int,mixed> $blocks */
    private function looksLikeTiptap(array $blocks): bool
    {
        $first = collect($blocks)->first(fn (mixed $node): bool => is_array($node));

        return is_array($first)
            && isset($first['type'])
            && ! array_key_exists('value', $first);
    }

    private function snapshot(?DocumentTemplate $template, int $version): void
    {
        if (! $template || ! Schema::hasTable('document_template_versions')) {
            return;
        }

        if (DocumentTemplate::isSingleVersionCode((string) $template->code)) {
            DocumentTemplateVersion::query()
                ->where('document_template_id', $template->id)
                ->where('version', '!=', 0)
                ->delete();
        }

        DocumentTemplateVersion::query()->updateOrCreate(
            ['document_template_id' => $template->id, 'version' => $version],
            ['snapshot' => $template->snapshot(), 'created_by' => null],
        );
    }
}
