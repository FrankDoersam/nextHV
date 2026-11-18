<?php

namespace App\Services\Documents;

use App\Models\DocumentTemplate;
use Illuminate\Validation\ValidationException;

final class TiptapFpdfRenderer
{
    private const PAGE_WIDTH = 210.0;
    private const PAGE_HEIGHT = 297.0;

    public function __construct(private readonly TemplatePlaceholderEngine $placeholders) {}

    public function render(DocumentTemplate $template, array $context, ?array $blocksOverride = null): string
    {
        $nodes = $this->normalizeNodes($blocksOverride ?? ($template->blocks ?? []));
        if ($nodes === []) {
            throw ValidationException::withMessages(['template' => 'Die Dokumentvorlage enthält keinen editierbaren Inhalt.']);
        }

        $style = is_array($template->style) ? $template->style : [];
        $left = (float) ($style['marginLeft'] ?? 18.0);
        $right = (float) ($style['marginRight'] ?? 18.0);
        $bottom = (float) ($style['marginBottom'] ?? 12.0);
        $fontSize = (float) ($style['fontSize'] ?? 9.2);
        $lineHeight = (float) ($style['lineHeight'] ?? 4.5);

        $missing = [];
        $title = $this->placeholders->render((string) ($template->title ?: $template->name), $context, $missing);
        $subtitle = $this->placeholders->render((string) ($template->subtitle ?? ''), $context, $missing);
        $continuation = trim((string) data_get($context, 'property.fullAddress', ''));

        $pdf = new TiptapPdfDocument('P', 'mm', 'A4');
        $pdf->SetTitle($pdf->encode($title));
        $pdf->SetAuthor($pdf->encode((string) data_get($context, 'organization.name', '')));
        $pdf->SetMargins($left, (float) ($style['marginTop'] ?? 16.0), $right);
        $footerOptions = (array) ($context['documentFooter'] ?? []);
        $footerOptions['reference'] ??= implode(' · ', array_filter([
            $title,
            filled(data_get($context, 'contract.number')) ? 'Vertrag '.data_get($context, 'contract.number') : '',
        ]));
        $pdf->configureDocument($title, $subtitle, $continuation, $style, (array) ($context['organization'] ?? []), $footerOptions);
        $bottom = $pdf->minimumBottomMargin($bottom);
        $pdf->SetAutoPageBreak(true, $bottom);
        $pdf->AddPage();
        $pdf->SetFont('Helvetica', '', $fontSize);

        foreach ($nodes as $index => $node) {
            if (is_array($node)) {
                $this->keepSignatureIntroductionTogether($pdf, $nodes, $index, $context, $style, $left, $right, $bottom, $fontSize, $lineHeight);
                $this->renderNode($pdf, $node, $context, $style, $left, $right, $bottom, $fontSize, $lineHeight);
            }
        }

        return $pdf->Output('S');
    }

    /** Keep a short signature heading and its explanation with the actual signature. */
    private function keepSignatureIntroductionTogether(TiptapPdfDocument $pdf, array $nodes, int $index, array $context, array $style, float $left, float $right, float $bottom, float $fontSize, float $lineHeight): void
    {
        if (($style['signatureKeepTogether'] ?? true) === false
            || ! in_array($nodes[$index]['type'] ?? '', ['horizontalRule', 'heading'], true)) return;

        $group = [];
        for ($next = $index; $next < min(count($nodes), $index + 4); $next++) {
            $node = $nodes[$next];
            $type = $node['type'] ?? '';
            if ($type === 'signatureBlock') {
                $group[] = $node;
                break;
            }
            if (! in_array($type, ['horizontalRule', 'heading', 'paragraph', 'blockquote'], true)
                || ($type === 'blockquote' && $this->isDocumentReferenceNode($node))) return;
            $group[] = $node;
        }
        if (($group[array_key_last($group)]['type'] ?? '') !== 'signatureBlock') return;

        // Use the existing drawing path on a copy: headings, rich text and
        // signatures must not acquire a second, approximate measurement engine.
        $probe = clone $pdf;
        foreach ($group as $node) $this->renderNode($probe, $node, $context, $style, $left, $right, $bottom, $fontSize, $lineHeight);
        if ($probe->PageNo() === $pdf->PageNo()) return;

        $probe = clone $pdf;
        $probe->AddPage();
        $page = $probe->PageNo();
        foreach ($group as $node) $this->renderNode($probe, $node, $context, $style, $left, $right, $bottom, $fontSize, $lineHeight);
        if ($probe->PageNo() === $page) $pdf->AddPage();
    }

    private function renderNode(TiptapPdfDocument $pdf, array $node, array $context, array $style, float $left, float $right, float $bottom, float $fontSize, float $lineHeight, int $listDepth = 0, ?string $listPrefix = null): void
    {
        $type = (string) ($node['type'] ?? '');

        if ($type === 'heading') {
            $level = max(1, min(3, (int) data_get($node, 'attrs.level', 2)));
            $text = trim($this->plainText($node['content'] ?? [], $context));
            if ($text === '') return;
            $alignment = $this->nodeAlignment($node);
            if (($style['headingTreatment'] ?? null) === 'editorial') {
                $this->drawEditorialHeading($pdf, $text, $level, $style, $left, self::PAGE_WIDTH - $right, $bottom, $alignment);
            } elseif ($level === 1) {
                $this->ensureSpace($pdf, 12.0, $bottom);
                $pdf->Ln(1.5);
                $pdf->SetFont('Helvetica', 'B', 14.0);
                $this->setTextColor($pdf, (string) ($style['sectionHeaderTextColor'] ?? '22313D'));
                $pdf->SetX($left);
                $pdf->MultiCell(self::PAGE_WIDTH - $left - $right, 5.5, $pdf->encode($text), 0, $alignment);
                $pdf->SetTextColor(0, 0, 0);
                $pdf->Ln(1.5);
            } else {
                $this->drawSectionTitle($pdf, $text, $style, $left + (($level - 2) * 2.0), self::PAGE_WIDTH - $right, $bottom, $level === 2 ? 8.7 : 8.1, $alignment);
            }
            return;
        }

        if ($type === 'paragraph') {
            $runs = $this->inlineRuns($node['content'] ?? [], $context);
            if ($runs === []) {
                $height = max(0.0, (float) ($style['emptyParagraphHeight'] ?? $lineHeight));
                if ($height > 0) {
                    $this->ensureSpace($pdf, $height, $bottom);
                    $pdf->Ln($height);
                }
                return;
            }
            $paragraphLeft = $left + ($listDepth * 4.6);
            $this->keepShortParagraphTogether($pdf, $runs, $paragraphLeft, $right, $lineHeight, $fontSize, $bottom, $listPrefix, $style);
            $this->writeRuns($pdf, $runs, $paragraphLeft, $right, $lineHeight, $fontSize, $bottom, $listPrefix, $style, $this->nodeAlignment($node));
            $pdf->Ln((float) ($style['paragraphGap'] ?? 1.05));
            return;
        }

        if ($type === 'bulletList' || $type === 'orderedList') {
            $index = 1;
            foreach (($node['content'] ?? []) as $item) {
                if (! is_array($item) || ($item['type'] ?? null) !== 'listItem') continue;
                $prefix = $type === 'orderedList' ? $index.'.' : '•';
                $first = true;
                foreach (($item['content'] ?? []) as $child) {
                    if (! is_array($child)) continue;
                    $this->renderNode($pdf, $child, $context, $style, $left, $right, $bottom, $fontSize, $lineHeight, $listDepth + 1, $first ? $prefix : null);
                    $first = false;
                }
                $index++;
            }
            return;
        }

        if ($type === 'invoicePositionTable') {
            $this->renderInvoicePositionTable($pdf, $node, $style, $left, $right, $bottom);
            $pdf->Ln(max(0.0, (float) data_get($node, 'attrs.gapAfter', $style['tableGap'] ?? 1.0)));
            return;
        }
        if ($type === 'paymentQrBlock') {
            $this->renderPaymentQrBlock($pdf, $node, $left, $right, $bottom, $fontSize, $lineHeight);
            return;
        }
        if ($type === 'table') {
            $this->renderTable($pdf, $node, $context, $style, $left, $right, $bottom, $fontSize, $lineHeight);
            $pdf->Ln((float) ($style['tableGap'] ?? 1.0));
            return;
        }
        if ($type === 'relationTable') {
            $this->renderRelationTable($pdf, $node, $context, $style, $left, $right, $bottom, $fontSize, $lineHeight);
            $pdf->Ln((float) ($style['tableGap'] ?? 1.0));
            return;
        }
        if ($type === 'signatureBlock') {
            $this->renderSignatureBlock($pdf, $node, $context, $style, $left, $right, $bottom, $fontSize);
            return;
        }
        if ($type === 'horizontalRule') {
            $gapBefore = max(0.0, (float) ($style['horizontalRuleGapBefore'] ?? 2.0));
            $gapAfter = max(0.0, (float) ($style['horizontalRuleGapAfter'] ?? 2.8));
            $this->ensureSpace($pdf, $gapBefore + $gapAfter + 0.4, $bottom);
            if ($gapBefore > 0) $pdf->Ln($gapBefore);
            $y = $pdf->GetY();
            $this->setDrawColor($pdf, (string) ($style['horizontalRuleColor'] ?? $style['headingRuleColor'] ?? $style['tableBorderColor'] ?? 'DCE3E8'));
            $pdf->SetLineWidth(max(0.05, (float) ($style['horizontalRuleLineWidth'] ?? 0.14)));
            $pdf->Line($left, $y, self::PAGE_WIDTH - $right, $y);
            $pdf->SetY($y + $gapAfter);
            return;
        }
        if ($type === 'pageBreak') {
            if (! (bool) ($style['preserveSourcePageBreaks'] ?? false)) return;
            if ($pdf->GetY() > (float) ($style['continuationBodyTop'] ?? 27.0) + 1.0) $pdf->AddPage();
            return;
        }
        if ($type === 'blockquote') {
            if ($this->isDocumentReferenceNode($node)) {
                $this->renderDocumentReference($pdf, $node, $context, $style, $left, $right, $bottom);
                return;
            }

            $text = trim($this->plainText($node['content'] ?? [], $context));
            if ($text === '') return;
            $width = self::PAGE_WIDTH - $left - $right;
            $lines = $this->wrapText($pdf, $text, $width - 8.0, $fontSize - 0.1, false);
            $height = max(8.0, (count($lines) * $lineHeight) + 4.0);
            $this->ensureSpace($pdf, $height, $bottom);
            $y = $pdf->GetY();
            $this->setFillColor($pdf, 'F7F9FA');
            $pdf->Rect($left, $y, $width, $height, 'F');
            $this->setFillColor($pdf, (string) ($style['headingAccentColor'] ?? $style['sectionHeaderAccentColor'] ?? '3F637D'));
            $pdf->Rect($left, $y, 0.9, $height, 'F');
            $this->setTextColor($pdf, '53626E');
            $pdf->SetFont('Helvetica', '', $fontSize - 0.1);
            $pdf->SetXY($left + 3.6, $y + 2.0);
            $pdf->MultiCell($width - 6.0, $lineHeight, $pdf->encode($text), 0, $this->descendantAlignment($node));
            $pdf->SetTextColor(0, 0, 0);
            $pdf->SetY($y + $height + 1.2);
            return;
        }

        foreach (($node['content'] ?? []) as $child) {
            if (is_array($child)) $this->renderNode($pdf, $child, $context, $style, $left, $right, $bottom, $fontSize, $lineHeight, $listDepth);
        }
    }

