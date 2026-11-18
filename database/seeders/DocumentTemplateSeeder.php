<?php

namespace Database\Seeders;

use App\Models\DocumentTemplate;
use App\Models\DocumentTemplateVersion;
use App\Services\Documents\CanvasSignatureBlockComponent;
use App\Services\Documents\CanvasToTiptapDocumentMigrator;
use App\Services\Documents\DocumentSignatureInputDefinitions;
use App\Services\Documents\DocumentSuiteDesign;
use App\Services\Documents\DocumentTemplateDefinitionAuditor;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;
use RuntimeException;

final class DocumentTemplateSeeder extends Seeder
{
    private const RETIRED_CODES = [
        'lease-contract-parking-space-flow',
        'return-protocol-residential-source',
    ];

    public function run(): void
    {
        $supportsDynamicInputs = Schema::hasColumn('document_templates', 'input_definitions');

        foreach ($this->definitions() as $definition) {
            // Bootstrap only. Business-authored reports in the DB are never
            // overwritten by a deploy or seed run.
            $template = DocumentTemplate::query()->where('code', $definition['code'])->first();

            if (! $template) {
                $attributes = [
                    'code' => $definition['code'],
                    'name' => $definition['name'],
                    'description' => $definition['description'] ?? null,
                    'document_type' => $definition['documentType'],
                    'contract_types' => $definition['contractTypes'],
                    'main_contract_only' => (bool) ($definition['mainContractOnly'] ?? false),
                    'filename_pattern' => $definition['filenamePattern'],
                    'category_path' => $definition['categoryPath'],
                    'title' => $definition['title'],
                    'subtitle' => $definition['subtitle'] ?? null,
                    'style' => $definition['style'] ?? [],
                    'blocks' => $definition['blocks'] ?? [],
                    'pdfme_template' => null,
                    'is_default' => (bool) ($definition['isDefault'] ?? false),
                    'is_active' => (bool) ($definition['isActive'] ?? true),
                    'sort_order' => (int) ($definition['sortOrder'] ?? 0),
                    'version' => DocumentTemplate::isSingleVersionCode((string) $definition['code']) ? 0 : 1,
                    'updated_by' => null,
                ];

                // This seeder is also invoked by historical migrations. Keep
                // bootstrap writes compatible with the schema that existed at
                // that migration point; the dedicated later migration populates
                // dynamic inputs after the column has been introduced.
                if ($supportsDynamicInputs) {
                    $attributes['input_definitions'] = $definition['inputDefinitions'] ?? [];
                }

                $template = DocumentTemplate::query()->create($attributes);
            }

            if (! DocumentTemplate::isSingleVersionCode((string) $template->code) && (int) $template->version < 1) {
                $template->forceFill(['version' => 1])->saveQuietly();
            }

            DocumentTemplateVersion::query()->updateOrCreate(
                ['document_template_id' => $template->id, 'version' => (int) $template->version],
                ['snapshot' => $template->snapshot(), 'created_by' => null],
            );
        }
    }

