<?php

namespace App\Services\Documents;

use App\Models\DocumentTemplate;

/**
 * Projects first-class editor nodes into the transient FPDF page-chrome API.
 * Headers and additional footer text are authored; issuer data and footer
 * typography belong to the central organization profile layout.
 */
final class TiptapPaperChromeProjector
{
    public function __construct(
        private readonly TemplatePlaceholderEngine $placeholders,
        private readonly DocumentProfessionalLayoutPolicy $layoutPolicy = new DocumentProfessionalLayoutPolicy,
    ) {}

    public function project(DocumentTemplate $template, array $context, ?array $blocksOverride = null): DocumentTemplate
    {
        $projected = clone $template;
        $blocks = is_array($blocksOverride) ? $blocksOverride : ($template->blocks ?? []);
        $style = is_array($template->style) ? $template->style : [];
        $body = [];

        // The authored header and footer supplement come from editor nodes.
        // Legacy footer styles cannot override the shared profile layout.
        foreach ([
            'pageHeaderText', 'pageHeaderAlign', 'pageHeaderFontFamily', 'pageHeaderFontSize',
            'pageFooterText', 'pageFooterAlign', 'pageFooterFontFamily', 'pageFooterFontSize',
            'footerPageNumberFormat', 'footerPageNumberAlign', 'footerFontSize',
        ] as $legacyChromeKey) unset($style[$legacyChromeKey]);
        $style['headerPreset'] = 'none';
        $style['footerPageNumber'] = true;

        foreach ($blocks as $node) {
            if (! is_array($node)) continue;
            $type = (string) ($node['type'] ?? '');
            $attrs = is_array($node['attrs'] ?? null) ? $node['attrs'] : [];

            if ($type === 'documentFormat') {
                if (filled($attrs['fontFamily'] ?? null)) $style['fontFamily'] = (string) $attrs['fontFamily'];
                if (is_numeric($attrs['fontSize'] ?? null)) $style['fontSize'] = (float) $attrs['fontSize'];
                continue;
            }

            if ($type === 'pageHeader') {
                $style['pageHeaderText'] = $this->inlineText($node['content'] ?? [], $context);
                $style['pageHeaderAlign'] = (string) ($attrs['align'] ?? 'right');
                $style['pageHeaderFontFamily'] = (string) ($attrs['fontFamily'] ?? $style['fontFamily'] ?? 'Helvetica');
                $style['pageHeaderFontSize'] = (float) ($attrs['fontSize'] ?? 7.2);
                continue;
            }

            if ($type === 'pageFooter') {
                $style['pageFooterText'] = $this->layoutPolicy->footerSupplement(
                    (string) $template->code,
                    $this->inlineText($node['content'] ?? [], $context),
                );
                // Typography and page numbers are owned by OrganizationProfilePdfLayout.
                continue;
            }

            $body[] = $node;
        }

        $projected->forceFill(['style' => $style, 'blocks' => $body]);
        return $projected;
    }

    private function inlineText(mixed $content, array $context): string
    {
        if (! is_array($content)) return '';
        $text = '';
        foreach ($content as $node) {
            if (! is_array($node)) continue;
            $type = (string) ($node['type'] ?? '');
            if ($type === 'text') {
                $missing = [];
                $text .= $this->placeholders->render((string) ($node['text'] ?? ''), $context, $missing);
                continue;
            }
            if ($type === 'variable') {
                $path = trim((string) data_get($node, 'attrs.path', ''));
                if ($path !== '') $text .= $this->scalarText(data_get($context, $path));
                continue;
            }
            if ($type === 'hardBreak') {
                $text .= ' · ';
                continue;
            }
            if (is_array($node['content'] ?? null)) $text .= $this->inlineText($node['content'], $context);
        }
        return trim(preg_replace('/\s+/u', ' ', $text) ?: $text);
    }

    private function scalarText(mixed $value): string
    {
        if ($value === null) return '';
        if (is_bool($value)) return $value ? 'Ja' : 'Nein';
        if (is_scalar($value)) return (string) $value;
        if (is_array($value)) return collect($value)->map(fn (mixed $item): string => is_scalar($item) ? (string) $item : (is_array($item) ? (string) ($item['name'] ?? $item['label'] ?? $item['display'] ?? '') : ''))->filter()->implode(', ');
        return '';
    }
}