    private function drawEditorialHeading(TiptapPdfDocument $pdf, string $text, int $level, array $style, float $left, float $rightX, float $bottom, string $alignment = 'L'): void
    {
        $size = (float) ($style['h'.$level.'FontSize'] ?? ($level === 1 ? 16.0 : ($level === 2 ? 11.0 : 9.5)));
        $height = (float) ($style['h'.$level.'LineHeight'] ?? ($level === 1 ? 6.2 : ($level === 2 ? 5.0 : 4.4)));
        $gapBefore = (float) ($style['h'.$level.'GapBefore'] ?? ($level === 1 ? 0.0 : ($level === 2 ? 3.2 : 2.0)));
        $gapAfter = (float) ($style['h'.$level.'GapAfter'] ?? ($level === 1 ? 3.0 : ($level === 2 ? 1.4 : 0.8)));
        $width = $rightX - $left;
        $estimatedLines = max(1, count($this->wrapText($pdf, $text, $width, $size, true)));
        $required = $gapBefore + ($estimatedLines * $height) + $gapAfter + ($level === 2 ? 1.3 : 0.0);
        $this->ensureSpace($pdf, $required + ($level === 2 ? 7.0 : 0.0), $bottom);
        if ($gapBefore > 0 && $pdf->GetY() > (float) ($style['marginTop'] ?? 16.0) + 2.0) $pdf->Ln($gapBefore);
        $this->setTextColor($pdf, (string) ($style['headingTextColor'] ?? '162B36'));
        $pdf->SetFont('Helvetica', 'B', $size);
        $pdf->SetX($left);
        $pdf->MultiCell($width, $height, $pdf->encode($text), 0, $this->normalizeAlignment($alignment));
        if ($level === 1) {
            $y = $pdf->GetY() + 0.8;
            $this->setDrawColor($pdf, (string) ($style['headingAccentColor'] ?? '2E657C'));
            $pdf->SetLineWidth(0.42);
            $pdf->Line($left, $y, $left + min(34.0, $width * 0.22), $y);
            $pdf->SetY($y + $gapAfter);
        } elseif ($level === 2) {
            $y = $pdf->GetY() + 0.35;
            $this->setDrawColor($pdf, (string) ($style['headingRuleColor'] ?? 'D8E1E6'));
            $pdf->SetLineWidth(0.12);
            $pdf->Line($left, $y, $rightX, $y);
            $pdf->SetY($y + $gapAfter);
        } else {
            $pdf->Ln($gapAfter);
        }
        $pdf->SetTextColor(0, 0, 0);
    }

    private function keepShortParagraphTogether(TiptapPdfDocument $pdf, array $runs, float $left, float $right, float $lineHeight, float $fontSize, float $bottom, ?string $prefix, array $style): void
    {
        $text = trim(collect($runs)->pluck('text')->implode(''));
        if ($text === '' || str_contains($text, "\n")) return;
        $available = self::PAGE_WIDTH - $left - $right - ($prefix !== null ? 6.0 : 0.0);
        $lines = $this->wrapText($pdf, $text, max(20.0, $available), $fontSize, false);
        $lineCount = count($lines);
        if ($lineCount < 1 || $lineCount > 4) return;
        $required = ($lineCount * $lineHeight) + max(0.0, (float) ($style['paragraphGap'] ?? 1.05));
        if ($pdf->GetY() + $required > self::PAGE_HEIGHT - $bottom) $pdf->AddPage();
    }

    private function writeRuns(TiptapPdfDocument $pdf, array $runs, float $left, float $right, float $lineHeight, float $baseFontSize, float $bottom, ?string $prefix, array $style, string $alignment = 'L'): void
    {
        $rightX = self::PAGE_WIDTH - $right;
        $pdf->SetX($left);
        $x = $left;
        $continuationLeft = $left;
        if ($prefix !== null) {
            $pdf->SetFont('Helvetica', 'B', $baseFontSize);
            $prefixText = $pdf->encode($prefix.' ');
            $prefixWidth = max(5.0, $pdf->GetStringWidth($prefixText));
            $this->ensureSpace($pdf, $lineHeight, $bottom);
            $this->setTextColor($pdf, (string) ($style['headingAccentColor'] ?? $style['sectionHeaderAccentColor'] ?? '3F637D'));
            $pdf->Cell($prefixWidth, $lineHeight, $prefixText, 0, 0, 'L');
            $pdf->SetTextColor(0, 0, 0);
            $x = $pdf->GetX();
            $continuationLeft = $left + $prefixWidth;
        }

        $alignment = $this->normalizeAlignment($alignment);
        if ($alignment !== 'L' && $prefix === null) {
            $this->writeAlignedRuns($pdf, $runs, $continuationLeft, $rightX, $lineHeight, $baseFontSize, $bottom, $alignment);
            $pdf->SetX($left);
            return;
        }

        foreach ($runs as $run) {
            $text = (string) ($run['text'] ?? '');
            if ($text === '') continue;
            $fontStyle = $this->fontStyle($run);
            $pdf->SetFont('Helvetica', $fontStyle, $baseFontSize);
            $tokens = preg_split('/(\n|\s+)/u', $text, -1, PREG_SPLIT_DELIM_CAPTURE | PREG_SPLIT_NO_EMPTY) ?: [$text];
            foreach ($tokens as $token) {
                if ($token === "\n") {
                    $pdf->Ln($lineHeight);
                    $this->ensureSpace($pdf, $lineHeight, $bottom);
                    $pdf->SetX($continuationLeft);
                    $x = $continuationLeft;
                    continue;
                }
                $isWhitespace = preg_match('/^\s+$/u', $token) === 1;
                $encoded = $pdf->encode($token);
                $width = $pdf->GetStringWidth($encoded);
                if (! $isWhitespace && $x + $width > $rightX && $x > $continuationLeft + 0.1) {
                    $pdf->Ln($lineHeight);
                    $this->ensureSpace($pdf, $lineHeight, $bottom);
                    $pdf->SetX($continuationLeft);
                    $x = $continuationLeft;
                }
                if ($isWhitespace && $x <= $continuationLeft + 0.1) continue;
                $this->ensureSpace($pdf, $lineHeight, $bottom);
                $pdf->Cell($width, $lineHeight, $encoded, 0, 0, 'L');
                $x = $pdf->GetX();
            }
        }
        $pdf->Ln($lineHeight);
        $pdf->SetX($left);
    }

