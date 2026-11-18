<?php

namespace App\Services\Documents;

use App\Services\Documents\Concerns\OrganizationProfilePdfLayout;
use FPDF;
use Illuminate\Validation\ValidationException;

final class TiptapPdfDocument extends FPDF
{
    use OrganizationProfilePdfLayout;

    private string $documentTitle = 'Dokument';
    private string $documentSubtitle = '';
    private string $continuationLabel = '';
    private array $layout = [];
    private array $profileFooter = [];

    public function configureDocument(string $title, string $subtitle, string $continuationLabel, array $layout, ?array $organization = null, array $footerOptions = []): void
    {
        $this->documentTitle = $title;
        $this->documentSubtitle = $subtitle;
        $this->continuationLabel = $continuationLabel;
        $this->layout = $layout;
        $this->AliasNbPages('{pageCount}');

        if (array_key_exists('pdfCellMargin', $layout)) {
            $this->cMargin = max(0.0, (float) $layout['pdfCellMargin']);
        } elseif (str_starts_with((string) ($layout['sourceLayout'] ?? ''), 'source-grid-')) {
            $this->cMargin = max(0.0, (float) ($layout['sourceGridCellMargin'] ?? 0.0));
        }
        $isLetter = (string) ($layout['layoutProfile'] ?? '') === 'din5008-letter';
        // The renderer supplies the captured issuer. A letter's complete
        // snapshot takes precedence over a reduced template context.
        if ($isLetter) $organization = (array) ($this->din5008LetterData()['organization'] ?? $organization ?? []);
        $this->profileFooter = [];
        if ($organization !== null) {
            $additional = trim((string) ($layout['pageFooterText'] ?? ''));
            $reference = trim((string) ($footerOptions['reference'] ?? $title));
            $this->profileFooter = $this->measureOrganizationProfileFooter(
                $organization,
                (float) ($layout['firstPageBodyTop'] ?? $layout['marginTop'] ?? 28.0),
                $additional === '' ? [] : [['title' => '', 'values' => [$additional]]],
                [
                    ...$footerOptions,
                    'reference' => $reference,
                    'marginLeft' => (float) ($layout['marginLeft'] ?? ($isLetter ? 25.0 : $this->lMargin)),
                    'marginRight' => (float) ($layout['marginRight'] ?? ($isLetter ? 20.0 : $this->rMargin)),
                ],
            );
        }
    }

    /** The renderer and FPDF must reserve the same measured footer area. */
    public function minimumBottomMargin(float $requested): float
    {
        if ($this->profileFooter === []) return $requested;

        return max($requested, $this->GetPageHeight() - (float) $this->profileFooter['bodyBottom']);
    }

    /**
     * FPDF core fonts keep the server renderer dependency-free. Renderer calls
     * that historically requested Helvetica automatically follow the document
     * font selected in the Tiptap ribbon.
     */
    public function SetFont($family, $style = '', $size = 0): void
    {
        $requested = (string) $family;
        $family = strtolower(trim($requested)) === 'helvetica'
            ? $this->coreFont((string) ($this->layout['fontFamily'] ?? $requested))
            : $this->coreFont($requested);
        parent::SetFont($family, $style, $size);
    }