    /** @return array<int, array<string, mixed>> */
    private function definitions(): array
    {
        $directory = database_path('seeders/data/document-templates');
        $files = collect(File::files($directory));
        $auditor = app(DocumentTemplateDefinitionAuditor::class);
        $design = app(DocumentSuiteDesign::class);
        $signatureBlocks = app(CanvasSignatureBlockComponent::class);
        $toTiptap = app(CanvasToTiptapDocumentMigrator::class);

        $bases = $files->map(function ($file): string {
            $name = $file->getFilename();
            return preg_replace('/\.part\d+$/', '', $name) ?: $name;
        })->filter(fn (string $name): bool => str_ends_with($name, '.json'))->unique()->sort()->values();

        $definitions = [];
        foreach ($bases as $base) {
            $definition = $this->loadDefinition($directory, $files, $base);
            $code = (string) $definition['code'];
            if (in_array($code, self::RETIRED_CODES, true)) continue;

            $requestedEngine = (string) data_get($definition, 'style.engine', '');
            $explicitTiptap = $requestedEngine === 'tiptap-fpdf';
            $semanticSource = $this->looksLikeTiptap($definition['editorBlocks'] ?? null);
            $suite = in_array($code, DocumentSuiteDesign::SUITE_CODES, true);

            if ($explicitTiptap) {
                $blocks = $definition['editorBlocks'] ?? null;
                if (! is_array($blocks)) {
                    throw new RuntimeException("Tiptap-Dokumentvorlage {$base} besitzt keinen editorBlocks-Inhalt.");
                }

                // Explicit Tiptap/FPDF definitions are authored report data.
                // Preserve content, style and inputs exactly as declared in JSON.
                $style = is_array($definition['style'] ?? null) ? $definition['style'] : [];
                $definition['blocks'] = $blocks;
                $definition['style'] = [
                    ...$style,
                    'engine' => 'tiptap-fpdf',
                    'previewDataSource' => data_get($style, 'previewDataSource', 'sample'),
                    'objectType' => data_get($style, 'objectType', $this->objectType((string) ($definition['documentType'] ?? 'other'))),
                ];
            } elseif ($semanticSource) {
                // A semantic editorBlocks tree is already the report source.
                // Do not rebuild it through a report-specific PHP builder.
                $this->applySuiteIdentity($definition, $code);
                $this->applyInputDefaults($definition, $code);
                $transfer = $toTiptap->migrate(
                    $definition['editorBlocks'],
                    is_array($definition['style'] ?? null) ? $definition['style'] : [],
                    (string) ($definition['title'] ?? $definition['name'] ?? ''),
                );
                $definition['blocks'] = $transfer['blocks'];
                $definition['style'] = [
                    ...$transfer['style'],
                    'previewDataSource' => 'sample',
                    'objectType' => data_get($transfer['style'], 'objectType', $this->objectType((string) ($definition['documentType'] ?? 'other'))),
                ];
            } else {
                // Only true legacy Canvas/source-grid definitions still pass
                // through the compatibility builders during bootstrap.
                $definition = $auditor->audit($definition);
                $this->applySuiteIdentity($definition, $code);
                if ($suite) $definition['style'] = [];
                $this->applyInputDefaults($definition, $code);

                if ($suite) {
                    $blocks = $design->canonicalBlocks($code);
                    if ($blocks === []) throw new RuntimeException("Dokumentvorlage {$base} besitzt keinen Bootstrap-Inhalt.");
                    $definition['blocks'] = $blocks;
                } elseif (is_array($definition['editorBlocks'] ?? null)) {
                    $definition['blocks'] = $definition['editorBlocks'];
                } elseif (! is_array($definition['blocks'] ?? null)) {
                    throw new RuntimeException("Dokumentvorlage {$base} besitzt keinen editierbaren Inhalt.");
                }

                $style = is_array($definition['style'] ?? null) ? $definition['style'] : [];
                $style = [
                    ...$style,
                    'engine' => 'canvas-editor',
                    'pageSize' => 'A4',
                    'orientation' => 'portrait',
                ];

                if ($code === 'lease-contract-residential-source') {
                    $style['optionalPlaceholders'] = ['organization.contact', 'bank.accountHolder', 'bank.iban', 'unit.leaseAncillarySpacesLabel'];
                } elseif ($code === 'lease-contract-garage-source') {
                    $style['optionalPlaceholders'] = ['bank.accountHolder', 'bank.iban'];
                }

                $style = $design->styleFor($style, $code, (string) ($definition['documentType'] ?? ''));
                $definition['blocks'] = $design->upgradeBlocks($definition['blocks'], $code);
                $definition['blocks'] = $signatureBlocks->apply($definition['blocks'], $style);

                $transfer = $toTiptap->migrate(
                    is_array($definition['blocks'] ?? null) ? $definition['blocks'] : [],
                    $style,
                    (string) ($definition['title'] ?? $definition['name'] ?? ''),
                );
                $definition['blocks'] = $transfer['blocks'];
                $definition['style'] = [
                    ...$transfer['style'],
                    'previewDataSource' => 'sample',
                    'objectType' => data_get($transfer['style'], 'objectType', $this->objectType((string) ($definition['documentType'] ?? 'other'))),
                ];
            }

            unset($definition['pdfmeTemplate'], $definition['editorBlocks'], $definition['sourceGridPages']);
            $definitions[] = $definition;
        }

        return $definitions;
    }