    private function writeAlignedRuns(TiptapPdfDocument $pdf, array $runs, float $left, float $rightX, float $lineHeight, float $fontSize, float $bottom, string $alignment): void
    {
        $available = max(1.0, $rightX - $left);
        $lines = $this->layoutAlignedRunLines($pdf, $runs, $available, $fontSize);

        foreach ($lines as $line) {
            $this->ensureSpace($pdf, $lineHeight, $bottom);
            $tokens = $line['tokens'] ?? [];
            if ($tokens === []) {
                $pdf->Ln($lineHeight);
                continue;
            }

            $lineWidth = (float) ($line['width'] ?? 0.0);
            $startX = $left;
            if ($alignment === 'C') $startX = $left + max(0.0, ($available - $lineWidth) / 2);
            elseif ($alignment === 'R') $startX = $left + max(0.0, $available - $lineWidth);

            $spaceCount = count(array_filter($tokens, fn (array $token): bool => (bool) ($token['space'] ?? false)));
            $extraSpace = 0.0;
            if ($alignment === 'J' && ! (bool) ($line['paragraphEnd'] ?? false) && $spaceCount > 0) {
                $extraSpace = max(0.0, $available - $lineWidth) / $spaceCount;
            }

            $pdf->SetX($startX);
            foreach ($tokens as $token) {
                $pdf->SetFont('Helvetica', (string) ($token['fontStyle'] ?? ''), $fontSize);
                $width = (float) ($token['width'] ?? 0.0);
                $isSpace = (bool) ($token['space'] ?? false);
                if ($isSpace) {
                    $pdf->Cell($width + $extraSpace, $lineHeight, '', 0, 0, 'L');
                    continue;
                }
                $pdf->Cell($width, $lineHeight, $pdf->encode((string) ($token['text'] ?? '')), 0, 0, 'L');
            }
            $pdf->Ln($lineHeight);
        }
    }

    private function layoutAlignedRunLines(TiptapPdfDocument $pdf, array $runs, float $available, float $fontSize): array
    {
        $lines = [];
        $tokens = [];
        $lineWidth = 0.0;

        $flush = function (bool $paragraphEnd, bool $force = false) use (&$lines, &$tokens, &$lineWidth): void {
            while ($tokens !== [] && (bool) ($tokens[array_key_last($tokens)]['space'] ?? false)) {
                $last = array_pop($tokens);
                $lineWidth -= (float) ($last['width'] ?? 0.0);
            }
            if ($tokens !== [] || $force) {
                $lines[] = ['tokens' => $tokens, 'width' => max(0.0, $lineWidth), 'paragraphEnd' => $paragraphEnd];
            }
            $tokens = [];
            $lineWidth = 0.0;
        };

        foreach ($runs as $run) {
            $text = (string) ($run['text'] ?? '');
            if ($text === '') continue;
            $fontStyle = $this->fontStyle($run);
            $pdf->SetFont('Helvetica', $fontStyle, $fontSize);
            foreach (preg_split('/(\n|\s+)/u', $text, -1, PREG_SPLIT_DELIM_CAPTURE | PREG_SPLIT_NO_EMPTY) ?: [$text] as $tokenText) {
                if ($tokenText === "\n") {
                    $flush(true, true);
                    continue;
                }

                $isSpace = preg_match('/^\s+$/u', $tokenText) === 1;
                if ($isSpace && $tokens === []) continue;
                $pdf->SetFont('Helvetica', $fontStyle, $fontSize);
                $tokenWidth = $pdf->GetStringWidth($pdf->encode($tokenText));

                if (! $isSpace && $tokens !== [] && $lineWidth + $tokenWidth > $available) {
                    $flush(false);
                }
                if ($isSpace && $tokens === []) continue;

                $tokens[] = [
                    'text' => $tokenText,
                    'width' => $tokenWidth,
                    'space' => $isSpace,
                    'fontStyle' => $fontStyle,
                ];
                $lineWidth += $tokenWidth;
            }
        }

        $flush(true, $lines === []);
        return $lines;
    }

    private function fontStyle(array $run): string
    {
        $style = (($run['bold'] ?? false) ? 'B' : '').(($run['italic'] ?? false) ? 'I' : '');
        if (($run['underline'] ?? false) === true) $style .= 'U';
        return $style;
    }

    private function renderTable(TiptapPdfDocument $pdf, array $node, array $context, array $style, float $left, float $right, float $bottom, float $fontSize, float $lineHeight): void
    {
        $tableOverrides = data_get($node, 'attrs.pdfStyle');
        $tableStyle = array_merge($style, is_array($tableOverrides) ? $tableOverrides : []);

        $sourceRows = array_values(array_filter($node['content'] ?? [], fn ($row): bool => is_array($row) && ($row['type'] ?? null) === 'tableRow'));
        if ($sourceRows === []) return;
        $rows = [];
        foreach ($sourceRows as $row) {
            $cells = [];
            foreach (($row['content'] ?? []) as $cell) {
                if (! is_array($cell)) continue;
                $header = ($cell['type'] ?? null) === 'tableHeader';
                $cells[] = [
                    'text' => $this->plainText($cell['content'] ?? [], $context),
                    'header' => $header,
                    'align' => $this->tableCellAlignment($cell, $tableStyle, $header),
                    'colspan' => max(1, (int) data_get($cell, 'attrs.colspan', 1)),
                    'colwidth' => is_array(data_get($cell, 'attrs.colwidth')) ? data_get($cell, 'attrs.colwidth') : null,
                ];
            }
            if ($cells !== []) $rows[] = ['cells' => $cells];
        }
        if (count($rows) === 1 && collect($rows[0]['cells'])->every(fn (array $cell): bool => $cell['header'])) {
            if (($tableStyle['headingTreatment'] ?? null) === 'editorial') {
                $text = collect($rows[0]['cells'])->pluck('text')->filter()->implode(' ');
                $this->drawEditorialHeading($pdf, $text, 2, $tableStyle, $left, self::PAGE_WIDTH - $right, $bottom);
            } else {
                $this->drawSectionRow($pdf, $rows[0]['cells'], $tableStyle, $left, self::PAGE_WIDTH - $right, $bottom, $fontSize);
            }
            return;
        }
        $columnCount = max(array_map(fn (array $row): int => max(1, array_sum(array_map(fn (array $cell): int => max(1, (int) ($cell['colspan'] ?? 1)), $row['cells'] ?? []))), $rows));
        $pendingRows = [];
        foreach ($rows as $row) {
            if ($this->isEmbeddedSectionHeader($row, $columnCount)) {
                if ($pendingRows !== []) {
                    $this->drawTableRows($pdf, $pendingRows, $tableStyle, $left, self::PAGE_WIDTH - $right, $bottom, $fontSize, $lineHeight);
                    $pendingRows = [];
                }
                $text = collect($row['cells'])->pluck('text')->filter()->implode(' ');
                if (($tableStyle['headingTreatment'] ?? null) === 'editorial') $this->drawEditorialHeading($pdf, $text, 2, $tableStyle, $left, self::PAGE_WIDTH - $right, $bottom);
                else $this->drawSectionRow($pdf, $row['cells'], $tableStyle, $left, self::PAGE_WIDTH - $right, $bottom, $fontSize);
                continue;
            }
            $pendingRows[] = $row;
        }
        if ($pendingRows !== []) $this->drawTableRows($pdf, $pendingRows, $tableStyle, $left, self::PAGE_WIDTH - $right, $bottom, $fontSize, $lineHeight);
    }

    private function isEmbeddedSectionHeader(array $row, int $columnCount): bool
    {
        $cells = $row['cells'] ?? [];
        if (count($cells) !== 1 || ! (bool) ($cells[0]['header'] ?? false)) return false;
        $colspan = max(1, (int) ($cells[0]['colspan'] ?? 1));
        $text = trim((string) ($cells[0]['text'] ?? ''));
        return $colspan >= $columnCount && preg_match('/^\d+[.]?\s+/u', $text) === 1;
    }