    public function Header(): void
    {
        $left = (float) ($this->layout['marginLeft'] ?? 22.0);
        $right = (float) ($this->layout['marginRight'] ?? 20.0);
        $top = (float) ($this->layout['marginTop'] ?? 18.0);
        $firstPage = $this->PageNo() === 1;
        $firstPageBodyTop = (float) ($this->layout['firstPageBodyTop'] ?? $top);
        $continuationBodyTop = (float) ($this->layout['continuationBodyTop'] ?? $top);
        $layoutProfile = (string) ($this->layout['layoutProfile'] ?? '');
        $uniformHeaderBodyTop = $this->layout['uniformHeaderBodyTop'] ?? null;

        if ($layoutProfile === 'din5008-letter') {
            $this->renderDin5008LetterHeader();
            return;
        }

        if (is_numeric($uniformHeaderBodyTop)) $bodyTop = (float) $uniformHeaderBodyTop;
        elseif ($layoutProfile === 'contract-companion') $bodyTop = min($firstPageBodyTop, $continuationBodyTop);
        else $bodyTop = $firstPage ? $firstPageBodyTop : $continuationBodyTop;

        $this->SetMargins($left, $top, $right);
        $this->SetX($left);

        $pageHeader = trim((string) ($this->layout['pageHeaderText'] ?? ''));
        if ($pageHeader !== '') {
            $offset = max(1.5, (float) ($this->layout['pageHeaderOffset'] ?? 6.5));
            $this->SetY($offset);
            $this->SetX($left);
            $this->setExplicitFont(
                (string) ($this->layout['pageHeaderFontFamily'] ?? $this->layout['fontFamily'] ?? 'Helvetica'),
                '',
                (float) ($this->layout['pageHeaderFontSize'] ?? 7.5),
            );
            $this->setTextColorFromHex((string) ($this->layout['pageHeaderTextColor'] ?? $this->layout['footerTextColor'] ?? '696969'));
            $this->Cell($this->GetPageWidth() - $left - $right, 4.0, $this->encode($pageHeader), 0, 0, $this->align((string) ($this->layout['pageHeaderAlign'] ?? 'R')));
            $this->resetDrawingState();
            $this->SetY(max($top, $bodyTop));
            $this->SetX($left);
            return;
        }

        $preset = (string) ($this->layout['headerPreset'] ?? 'default');
        if ($preset === 'none') {
            $this->SetY(max($top, $bodyTop));
            $this->SetX($left);
            return;
        }

        if ($preset === 'suite') {
            $this->renderSuiteHeader($left, $right, $top, $bodyTop);
            return;
        }

        if (in_array($preset, ['source-right', 'source-center'], true)) {
            $align = $preset === 'source-right' ? 'R' : 'C';
            $titleSize = (float) ($this->layout['headerTitleFontSize'] ?? 13.5);
            $subtitleSize = (float) ($this->layout['headerSubtitleFontSize'] ?? 8.8);
            $titleLineHeight = (float) ($this->layout['headerTitleLineHeight'] ?? 5.8);
            $subtitleLineHeight = (float) ($this->layout['headerSubtitleLineHeight'] ?? 4.2);
            $headerLeft = (float) ($this->layout['headerMarginLeft'] ?? $left);
            $headerRight = (float) ($this->layout['headerMarginRight'] ?? $right);
            $headerWidth = max(1.0, $this->GetPageWidth() - $headerLeft - $headerRight);
            $this->SetY($top);
            $this->SetX($headerLeft);
            $this->setTextColorFromHex((string) ($this->layout['headerTextColor'] ?? '333333'));
            $this->SetFont('Helvetica', 'B', $titleSize);
            $this->Cell($headerWidth, $titleLineHeight, $this->encode($this->documentTitle), 0, 1, $align);
            if ($this->documentSubtitle !== '') {
                $this->SetX($headerLeft);
                $this->SetFont('Helvetica', 'B', $subtitleSize);
                $this->MultiCell($headerWidth, $subtitleLineHeight, $this->encode($this->documentSubtitle), 0, $align);
            }
            $ruleY = $this->GetY() + (float) ($this->layout['headerRuleGap'] ?? 1.5);
            if ((bool) ($this->layout['headerRule'] ?? true)) {
                $this->setDrawColorFromHex((string) ($this->layout['headerRuleColor'] ?? '7C8580'));
                $this->SetLineWidth((float) ($this->layout['headerRuleWidth'] ?? 0.25));
                $this->Line($headerLeft, $ruleY, $this->GetPageWidth() - $headerRight, $ruleY);
            }
            $this->resetDrawingState();
            $this->SetY(max($bodyTop, $ruleY + (float) ($this->layout['headerBodyGap'] ?? 3.5)));
            $this->SetX($left);
            return;
        }

        if ($firstPage) {
            $this->SetFont('Helvetica', 'B', 15);
            $this->Cell(0, 7.0, $this->encode($this->documentTitle), 0, 1, 'L');
            if ($this->documentSubtitle !== '') {
                $this->SetFont('Helvetica', '', 8.5);
                $this->SetTextColor(70, 70, 70);
                $this->MultiCell(0, 4.3, $this->encode($this->documentSubtitle), 0, 'L');
                $this->SetTextColor(0, 0, 0);
            }
            $ruleY = $this->GetY() + 2.0;
            $this->SetDrawColor(55, 65, 81);
            $this->Line($left, $ruleY, $this->GetPageWidth() - $right, $ruleY);
            $this->SetY(max($ruleY + 5.0, $bodyTop));
            $this->SetX($left);
            return;
        }

        $this->SetFont('Helvetica', 'B', 8.5);
        $this->Cell(0, 5.0, $this->encode($this->documentTitle), 0, 1, 'L');
        if ($this->continuationLabel !== '') {
            $this->SetFont('Helvetica', '', 7.5);
            $this->SetTextColor(90, 90, 90);
            $this->Cell(0, 4.0, $this->encode($this->continuationLabel), 0, 1, 'L');
            $this->SetTextColor(0, 0, 0);
        }
        $ruleY = $this->GetY() + 1.5;
        $this->SetDrawColor(120, 120, 120);
        $this->Line($left, $ruleY, $this->GetPageWidth() - $right, $ruleY);
        $this->SetY(max($ruleY + 4.0, $bodyTop));
        $this->SetX($left);
    }