    private function applyInputDefaults(array &$definition, string $code): void
    {
        if (in_array($code, [
            'lease-contract-residential-source',
            'lease-contract-garage-source',
            'handover-protocol-residential-source',
        ], true)) {
            $definition['inputDefinitions'] = DocumentSignatureInputDefinitions::contract();
            return;
        }

        if ($code === 'privacy-notice-residential') {
            $definition['inputDefinitions'] = [];
        }
    }

    private function looksLikeTiptap(mixed $blocks): bool
    {
        if (! is_array($blocks)) return false;
        $first = collect($blocks)->first(fn (mixed $node): bool => is_array($node));
        return is_array($first) && isset($first['type']) && ! array_key_exists('value', $first);
    }

    private function applySuiteIdentity(array &$definition, string $code): void
    {
        if ($code === 'lease-contract-residential-source') {
            $definition['name'] = $definition['title'] = 'Mietvertrag über Wohnraum';
            $definition['subtitle'] = null;
            $definition['description'] = 'Wohnraummietvertrag auf Rechtsstand 2026: klarer Vertragsinhalt, dynamische Mietmodelle und Betriebskosten, aktuelle Schutzvorschriften sowie sauber getrennte Einheits-, Nebenraum- und Gemeinschaftsdaten.';
        } elseif ($code === 'lease-contract-garage-source') {
            $definition['name'] = $definition['title'] = 'Mietvertrag über Garage / Stellplatz';
            $definition['subtitle'] = null;
            $definition['description'] = 'Eigenständiger Vertrag für Garage, Carport oder Stellplatz mit klarer Nutzung, Laufzeit, Kosten, E-Mobilität, Rückgabe und Abgrenzung zu einem möglichen Wohnraummietverhältnis.';
        } elseif ($code === 'privacy-notice-residential') {
            $definition['name'] = $definition['title'] = 'Datenschutzhinweise zum Mietverhältnis';
            $definition['subtitle'] = null;
            $definition['description'] = 'Kompakte Transparenzinformation nach Art. 13 und 14 DSGVO für Anbahnung, Durchführung und Beendigung des Mietverhältnisses; ohne unnötige Empfangsunterschrift.';
        } elseif ($code === 'handover-protocol-residential-source') {
            $definition['name'] = $definition['title'] = 'Übergabe- und Zustandsprotokoll';
            $definition['subtitle'] = null;
            $definition['description'] = 'Beweissicheres, neutrales Übergabeprotokoll mit Mietobjekt, Parteien, Schlüsseln, Zählern, Einrichtungen, Zustandsfeststellungen, Fotos und offenen Maßnahmen.';
        } elseif ($code === 'housing-provider-confirmation-residential') {
            $definition['name'] = $definition['title'] = 'Wohnungsgeberbestätigung nach § 19 BMG';
            $definition['subtitle'] = null;
            $definition['description'] = 'Wohnungsgeberbestätigung mit den gesetzlich erforderlichen Angaben nach § 19 Abs. 3 BMG. Das Layout ist frei gestaltet; ein bundesweit vorgegebenes Formular wird nicht vorausgesetzt.';
        }
    }

    private function loadDefinition(string $directory, $files, string $base): array
    {
        $direct = $directory.DIRECTORY_SEPARATOR.$base;
        if (File::exists($direct)) {
            $json = File::get($direct);
        } else {
            $parts = $files->filter(fn ($file): bool => str_starts_with($file->getFilename(), $base.'.part'))
                ->sortBy(fn ($file): string => $file->getFilename())
                ->values();
            if ($parts->isEmpty()) throw new RuntimeException("Keine Definition für Dokumentvorlage {$base} gefunden.");
            $json = $parts->map(fn ($file): string => File::get($file->getPathname()))->implode('');
        }

        $definition = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
        if (! is_array($definition) || ! filled($definition['code'] ?? null)) {
            throw new RuntimeException("Ungültige Dokumentvorlage {$base}.");
        }

        return $definition;
    }

    private function objectType(string $documentType): string
    {
        return in_array($documentType, ['payment_reminder', 'dunning_level_1', 'dunning_level_2', 'receipt', 'budget_actual'], true)
            ? 'open_item'
            : (in_array($documentType, ['house_rules', 'lease_contract', 'privacy_notice', 'emergency_key', 'handover_protocol', 'letter', 'operating_cost_statement'], true) ? 'contract' : 'property');
    }
}