    /**
     * Letter closing and the statement's 32-mm SEPA QR treatment share one
     * printable block. Only the captured data is rendered; the shared DIN
     * letter chrome, footer and quiet zone are untouched.
     */
    private function renderPaymentQrBlock(TiptapPdfDocument $pdf, array $node, float $left, float $right, float $bottom, float $fontSize, float $lineHeight): void
    {
        $attrs = (array) ($node['attrs'] ?? []);
        $encoded = (string) ($attrs['png'] ?? '');
        $png = strlen($encoded) <= 700_000 ? base64_decode($encoded, true) : false;

        // Older internal nodes contain one combined text field. New notices
        // preserve closing, greeting and sender as separate layout parts.
        $structured = array_key_exists('closingText', $attrs);
        $closing = trim((string) ($structured ? $attrs['closingText'] : ($attrs['text'] ?? '')));
        $signoff = $structured ? trim((string) ($attrs['signoff'] ?? '')) : '';
        $sender = $structured ? trim((string) ($attrs['senderName'] ?? '')) : '';

        $width = self::PAGE_WIDTH - $left - $right;
        $qrSize = 32.0;
        $textWidth = $width - $qrSize - 5.0;
        // Text() positions the baseline exactly. Cell() added vertical leading
        // that made the caption look detached from the QR's bottom quiet zone.
        $captionBaselineBelowQr = 1.5;
        $captionReservedHeight = 2.5;
        $blockGapBefore = 3.0;
        $signoffGap = 3.0;
        $senderGap = 2.5;

        if (! is_string($png) || strlen($png) > 512_000 || ! str_starts_with($png, "\x89PNG\r\n\x1a\n")) {
            // Invalid legacy image data must never suppress the full closing.
            $lines = $this->wrapText($pdf, implode("\n\n", array_filter(
                [$closing, $signoff, $sender], static fn (string $text): bool => $text !== ''
            )), $width, $fontSize, false);
            $pdf->Ln($blockGapBefore);
            foreach ($lines as $line) {
                $this->ensureSpace($pdf, $lineHeight, $bottom);
                $pdf->SetX($left);
                $pdf->Cell($width, $lineHeight, $pdf->encode($line), 0, 1);
            }
            return;
        }

        $closingLines = $closing !== '' ? $this->wrapText($pdf, $closing, $textWidth, $fontSize, false) : [];
        $signoffLines = $signoff !== '' ? $this->wrapText($pdf, $signoff, $textWidth, $fontSize, false) : [];
        $senderLines = $sender !== '' ? $this->wrapText($pdf, $sender, $textWidth, $fontSize, false) : [];

        // An unusually long custom closing is printed in full across normal
        // pages. Its signoff still stays on the same page as the payment QR.
        if (count($closingLines) * $lineHeight > 155.0) {
            $pdf->Ln($blockGapBefore);
            foreach ($this->wrapText($pdf, $closing, $width, $fontSize, false) as $line) {
                $this->ensureSpace($pdf, $lineHeight, $bottom);
                $pdf->SetX($left);
                $pdf->Cell($width, $lineHeight, $pdf->encode($line), 0, 1);
            }
            $closingLines = [];
        }

        $textHeight = count($closingLines) * $lineHeight
            + ($signoffLines !== [] ? ($closingLines !== [] ? $signoffGap : 0.0) + count($signoffLines) * $lineHeight : 0.0)
            + ($senderLines !== [] ? ($signoffLines !== [] || $closingLines !== [] ? $senderGap : 0.0) + count($senderLines) * $lineHeight : 0.0);
        $height = max($qrSize + $captionReservedHeight, $textHeight);

        $this->ensureSpace($pdf, $blockGapBefore + $height + 1.0, $bottom);
        $pdf->Ln($blockGapBefore);
        $top = $pdf->GetY();
        $pdf->SetFont('Helvetica', '', $fontSize);
        foreach ($closingLines as $line) {
            $pdf->SetX($left);
            $pdf->Cell($textWidth, $lineHeight, $pdf->encode($line), 0, 1);
        }
        if ($signoffLines !== []) {
            if ($closingLines !== []) $pdf->Ln($signoffGap);
            foreach ($signoffLines as $line) {
                $pdf->SetX($left);
                $pdf->Cell($textWidth, $lineHeight, $pdf->encode($line), 0, 1);
            }
        }
        if ($senderLines !== []) {
            if ($signoffLines !== [] || $closingLines !== []) $pdf->Ln($senderGap);
            foreach ($senderLines as $line) {
                $pdf->SetX($left);
                $pdf->Cell($textWidth, $lineHeight, $pdf->encode($line), 0, 1);
            }
        }

        $x = self::PAGE_WIDTH - $right - $qrSize;
        // The PNG already has the EPC four-module quiet zone. Draw the label
        // flush to its lower edge, without another visual spacer.
        $pdf->Image(
            'data://application/octet-stream;base64,'.base64_encode($png),
            $x, $top, $qrSize, $qrSize, 'PNG',
        );
        $pdf->SetFont('Helvetica', '', 7.0);
        $pdf->SetTextColor(79, 89, 104);
        $caption = $pdf->encode('Mit Banking-App scannen');
        $captionX = $x + ($qrSize - $pdf->GetStringWidth($caption)) / 2.0;
        $pdf->Text($captionX, $top + $qrSize + $captionBaselineBelowQr, $caption);
        $pdf->SetTextColor(0, 0, 0);
        $pdf->SetY($top + $height + 1.0);
    }

    /**
     * Position table for financial letters, matching the light-grey header,
     * white ruled rows and neutral total band of the operating-cost statement.
     * The DIN-5008 letter page geometry and shared issuer footer are unchanged.
     */
    private function renderInvoicePositionTable(TiptapPdfDocument $pdf, array $node, array $style, float $left, float $right, float $bottom): void
    {
        $attrs = (array) ($node['attrs'] ?? []);
        $rows = array_values(array_filter((array) ($attrs['rows'] ?? []), 'is_array'));
        if ($rows === []) {
            $rows[] = ['title' => 'Keine offenen Forderungspositionen vorhanden', 'subtitle' => '', 'amount' => '0,00 €'];
        }

        $rightX = self::PAGE_WIDTH - $right;
        $tableWidth = $rightX - $left;
        $amountWidth = min(35.0, $tableWidth * 0.24);
        $labelWidth = $tableWidth - $amountWidth;
        $headerHeight = 8.0;
        $totalHeight = 8.0;
        $maxY = self::PAGE_HEIGHT - $bottom;
        $firstHeight = $this->invoicePositionRowHeight($pdf, $rows[0], $labelWidth);

        if ($pdf->GetY() + $headerHeight + $firstHeight + (count($rows) === 1 ? $totalHeight : 0.0) > $maxY) {
            $pdf->AddPage();
        }

        $this->drawInvoicePositionHeader(
            $pdf,
            $left,
            $rightX,
            $labelWidth,
            $amountWidth,
            (string) ($attrs['headerLabel'] ?? 'Position'),
            (string) ($attrs['amountLabel'] ?? 'Betrag'),
        );

        foreach ($rows as $index => $row) {
            $height = $this->invoicePositionRowHeight($pdf, $row, $labelWidth);
            // Keep the fee breakdown with the payable total whenever possible.
            $requiredHeight = $height + ($index === array_key_last($rows) ? $totalHeight : 0.0);
            if ($pdf->GetY() + $requiredHeight > $maxY) {
                $pdf->AddPage();
                $this->drawInvoicePositionHeader(
                    $pdf,
                    $left,
                    $rightX,
                    $labelWidth,
                    $amountWidth,
                    (string) ($attrs['headerLabel'] ?? 'Position'),
                    (string) ($attrs['amountLabel'] ?? 'Betrag'),
                );
            }

            $this->drawInvoicePositionRow($pdf, $row, $left, $rightX, $labelWidth, $amountWidth, $height);
        }

        if ($pdf->GetY() + $totalHeight > $maxY) {
            $pdf->AddPage();
            $this->drawInvoicePositionHeader(
                $pdf,
                $left,
                $rightX,
                $labelWidth,
                $amountWidth,
                (string) ($attrs['headerLabel'] ?? 'Position'),
                (string) ($attrs['amountLabel'] ?? 'Betrag'),
            );
        }

        $this->drawInvoicePositionTotal(
            $pdf,
            $left,
            $rightX,
            $labelWidth,
            $amountWidth,
            (string) ($attrs['totalLabel'] ?? 'Gesamtbetrag'),
            (string) ($attrs['totalAmount'] ?? ''),
            $totalHeight,
        );
        $pdf->SetTextColor(0, 0, 0);
    }