    public function Footer(): void
    {
        if ($this->profileFooter !== []) {
            $this->renderOrganizationProfileFooter($this->profileFooter, '{pageCount}');
            return;
        }

        $pageFooter = trim((string) ($this->layout['pageFooterText'] ?? ''));
        $pageNumbers = (bool) ($this->layout['footerPageNumber'] ?? true);
        if ($pageFooter === '' && ! $pageNumbers) return;

        if ($pageFooter !== '') {
            $this->SetY(-1 * max(2.0, (float) ($this->layout['pageFooterOffset'] ?? $this->layout['footerOffset'] ?? 9.0)));
            $this->setExplicitFont(
                (string) ($this->layout['pageFooterFontFamily'] ?? $this->layout['fontFamily'] ?? 'Helvetica'),
                '',
                (float) ($this->layout['pageFooterFontSize'] ?? $this->layout['footerFontSize'] ?? 7.0),
            );
            $this->setTextColorFromHex((string) ($this->layout['pageFooterTextColor'] ?? $this->layout['footerTextColor'] ?? '696969'));
            $this->Cell(0, 4.0, $this->encode($pageFooter), 0, 0, $this->align((string) ($this->layout['pageFooterAlign'] ?? 'L')));
        }

        if ($pageNumbers) {
            $labels = is_array($this->layout['footerPageLabels'] ?? null) ? array_values($this->layout['footerPageLabels']) : [];
            $page = $labels[$this->PageNo() - 1] ?? $this->PageNo();
            $format = (string) ($this->layout['footerPageNumberFormat'] ?? 'Seite {pageNo} / {pageCount}');
            $text = str_replace(['{pageNo}', '{page}'], (string) $page, $format);
            $this->SetY(-1 * max(2.0, (float) ($this->layout['pageNumberOffset'] ?? $this->layout['footerOffset'] ?? 9.0)));
            $this->setExplicitFont(
                (string) ($this->layout['pageFooterFontFamily'] ?? $this->layout['fontFamily'] ?? 'Helvetica'),
                '',
                (float) ($this->layout['footerFontSize'] ?? $this->layout['pageFooterFontSize'] ?? 7.0),
            );
            $this->setTextColorFromHex((string) ($this->layout['footerTextColor'] ?? '696969'));
            $this->Cell(0, 4.0, $this->encode($text), 0, 0, $this->align((string) ($this->layout['footerPageNumberAlign'] ?? 'R')));
        }

        $this->SetTextColor(0, 0, 0);
    }

    public function encode(string $value): string
    {
        $value = strtr($value, ['₀'=>'0','₁'=>'1','₂'=>'2','₃'=>'3','₄'=>'4','₅'=>'5','₆'=>'6','₇'=>'7','₈'=>'8','₉'=>'9']);
        $converted = iconv('UTF-8', 'Windows-1252//TRANSLIT//IGNORE', $value);
        return is_string($converted) ? $converted : $value;
    }

    private function renderSuiteHeader(float $left, float $right, float $top, float $bodyTop): void
    {
        $width = max(1.0, $this->GetPageWidth() - $left - $right);
        $accentWidth = 1.3;
        $textLeft = $left + 3.2;
        $textWidth = max(1.0, $width - 3.2);
        $titleSize = (float) ($this->layout['headerTitleFontSize'] ?? 12.2);
        $subtitleSize = (float) ($this->layout['headerSubtitleFontSize'] ?? 7.1);
        $titleLineHeight = (float) ($this->layout['headerTitleLineHeight'] ?? 5.4);
        $subtitleLineHeight = (float) ($this->layout['headerSubtitleLineHeight'] ?? 3.6);
        $reservedSubtitleLines = max(0, (int) ($this->layout['headerReservedSubtitleLines'] ?? 0));
        $this->SetY($top);
        $headerStart = $this->GetY();
        $this->setTextColorFromHex((string) ($this->layout['headerTextColor'] ?? '1F2937'));
        $this->SetFont('Helvetica', 'B', $titleSize);
        $this->SetX($textLeft);
        $this->Cell($textWidth, $titleLineHeight, $this->encode($this->documentTitle), 0, 1, 'L');
        if ($this->documentSubtitle !== '') {
            $this->setTextColorFromHex((string) ($this->layout['headerMutedColor'] ?? '64748B'));
            $this->SetFont('Helvetica', '', $subtitleSize);
            $this->SetX($textLeft);
            $this->MultiCell($textWidth, $subtitleLineHeight, $this->encode($this->documentSubtitle), 0, 'L');
        }
        $reservedBottom = $headerStart + $titleLineHeight + ($reservedSubtitleLines * $subtitleLineHeight);
        $headerBottom = max($this->GetY(), $reservedBottom, $headerStart + $titleLineHeight);
        $this->setFillColorFromHex((string) ($this->layout['headerAccentColor'] ?? '3F637D'));
        $this->Rect($left, $headerStart + 0.4, $accentWidth, max(4.4, $headerBottom - $headerStart - 0.2), 'F');
        $ruleY = $headerBottom + (float) ($this->layout['headerRuleGap'] ?? 1.1);
        if ((bool) ($this->layout['headerRule'] ?? true)) {
            $this->setDrawColorFromHex((string) ($this->layout['headerRuleColor'] ?? 'D6DEE5'));
            $this->SetLineWidth((float) ($this->layout['headerRuleWidth'] ?? 0.18));
            $this->Line($left, $ruleY, $this->GetPageWidth() - $right, $ruleY);
        }
        $this->resetDrawingState();
        $this->SetY(max($bodyTop, $ruleY + (float) ($this->layout['headerBodyGap'] ?? 3.0)));
        $this->SetX($left);
    }