    private function drawInvoicePositionHeader(
        TiptapPdfDocument $pdf,
        float $left,
        float $rightX,
        float $labelWidth,
        float $amountWidth,
        string $label,
        string $amountLabel,
    ): void {
        $y = $pdf->GetY();
        // Match the operating-cost statement's position header: neutral
        // #EEEEEE band, dark labels and no decorative colour accents.
        $this->setFillColor($pdf, 'EEEEEE');
        $pdf->Rect($left, $y, $rightX - $left, 8.0, 'F');
        $this->setTextColor($pdf, '000000');
        $pdf->SetFont('Helvetica', 'B', 8.8);
        $pdf->SetXY($left + 3.0, $y + 2.0);
        $pdf->Cell(max(2.0, $labelWidth - 6.0), 4.0, $pdf->encode($label));
        $pdf->SetXY($left + $labelWidth, $y + 2.0);
        $pdf->Cell(max(2.0, $amountWidth - 3.0), 4.0, $pdf->encode($amountLabel), 0, 0, 'R');
        $this->setDrawColor($pdf, 'E2E2E2');
        $pdf->SetLineWidth(0.10);
        $pdf->Line($left, $y + 8.0, $rightX, $y + 8.0);
        $pdf->SetY($y + 8.0);
    }

    private function invoicePositionRowHeight(TiptapPdfDocument $pdf, array $row, float $labelWidth): float
    {
        $innerWidth = max(10.0, $labelWidth - 7.0);
        $titleLines = $this->wrapText($pdf, trim((string) ($row['title'] ?? '')), $innerWidth, 8.6, true);
        $subtitle = trim((string) ($row['subtitle'] ?? ''));
        $subtitleLines = $subtitle !== '' ? $this->wrapText($pdf, $subtitle, $innerWidth, 7.8, false) : [];

        return max(8.5, 4.0 + count($titleLines) * 3.6 + count($subtitleLines) * 3.4);
    }

    private function drawInvoicePositionRow(
        TiptapPdfDocument $pdf,
        array $row,
        float $left,
        float $rightX,
        float $labelWidth,
        float $amountWidth,
        float $height,
    ): void {
        $y = $pdf->GetY();
        $muted = ($row['muted'] ?? false) === true;
        $title = trim((string) ($row['title'] ?? ''));
        $subtitle = trim((string) ($row['subtitle'] ?? ''));
        $innerWidth = max(10.0, $labelWidth - 7.0);
        $titleLines = $this->wrapText($pdf, $title, $innerWidth, 8.6, true);
        $subtitleLines = $subtitle !== '' ? $this->wrapText($pdf, $subtitle, $innerWidth, 7.8, false) : [];

        // As in the Abrechnung, each position remains white and is separated
        // by a fine rule; fees are a regular row, not a coloured inset.
        $this->setTextColor($pdf, '000000');
        $pdf->SetFont('Helvetica', 'B', 8.6);
        $cursorY = $y + 2.0;
        foreach ($titleLines as $line) {
            $pdf->SetXY($left + 3.0, $cursorY);
            $pdf->Cell($innerWidth, 3.6, $pdf->encode($line));
            $cursorY += 3.6;
        }

        if ($subtitleLines !== []) {
            $this->setTextColor($pdf, '4E4E4E');
            $pdf->SetFont('Helvetica', '', 7.8);
            foreach ($subtitleLines as $line) {
                $pdf->SetXY($left + 3.0, $cursorY);
                $pdf->Cell($innerWidth, 3.4, $pdf->encode($line));
                $cursorY += 3.4;
            }
        }

        $this->setTextColor($pdf, $muted ? '4E4E4E' : '000000');
        $pdf->SetFont('Helvetica', $muted ? '' : 'B', 8.6);
        $pdf->SetXY($left + $labelWidth, $y + 2.0);
        $pdf->Cell(max(2.0, $amountWidth - 3.0), 4.0, $pdf->encode((string) ($row['amount'] ?? '')), 0, 0, 'R');

        $this->setDrawColor($pdf, 'E2E2E2');
        $pdf->SetLineWidth(0.10);
        $pdf->Line($left, $y + $height, $rightX, $y + $height);
        $pdf->SetY($y + $height);
    }

    private function drawInvoicePositionTotal(
        TiptapPdfDocument $pdf,
        float $left,
        float $rightX,
        float $labelWidth,
        float $amountWidth,
        string $label,
        string $amount,
        float $height,
    ): void {
        $y = $pdf->GetY();
        // Match the statement's neutral total row and shared amount column.
        $this->setFillColor($pdf, 'EEEEEE');
        $pdf->Rect($left, $y, $rightX - $left, $height, 'F');
        $this->setDrawColor($pdf, 'E2E2E2');
        $pdf->SetLineWidth(0.10);
        $pdf->Line($left, $y, $rightX, $y);
        $this->setTextColor($pdf, '000000');
        $pdf->SetFont('Helvetica', 'B', 9.0);
        $pdf->SetXY($left + 3.0, $y + 2.0);
        $pdf->Cell(max(2.0, $labelWidth - 6.0), 4.0, $pdf->encode($label));
        $pdf->SetXY($left + $labelWidth, $y + 2.0);
        $pdf->Cell(max(2.0, $amountWidth - 3.0), 4.0, $pdf->encode($amount), 0, 0, 'R');
        $pdf->Line($left, $y + $height, $rightX, $y + $height);
        $pdf->SetY($y + $height);
    }

    private function renderRelationTable(TiptapPdfDocument $pdf, array $node, array $context, array $style, float $left, float $right, float $bottom, float $fontSize, float $lineHeight): void
    {
        $source = trim((string) data_get($node, 'attrs.source', ''));
        $label = trim((string) data_get($node, 'attrs.label', 'Daten'));
        $columns = array_values(array_filter(data_get($node, 'attrs.columns', []), 'is_array'));
        if ($source === '' || $columns === []) return;
        $items = data_get($context, $source, []);
        $items = is_array($items) ? array_values(array_filter($items, 'is_array')) : [];
        $minimumRows = max(0, min(20, (int) data_get($node, 'attrs.minimumRows', 0)));
        if ($label !== '') {
            if (($style['headingTreatment'] ?? null) === 'editorial') $this->drawEditorialHeading($pdf, $label, 3, $style, $left, self::PAGE_WIDTH - $right, $bottom);
            else $this->drawSectionTitle($pdf, $label, $style, $left, self::PAGE_WIDTH - $right, $bottom, 8.5);
        }
        $rows = [[
            'cells' => array_map(fn (array $column): array => ['text' => (string) ($column['label'] ?? $column['key'] ?? ''), 'header' => true, 'align' => $this->normalizeAlignment((string) ($style['tableHeaderTextAlign'] ?? 'C')), 'colspan' => 1, 'colwidth' => null], $columns),
        ]];
        if ($items === [] && $minimumRows === 0) {
            $rows[] = ['cells' => [['text' => (string) data_get($node, 'attrs.emptyText', 'Keine Einträge vorhanden.'), 'header' => false, 'align' => $this->normalizeAlignment((string) ($style['tableBodyTextAlign'] ?? 'C')), 'colspan' => max(1, count($columns)), 'colwidth' => null]]];
        } else {
            foreach ($items as $item) {
                $rows[] = ['cells' => array_map(function (array $column) use ($item, $style): array {
                    $key = trim((string) ($column['key'] ?? ''));
                    return ['text' => $this->scalarText($key !== '' ? data_get($item, $key) : ''), 'header' => false, 'align' => $this->normalizeAlignment((string) ($style['tableBodyTextAlign'] ?? 'C')), 'colspan' => 1, 'colwidth' => null];
                }, $columns)];
            }
            for ($index = count($items); $index < $minimumRows; $index++) {
                $rows[] = ['cells' => array_map(fn (array $_): array => ['text' => '', 'header' => false, 'align' => $this->normalizeAlignment((string) ($style['tableBodyTextAlign'] ?? 'C')), 'colspan' => 1, 'colwidth' => null], $columns)];
            }
        }
        $this->drawTableRows($pdf, $rows, $style, $left, self::PAGE_WIDTH - $right, $bottom, $fontSize, $lineHeight);
    }

    private function isDocumentReferenceNode(array $node): bool
    {
        if ((string) data_get($node, 'attrs.variant', '') === 'document-meta') {
            return true;
        }

        return $this->nodeContainsVariablePath($node, 'contract.number');
    }

    private function nodeContainsVariablePath(array $node, string $path): bool
    {
        if (($node['type'] ?? null) === 'variable' && trim((string) data_get($node, 'attrs.path', '')) === $path) {
            return true;
        }
        foreach (($node['content'] ?? []) as $child) {
            if (is_array($child) && $this->nodeContainsVariablePath($child, $path)) {
                return true;
            }
        }

        return false;
    }

    private function renderDocumentReference(TiptapPdfDocument $pdf, array $node, array $context, array $style, float $left, float $right, float $bottom): void
    {
        $available = self::PAGE_WIDTH - $left - $right;
        $width = min($available, max(50.0, (float) ($style['documentReferenceWidth'] ?? 64.0)));
        $height = 14.2;
        $this->ensureSpace($pdf, $height + 2.2, $bottom);

        $x = self::PAGE_WIDTH - $right - $width;
        $y = $pdf->GetY();
        $label = trim((string) ($style['documentReferenceLabel'] ?? 'VERTRAGSNUMMER'));
        $value = trim($this->scalarText(data_get($context, 'contract.number')));
        if ($value === '') {
            $value = '—';
        }

        $this->setFillColor($pdf, (string) ($style['documentReferenceFill'] ?? 'F7F8F8'));
        $pdf->Rect($x, $y, $width, $height, 'F');
        $this->setDrawColor($pdf, (string) ($style['documentReferenceBorderColor'] ?? 'D9DEE1'));
        $pdf->SetLineWidth(0.12);
        $pdf->Rect($x, $y, $width, $height, 'D');
        $this->setFillColor($pdf, (string) ($style['documentReferenceAccentColor'] ?? $style['headingAccentColor'] ?? '68767D'));
        $pdf->Rect($x, $y, 0.9, $height, 'F');

        $this->setTextColor($pdf, (string) ($style['documentReferenceLabelColor'] ?? '6A747A'));
        $pdf->SetFont('Helvetica', 'B', 6.4);
        $pdf->SetXY($x + 4.0, $y + 2.2);
        $pdf->Cell($width - 7.0, 3.1, $pdf->encode($label), 0, 0, 'L');

        $this->setTextColor($pdf, (string) ($style['documentReferenceValueColor'] ?? '20282C'));
        $pdf->SetFont('Helvetica', 'B', 10.1);
        $pdf->SetXY($x + 4.0, $y + 6.1);
        $pdf->Cell($width - 7.0, 4.8, $pdf->encode($value), 0, 0, 'L');

        $pdf->SetTextColor(0, 0, 0);
        $pdf->SetDrawColor(0, 0, 0);
        $pdf->SetLineWidth(0.2);
        $pdf->SetY($y + $height + 2.2);
    }

    private function renderSignatureBlock(TiptapPdfDocument $pdf, array $node, array $context, array $style, float $left, float $right, float $bottom, float $fontSize): void
    {
        $leftEnabled = data_get($node, 'attrs.leftEnabled', true) !== false;
        $rightEnabled = data_get($node, 'attrs.rightEnabled', true) !== false;
        if (! $leftEnabled && ! $rightEnabled) $rightEnabled = true;
        $location = $this->scalarText(data_get($context, (string) data_get($node, 'attrs.locationPath', 'organization.city')));
        $date = $this->scalarText(data_get($context, (string) data_get($node, 'attrs.datePath', 'today.date')));
        $placeDateLabel = trim((string) data_get($node, 'attrs.placeDateLabel', 'Ort, Datum'));
        $leftNamePath = trim((string) data_get($node, 'attrs.leftNamePath', ''));
        $rightNamePath = trim((string) data_get($node, 'attrs.rightNamePath', ''));
        $leftName = $leftNamePath !== '' ? $this->scalarText(data_get($context, $leftNamePath)) : '';
        $rightName = $rightNamePath !== '' ? $this->scalarText(data_get($context, $rightNamePath)) : '';
        $leftLabel = trim((string) data_get($node, 'attrs.leftLabel', 'Unterschrift Vermieter / Vertretung'));
        $rightLabel = trim((string) data_get($node, 'attrs.rightLabel', 'Unterschrift Mieter / Mieterin'));
        $signatures = [];
        if ($leftEnabled) $signatures[] = ['name' => $leftName, 'label' => $leftLabel];
        if ($rightEnabled) $signatures[] = ['name' => $rightName, 'label' => $rightLabel];

        $gapBefore = max(3.0, (float) ($style['signatureGapBefore'] ?? 3.0));
        $available = self::PAGE_WIDTH - $left - $right;
        $count = max(1, count($signatures));
        $gap = $count > 1 ? 10.0 : 0.0;
        $width = $count === 1
            ? min($available, max(48.0, (float) ($style['signatureSingleWidth'] ?? 82.0)))
            : ($available - ($gap * ($count - 1))) / $count;

        $maxCaptionLines = 1;
        foreach ($signatures as $signature) {
            $caption = $signature['name'] !== '' ? $signature['name']."\n".$signature['label'] : $signature['label'];
            $maxCaptionLines = max($maxCaptionLines, count($this->wrapText($pdf, $caption, $width, 7.1, false)));
        }
        $captionHeight = max(10.5, 2.0 + ($maxCaptionLines * 3.1));
        $placeAndDate = $location !== '' && $date !== '' ? $location.', '.$date : ($location !== '' ? $location : $date);
        $requiredHeight = $gapBefore
            + ($placeAndDate !== '' ? 4.6 : 0.0)
            + ($placeDateLabel !== '' ? 3.6 : 0.0)
            + 10.0
            + $captionHeight
            + 1.5;
        $keepTogetherHeight = max($requiredHeight, (float) ($style['signatureKeepTogetherHeight'] ?? 48.0));
        if (($style['signatureKeepTogether'] ?? true) !== false) {
            $this->ensureSpace($pdf, $keepTogetherHeight, $bottom);
        } else {
            $this->ensureSpace($pdf, 34.0 + $gapBefore, $bottom);
        }

        $pdf->Ln($gapBefore);
        if ($placeAndDate !== '') {
            $this->setTextColor($pdf, (string) ($style['signaturePlaceDateColor'] ?? '344654'));
            $pdf->SetFont('Helvetica', 'B', max(8.0, $fontSize - 0.1));
            $pdf->Cell($available, 4.6, $pdf->encode($placeAndDate), 0, 1, 'L');
        }
        if ($placeDateLabel !== '') {
            $this->setTextColor($pdf, (string) ($style['signatureTextColor'] ?? '53626E'));
            $pdf->SetFont('Helvetica', '', 6.9);
            $pdf->Cell($available, 3.6, $pdf->encode($placeDateLabel), 0, 1, 'L');
        }
        $pdf->Ln(10.0);
        $y = $pdf->GetY();
        $this->setDrawColor($pdf, (string) ($style['signatureRuleColor'] ?? '70808C'));
        $pdf->SetLineWidth(0.18);
        foreach ($signatures as $index => $signature) {
            $x = $left + ($index * ($width + $gap));
            $pdf->Line($x, $y, $x + $width, $y);
            $caption = $signature['name'] !== '' ? $signature['name']."\n".$signature['label'] : $signature['label'];
            $this->setTextColor($pdf, (string) ($style['signatureTextColor'] ?? '53626E'));
            $pdf->SetFont('Helvetica', '', 7.1);
            $pdf->SetXY($x, $y + 1.7);
            $pdf->MultiCell($width, 3.1, $pdf->encode($caption), 0, 'L');
        }
        $pdf->SetTextColor(0, 0, 0);
        $pdf->SetDrawColor(0, 0, 0);
        $pdf->SetLineWidth(0.2);
        $pdf->SetY($y + $captionHeight);
    }

    private function drawSectionRow(TiptapPdfDocument $pdf, array $cells, array $style, float $left, float $rightX, float $bottom, float $fontSize): void
    {
        $number = count($cells) > 1 ? trim((string) ($cells[0]['text'] ?? '')) : '';
        $title = count($cells) > 1 ? trim((string) ($cells[1]['text'] ?? '')) : trim((string) ($cells[0]['text'] ?? ''));
        if ($number === '' && preg_match('/^(\d+[.]?)\s+(.+)$/u', $title, $match) === 1) {
            $number = $match[1];
            $title = trim($match[2]);
        }
        $height = (float) ($style['sectionHeaderHeight'] ?? 6.1);
        $this->ensureSpace($pdf, $height + 7.0, $bottom);
        $y = $pdf->GetY();
        $width = $rightX - $left;
        $numberWidth = $number !== '' ? (float) ($style['sectionHeaderNumberWidth'] ?? 10.0) : 1.15;
        $this->setFillColor($pdf, (string) ($style['sectionHeaderFill'] ?? 'EEF3F6'));
        $pdf->Rect($left, $y, $width, $height, 'F');
        $this->setFillColor($pdf, (string) ($style['sectionHeaderAccentColor'] ?? '3F637D'));
        $pdf->Rect($left, $y, $numberWidth, $height, 'F');
        if ($number !== '') {
            $pdf->SetTextColor(255, 255, 255);
            $pdf->SetFont('Helvetica', 'B', max(7.4, $fontSize - 0.3));
            $pdf->SetXY($left, $y + 1.0);
            $pdf->Cell($numberWidth, 4.2, $pdf->encode($number), 0, 0, 'C');
        }
        $this->setTextColor($pdf, (string) ($style['sectionHeaderTextColor'] ?? '22313D'));
        $pdf->SetFont('Helvetica', 'B', max(8.1, $fontSize));
        $pdf->SetXY($left + $numberWidth + 2.0, $y + 1.0);
        $pdf->Cell($width - $numberWidth - 3.0, 4.2, $pdf->encode($title), 0, 0, 'L');
        $pdf->SetTextColor(0, 0, 0);
        $pdf->SetY($y + $height + 0.35);
    }