    private function renderDin5008LetterHeader(): void
    {
        $letter = $this->din5008LetterData();
        $organization = is_array($letter['organization'] ?? null) ? $letter['organization'] : [];
        $recipientLines = collect((array) ($letter['recipientLines'] ?? []))->map(fn ($line): string => trim((string) $line))->filter()->values()->all();
        $subject = trim((string) ($letter['subjectText'] ?? $this->documentTitle));
        $senderName = $this->din5008SenderName($organization);
        $senderAddress = $this->din5008SenderAddressLine($organization);

        $this->SetMargins(25.0, 20.0, 20.0);

        if ($this->PageNo() !== 1) {
            $continuationSubject = trim((string) ((preg_split('/\R/u', $subject) ?: [$subject])[0] ?? $subject));
            $this->SetFont('Helvetica', '', 8);
            $this->SetTextColor(90, 90, 90);
            $this->SetXY(25.0, 12.0);
            $this->MultiCell(165.0, 4.0, $this->encode($senderName.' – '.$continuationSubject), 0, 'R');
            $ruleY = max(22.0, $this->GetY() + 2.0);
            $this->SetDrawColor(210, 210, 210);
            $this->SetLineWidth(0.1);
            $this->Line(25.0, $ruleY, 190.0, $ruleY);
            $this->SetTextColor(0, 0, 0);
            $this->SetXY(25.0, $ruleY + 8.0);
            return;
        }

        $this->SetDrawColor(180, 180, 180);
        $this->SetLineWidth(0.1);
        $this->Line(5, 105, 10, 105);
        $this->Line(5, 148.5, 8, 148.5);
        $this->Line(5, 210, 10, 210);

        $headerBottom = $this->renderOrganizationProfileHeader($organization, $senderName, $senderAddress);
        $this->finishOrganizationProfileHeader($organization, $headerBottom);

        $returnLine = implode(' · ', array_values(array_filter([$senderName, $senderAddress])));
        $returnLines = $this->profileWrappedLines($returnLine, 85.0, '', 6.5);
        if (count($returnLines) > 4) {
            throw ValidationException::withMessages(['letter' => 'Die Absenderzeile ist zu umfangreich für das Anschriftenfenster. Bitte prüfen Sie die Firmierung und die Absenderanschrift.']);
        }
        $this->SetFont('Helvetica', '', 6.5);
        $this->SetTextColor(0, 0, 0);
        $this->SetXY(20.0, 45.0);
        foreach ($returnLines as $line) {
            $this->SetX(20.0);
            $this->Cell(85.0, 2.7, $line, 0, 2);
        }

        $noteY = max(50.0, $this->GetY() + 1.0);
        $deliveryNote = trim((string) ($letter['deliveryNote'] ?? ''));
        if ($deliveryNote !== '') {
            $this->SetFont('Helvetica', 'B', 8.0);
            $this->SetXY(20.0, $noteY);
            $this->Cell(85.0, 4.3, $this->encode($deliveryNote));
            $noteY += 5.0;
        }

        $this->SetFont('Helvetica', '', 10);
        $this->SetXY(20.0, max(55.0, $noteY));
        foreach (array_slice($recipientLines, 0, 6) as $line) {
            $this->SetX(20.0);
            $this->Cell(85.0, 5.0, $this->encode($line), 0, 2);
        }
        $recipientBottom = $this->GetY();

        $references = array_values(array_filter([
            ['label' => 'Ihr Zeichen', 'value' => trim((string) ($letter['yourReference'] ?? ''))],
            ['label' => 'Unser Zeichen', 'value' => trim((string) ($letter['ourReference'] ?? ''))],
            ['label' => 'Datum', 'value' => trim((string) ($letter['letterDate'] ?? ''))],
        ], fn (array $reference): bool => $reference['value'] !== ''));

        $this->SetXY(125.0, 50.0);
        foreach ($references as $reference) {
            $y = $this->GetY();
            $this->SetFont('Helvetica', 'B', 8);
            $this->SetXY(125.0, $y);
            $this->Cell(24.0, 4.2, $this->encode($reference['label']));
            $this->SetFont('Helvetica', '', 8);
            $this->SetXY(150.0, $y);
            $this->MultiCell(40.0, 4.2, $this->encode($reference['value']));
            $this->SetY(max($this->GetY(), $y + 4.2));
        }

        $subjectY = max(98.0, $recipientBottom + 6.0);
        $deliveryTargetLabel = trim((string) ($letter['deliveryTargetLabel'] ?? ''));
        $deliveryTargets = collect((array) ($letter['deliveryTargets'] ?? []))->map(fn ($value): string => trim((string) $value))->filter()->values()->all();
        if ($deliveryTargetLabel !== '' && $deliveryTargets !== []) {
            $this->SetFont('Helvetica', '', 8);
            $this->SetTextColor(45, 45, 45);
            $this->SetXY(25.0, 91.5);
            $this->MultiCell(165.0, 3.8, $this->encode($deliveryTargetLabel.': '.implode('; ', $deliveryTargets)), 0, 'L');
            $subjectY = max($subjectY, $this->GetY() + 2.0);
        }

        $this->SetFont('Helvetica', 'B', 10);
        $this->SetTextColor(0, 0, 0);
        $this->SetXY(25.0, $subjectY);
        $this->MultiCell(165.0, 5.0, $this->encode($subject));
        $this->SetY(max(111.0, $this->GetY() + 7.0));
        $this->SetX(25.0);
    }