    private function drawSectionTitle(TiptapPdfDocument $pdf, string $title, array $style, float $left, float $rightX, float $bottom, float $fontSize, string $alignment = 'L'): void
    {
        if ($title === '') return;
        $height = (float) ($style['sectionTitleHeight'] ?? 5.8);
        $this->ensureSpace($pdf, $height + 6.0, $bottom);
        $y = $pdf->GetY();
        $this->setFillColor($pdf, (string) ($style['sectionHeaderFill'] ?? 'EEF3F6'));
        $pdf->Rect($left, $y, $rightX - $left, $height, 'F');
        $this->setFillColor($pdf, (string) ($style['sectionHeaderAccentColor'] ?? '3F637D'));
        $pdf->Rect($left, $y, 1.15, $height, 'F');
        $this->setTextColor($pdf, (string) ($style['sectionHeaderTextColor'] ?? '22313D'));
        $pdf->SetFont('Helvetica', 'B', $fontSize);
        $pdf->SetXY($left + 2.5, $y + 0.9);
        $pdf->Cell($rightX - $left - 3.0, 4.0, $pdf->encode($title), 0, 0, $this->singleLineAlignment($alignment));
        $pdf->SetTextColor(0, 0, 0);
        $pdf->SetY($y + $height + 0.35);
    }

    private function drawTableRows(TiptapPdfDocument $pdf, array $rows, array $style, float $left, float $rightX, float $bottom, float $fontSize, float $lineHeight): void
    {
        if ($rows === []) return;
        $columnCount = max(array_map(fn (array $row): int => max(1, array_sum(array_map(fn (array $cell): int => max(1, (int) ($cell['colspan'] ?? 1)), $row['cells'] ?? []))), $rows));
        $weights = $this->columnWeights($rows, $columnCount);
        $tableWidth = $rightX - $left;
        $weightTotal = max(1.0, array_sum($weights));
        $widths = array_map(fn (float $weight): float => $tableWidth * ($weight / $weightTotal), $weights);
        $headerPrepared = null;
        if (isset($rows[0])) {
            $candidate = $this->prepareTableRow($pdf, $rows[0], $widths, $fontSize, $lineHeight, $style);
            if (($candidate['cells'] ?? []) !== [] && collect($candidate['cells'])->every(fn (array $cell): bool => (bool) ($cell['header'] ?? false))) $headerPrepared = $candidate;
        }
        foreach ($rows as $rowIndex => $row) {
            $prepared = $this->prepareTableRow($pdf, $row, $widths, $fontSize, $lineHeight, $style);
            $height = (float) $prepared['height'] + 0.4;
            if ($rowIndex === 0 && $headerPrepared !== null && isset($rows[1])) {
                $nextPrepared = $this->prepareTableRow($pdf, $rows[1], $widths, $fontSize, $lineHeight, $style);
                $this->ensureSpace($pdf, $height + (float) $nextPrepared['height'] + 0.4, $bottom);
            } elseif ($rowIndex > 0 && $headerPrepared !== null && $pdf->GetY() + $height > self::PAGE_HEIGHT - $bottom) {
                $pdf->AddPage();
                $this->drawPreparedTableRow($pdf, $headerPrepared, $style, $left, 0);
                $this->ensureSpace($pdf, $height, $bottom);
            } else {
                $this->ensureSpace($pdf, $height, $bottom);
            }
            $this->drawPreparedTableRow($pdf, $prepared, $style, $left, $rowIndex);
        }
    }

    private function prepareTableRow(TiptapPdfDocument $pdf, array $row, array $widths, float $fontSize, float $lineHeight, array $style): array
    {
        $cursor = 0;
        $cells = [];
        $minHeight = (float) ($style['tableMinRowHeight'] ?? 5.2);
        $paddingY = max(0.0, (float) ($style['tableCellPaddingY'] ?? 0.8));
        $paddingX = max(0.0, (float) ($style['tableCellPaddingX'] ?? 1.7));
        $maxHeight = $minHeight;
        foreach (($row['cells'] ?? []) as $cell) {
            $colspan = max(1, (int) ($cell['colspan'] ?? 1));
            $width = array_sum(array_slice($widths, $cursor, $colspan));
            $header = (bool) ($cell['header'] ?? false);
            $size = $header ? max(7.3, $fontSize - 0.05) : $fontSize;
            $align = $this->normalizeAlignment((string) ($cell['align'] ?? ($header ? ($style['tableHeaderTextAlign'] ?? 'C') : ($style['tableBodyTextAlign'] ?? 'C'))));
            $lines = $this->wrapText($pdf, (string) ($cell['text'] ?? ''), max(3.0, $width - ($paddingX * 2)), $size, $header);
            $height = max($minHeight, (count($lines) * $lineHeight) + ($paddingY * 2));
            $maxHeight = max($maxHeight, $height);
            $cells[] = ['text' => (string) ($cell['text'] ?? ''), 'header' => $header, 'align' => $align, 'width' => $width, 'fontSize' => $size, 'lineHeight' => $lineHeight, 'paddingY' => $paddingY, 'paddingX' => $paddingX];
            $cursor += $colspan;
        }
        return ['cells' => $cells, 'height' => $maxHeight];
    }

    private function drawPreparedTableRow(TiptapPdfDocument $pdf, array $prepared, array $style, float $left, int $rowIndex): void
    {
        $height = (float) $prepared['height'];
        $y = $pdf->GetY();
        $x = $left;
        $cells = $prepared['cells'] ?? [];
        $allHeader = $cells !== [] && collect($cells)->every(fn (array $cell): bool => (bool) ($cell['header'] ?? false));
        $this->setDrawColor($pdf, (string) ($style['tableBorderColor'] ?? 'DCE3E8'));
        $pdf->SetLineWidth(max(0.05, (float) ($style['tableBorderWidth'] ?? 0.09)));
        foreach ($cells as $cell) {
            $width = (float) ($cell['width'] ?? 0.0);
            $isHeader = (bool) ($cell['header'] ?? false);
            if ($isHeader) {
                $this->setFillColor($pdf, (string) ($style['tableHeaderFill'] ?? 'F1F4F6'));
                $pdf->Rect($x, $y, $width, $height, 'F');
            } elseif ((bool) ($style['tableAlternateRows'] ?? false) && ! $allHeader && $rowIndex % 2 === 0) {
                $this->setFillColor($pdf, (string) ($style['tableRowAlternateFill'] ?? 'FAFBFC'));
                $pdf->Rect($x, $y, $width, $height, 'F');
            }
            $this->setDrawColor($pdf, (string) ($style['tableBorderColor'] ?? 'DCE3E8'));
            $pdf->Rect($x, $y, $width, $height, 'D');
            $this->setTextColor($pdf, $isHeader ? (string) ($style['tableHeaderTextColor'] ?? '263642') : (string) ($style['tableBodyTextColor'] ?? '26323B'));
            $pdf->SetFont('Helvetica', $isHeader ? 'B' : '', (float) ($cell['fontSize'] ?? 8.4));
            $paddingX = (float) ($cell['paddingX'] ?? 1.7);
            $paddingY = (float) ($cell['paddingY'] ?? 0.8);
            $pdf->SetXY($x + $paddingX, $y + $paddingY);
            $pdf->MultiCell(max(2.0, $width - ($paddingX * 2)), (float) ($cell['lineHeight'] ?? 4.0), $pdf->encode((string) ($cell['text'] ?? '')), 0, (string) ($cell['align'] ?? 'C'));
            $x += $width;
        }
        $pdf->SetTextColor(0, 0, 0);
        $pdf->SetXY($left, $y + $height);
    }

    private function tableCellAlignment(array $cell, array $style, bool $header): string
    {
        $explicit = data_get($cell, 'attrs.textAlign');
        if (! is_string($explicit) || trim($explicit) === '') {
            foreach (($cell['content'] ?? []) as $child) {
                if (! is_array($child)) continue;
                $candidate = data_get($child, 'attrs.textAlign');
                if (is_string($candidate) && trim($candidate) !== '') {
                    $explicit = $candidate;
                    break;
                }
            }
        }
        $fallback = $header ? ($style['tableHeaderTextAlign'] ?? 'C') : ($style['tableBodyTextAlign'] ?? 'C');
        return $this->normalizeAlignment(is_string($explicit) && trim($explicit) !== '' ? $explicit : (string) $fallback);
    }

    private function nodeAlignment(array $node, string $fallback = 'L'): string
    {
        $value = data_get($node, 'attrs.textAlign');
        return $this->normalizeAlignment(is_string($value) && trim($value) !== '' ? $value : $fallback);
    }

    private function descendantAlignment(array $node, string $fallback = 'L'): string
    {
        $direct = data_get($node, 'attrs.textAlign');
        if (is_string($direct) && trim($direct) !== '') return $this->normalizeAlignment($direct);
        foreach (($node['content'] ?? []) as $child) {
            if (! is_array($child)) continue;
            $candidate = data_get($child, 'attrs.textAlign');
            if (is_string($candidate) && trim($candidate) !== '') return $this->normalizeAlignment($candidate);
        }
        return $this->normalizeAlignment($fallback);
    }

    private function normalizeAlignment(string $value): string
    {
        return match (strtoupper(trim($value))) {
            'CENTER', 'CENTRE', 'C', 'MITTIG' => 'C',
            'RIGHT', 'R', 'RECHTS' => 'R',
            'JUSTIFY', 'JUSTIFIED', 'J', 'BLOCKSATZ' => 'J',
            'LEFT', 'L', 'LINKS' => 'L',
            default => 'L',
        };
    }

    private function singleLineAlignment(string $value): string
    {
        $alignment = $this->normalizeAlignment($value);
        return $alignment === 'J' ? 'L' : $alignment;
    }

    private function columnWeights(array $rows, int $columnCount): array
    {
        $weights = array_fill(0, $columnCount, 1.0);
        foreach ($rows as $row) {
            $cursor = 0;
            $found = false;
            foreach (($row['cells'] ?? []) as $cell) {
                $colspan = max(1, (int) ($cell['colspan'] ?? 1));
                $colwidth = $cell['colwidth'] ?? null;
                if (is_array($colwidth) && count($colwidth) >= $colspan) {
                    for ($offset = 0; $offset < $colspan && $cursor + $offset < $columnCount; $offset++) {
                        if (is_numeric($colwidth[$offset] ?? null) && (float) $colwidth[$offset] > 0) {
                            $weights[$cursor + $offset] = (float) $colwidth[$offset];
                            $found = true;
                        }
                    }
                }
                $cursor += $colspan;
            }
            if ($found) break;
        }
        return $weights;
    }

    private function inlineRuns(array $content, array $context, bool $forceBold = false): array
    {
        $runs = [];
        foreach ($content as $node) {
            if (! is_array($node)) continue;
            $type = (string) ($node['type'] ?? '');
            if ($type === 'text') {
                $missing = [];
                $text = $this->placeholders->render((string) ($node['text'] ?? ''), $context, $missing);
                $marks = collect($node['marks'] ?? [])->pluck('type')->filter()->all();
                $runs[] = ['text' => $text, 'variable' => false, 'bold' => $forceBold || in_array('bold', $marks, true), 'italic' => in_array('italic', $marks, true), 'underline' => in_array('underline', $marks, true)];
            } elseif ($type === 'hardBreak') {
                $runs[] = ['text' => "\n", 'variable' => false, 'bold' => $forceBold, 'italic' => false, 'underline' => false];
            } elseif ($type === 'variable') {
                $path = trim((string) data_get($node, 'attrs.path', ''));
                $marks = collect($node['marks'] ?? [])->pluck('type')->filter()->all();
                $runs[] = [
                    'text' => $this->scalarText($path !== '' ? data_get($context, $path) : null),
                    'variable' => true,
                    'bold' => $forceBold || in_array('bold', $marks, true),
                    'italic' => in_array('italic', $marks, true),
                    'underline' => in_array('underline', $marks, true),
                ];
            } elseif (is_array($node['content'] ?? null)) {
                array_push($runs, ...$this->inlineRuns($node['content'], $context, $forceBold));
            }
        }
        return $this->normalizeInlineRunSpacing($runs);
    }

    private function normalizeInlineRunSpacing(array $runs): array
    {
        $normalized = [];
        foreach ($runs as $run) {
            $text = (string) ($run['text'] ?? '');
            if ($text === '') continue;
            $previousIndex = array_key_last($normalized);
            if ($previousIndex !== null) {
                $previousText = (string) ($normalized[$previousIndex]['text'] ?? '');
                $previousVariable = (bool) ($normalized[$previousIndex]['variable'] ?? false);
                $currentVariable = (bool) ($run['variable'] ?? false);
                if (($previousVariable || $currentVariable) && $this->needsInlineWordSpace($previousText, $text)) $run['text'] = ' '.$text;
            }
            $normalized[] = $run;
        }
        return $normalized;
    }

    private function needsInlineWordSpace(string $left, string $right): bool
    {
        if ($left === '' || $right === '') return false;
        if (preg_match('/\s$/u', $left) === 1 || preg_match('/^\s/u', $right) === 1) return false;
        if (str_ends_with($left, "\n") || str_starts_with($right, "\n")) return false;
        if (preg_match('/[\(\[\{\/\-–—]$/u', $left) === 1) return false;
        if (preg_match('/^[\.,;:!?\)\]\}\/\-–—]/u', $right) === 1) return false;
        return true;
    }

    private function plainText(array $content, array $context): string
    {
        return trim(collect($this->inlineRuns($content, $context))->pluck('text')->implode(''));
    }

    private function scalarText(mixed $value): string
    {
        if ($value === null) return '';
        if (is_bool($value)) return $value ? 'Ja' : 'Nein';
        if (is_scalar($value)) return (string) $value;
        if (is_array($value)) {
            return collect($value)->map(function ($item): string {
                if (is_scalar($item)) return (string) $item;
                if (is_array($item)) return (string) ($item['name'] ?? $item['label'] ?? $item['display'] ?? '');
                return '';
            })->filter()->implode(', ');
        }
        return '';
    }

    private function wrapText(TiptapPdfDocument $pdf, string $text, float $width, float $fontSize, bool $bold): array
    {
        $pdf->SetFont('Helvetica', $bold ? 'B' : '', $fontSize);
        $lines = [];
        foreach (preg_split('/\R/u', $text) ?: [''] as $paragraph) {
            if ($paragraph === '') {
                $lines[] = '';
                continue;
            }
            $words = preg_split('/\s+/u', trim($paragraph)) ?: [''];
            $line = '';
            foreach ($words as $word) {
                $candidate = $line === '' ? $word : $line.' '.$word;
                if ($pdf->GetStringWidth($pdf->encode($candidate)) <= $width) {
                    $line = $candidate;
                    continue;
                }
                if ($line !== '') $lines[] = $line;
                $line = $word;
            }
            if ($line !== '') $lines[] = $line;
        }
        return $lines !== [] ? $lines : [''];
    }

    private function ensureSpace(TiptapPdfDocument $pdf, float $height, float $bottom): void
    {
        if ($pdf->GetY() + $height <= self::PAGE_HEIGHT - $bottom) return;
        $pdf->AddPage();
    }

    private function setTextColor(TiptapPdfDocument $pdf, string $hex): void
    {
        [$r, $g, $b] = $this->rgb($hex);
        $pdf->SetTextColor($r, $g, $b);
    }
    private function setDrawColor(TiptapPdfDocument $pdf, string $hex): void
    {
        [$r, $g, $b] = $this->rgb($hex);
        $pdf->SetDrawColor($r, $g, $b);
    }
    private function setFillColor(TiptapPdfDocument $pdf, string $hex): void
    {
        [$r, $g, $b] = $this->rgb($hex);
        $pdf->SetFillColor($r, $g, $b);
    }
    /** @return array{0:int,1:int,2:int} */
    private function rgb(string $hex): array
    {
        $hex = ltrim(trim($hex), '#');
        if (strlen($hex) !== 6 || ! ctype_xdigit($hex)) return [0, 0, 0];
        return [hexdec(substr($hex, 0, 2)), hexdec(substr($hex, 2, 2)), hexdec(substr($hex, 4, 2))];
    }
    private function normalizeNodes(array $blocks): array
    {
        if (($blocks['type'] ?? null) === 'doc' && is_array($blocks['content'] ?? null)) return array_values(array_filter($blocks['content'], 'is_array'));
        return array_values(array_filter($blocks, 'is_array'));
    }
}