    private function din5008LetterData(): array
    {
        return is_array($this->layout['letter'] ?? null) ? $this->layout['letter'] : [];
    }

    private function din5008SenderName(array $organization): string
    {
        return trim((string) ($organization['senderName'] ?? '')) ?: (string) config('app.name', 'Verwaltung');
    }

    private function din5008SenderAddressLine(array $organization): string
    {
        $street = trim((string) ($organization['street'] ?? '').' '.(string) ($organization['houseNumber'] ?? ''));
        $city = trim((string) ($organization['postalCode'] ?? '').' '.(string) ($organization['city'] ?? ''));
        return implode(' · ', array_values(array_filter([$street, $city])));
    }

    private function setExplicitFont(string $family, string $style, float $size): void
    {
        parent::SetFont($this->coreFont($family), $style, $size);
    }

    private function coreFont(string $family): string
    {
        return match (strtolower(trim($family))) {
            'times', 'times new roman', 'serif' => 'Times',
            'courier', 'courier new', 'mono', 'monospace' => 'Courier',
            default => 'Helvetica',
        };
    }

    private function align(string $value): string
    {
        return match (strtolower(trim($value))) {
            'center', 'centre', 'c', 'mittig' => 'C',
            'right', 'r', 'rechts' => 'R',
            default => 'L',
        };
    }

    private function resetDrawingState(): void
    {
        $this->SetTextColor(0, 0, 0);
        $this->SetDrawColor(0, 0, 0);
        $this->SetFillColor(255, 255, 255);
        $this->SetLineWidth(0.2);
    }
    private function setTextColorFromHex(string $hex): void { [$r,$g,$b] = $this->rgb($hex); $this->SetTextColor($r,$g,$b); }
    private function setDrawColorFromHex(string $hex): void { [$r,$g,$b] = $this->rgb($hex); $this->SetDrawColor($r,$g,$b); }
    private function setFillColorFromHex(string $hex): void { [$r,$g,$b] = $this->rgb($hex); $this->SetFillColor($r,$g,$b); }
    /** @return array{0:int,1:int,2:int} */
    private function rgb(string $hex): array
    {
        $hex = ltrim(trim($hex), '#');
        if (strlen($hex) !== 6 || ! ctype_xdigit($hex)) return [0,0,0];
        return [hexdec(substr($hex,0,2)), hexdec(substr($hex,2,2)), hexdec(substr($hex,4,2))];
    }
}
