<?php

namespace App\Services\Documents\Concerns;

use App\Services\Documents\OrganizationDocumentProfile;
use Illuminate\Validation\ValidationException;

/** Shared, measured issuer furniture for the existing FPDF report pipelines. */
trait OrganizationProfilePdfLayout
{
    private const PROFILE_FOOTER_LINE_HEIGHT = 4.0;

    private const PROFILE_FOOTER_FONT_SIZE = 8.0;

    private const PROFILE_FOOTER_MIN_FONT_SIZE = 7.0;

    private const PROFILE_FOOTER_GAP = 3.0;

    private const PROFILE_FOOTER_COLUMN_GAP = 6.0;

    private const PROFILE_FOOTER_BOTTOM = 10.0;

    private const PROFILE_FOOTER_BODY_GAP = 8.0;

    /** @var array<int,list<array{marker:string,x:float,y:float,width:float,pageHeight:float,font:int}>> */
    private array $organizationFooterPageNumbers = [];

    private function renderOrganizationProfileFooter(array $footer, string $pageCountAlias): void
    {
        $state = $this->beginOrganizationFooterState();
        try {
            // A footer may also be drawn explicitly by a fixed-layout renderer.
            // It must never trigger a new page or inherit justified word spacing.
            $this->InFooter = true;
            $this->cMargin = 0.0;
            $this->ws = 0.0;
            $this->_out('0 Tw');
            $this->SetDrawColor(184, 184, 184);
            $this->SetLineWidth(0.15);
            $this->Line($footer['left'], $footer['top'], $footer['left'] + $footer['width'], $footer['top']);

            $this->renderOrganizationFooterRows($footer['compactRows'], $footer['left'], $footer['contentTop']);
            $this->renderOrganizationFooterRows($footer['utility']['rows'], $footer['left'], $footer['utility']['top']);

            // FPDF substitutes the total-page alias after Cell has calculated its
            // alignment. Resolve this one line at page serialization instead, so
            // the final number, including a change in digit count, is flush right.
            // Keep the alias argument compatible with existing renderer callers.
            parent::SetFont('Helvetica', '', self::PROFILE_FOOTER_FONT_SIZE);
            $page = $this->PageNo();
            $marker = sprintf('%%S4V2-ORGANIZATION-PAGE-%d-%d%%', $page, count($this->organizationFooterPageNumbers[$page] ?? []));
            $this->organizationFooterPageNumbers[$page][] = [
                'marker' => $marker,
                'x' => $footer['utility']['pageX'],
                'y' => $footer['utility']['pageY'],
                'width' => $footer['utility']['pageWidth'],
                'pageHeight' => $this->GetPageHeight(),
                'font' => $this->CurrentFont['i'],
            ];
            $this->_out($marker);
        } finally {
            $this->restoreOrganizationFooterState($state);
        }
    }

    /**
     * Geometry options use millimetres and default to the owning FPDF margins.
     * Document options (reference, payment and identifier policy) are forwarded
     * unchanged to the canonical profile projection. Legacy additional groups
     * remain full-width paragraphs until their callers supply explicit context.
     *
     * @return array{top:float,bodyBottom:float,height:float,left:float,width:float,contentTop:float,columns:array,legalTop:float,legalRows:array,utility:array}
     */
    private function measureOrganizationProfileFooter(array $organization, float $firstPageBodyTop = 111.0, array $additionalGroups = [], array $options = []): array
    {
        $state = $this->beginOrganizationFooterState();
        try {
            $this->cMargin = 0.0;
            $left = (float) ($options['marginLeft'] ?? $this->lMargin);
            $right = (float) ($options['marginRight'] ?? $this->rMargin);
            $width = $this->GetPageWidth() - $left - $right;
            $minimumBodyHeight = (float) ($options['minimumBodyHeight'] ?? 30.0);
            foreach ([$left, $right, $width, $firstPageBodyTop, $minimumBodyHeight] as $number) {
                if (! is_finite($number) || $number < 0.0) {
                    throw $this->organizationFooterOverflow();
                }
            }
            if ($width <= 0.0) {
                throw $this->organizationFooterOverflow();
            }

            $content = (new OrganizationDocumentProfile)->footerContent($organization, $options);
            // One full-width line per semantic group; wrap only when necessary.
            $identity = array_values(array_filter(array_merge(
                [trim((string) ($content['identity']['title'] ?? ''))],
                $content['identity']['lines'] ?? []
            ), static fn ($value): bool => trim((string) $value) !== ''));
            $contacts = array_values(array_filter($content['contact']['lines'] ?? [], static fn ($value): bool => trim((string) $value) !== ''));
            $compactRows = [];
            $identityText = implode(' · ', array_merge($identity, $contacts));
            if ($identityText !== '') {
                array_push($compactRows, ...$this->organizationFooterFittedRows($identityText, $width));
            }
            $legalParts = [];
            foreach ($content['legal'] as $entry) {
                $value = trim((string) ($entry['value'] ?? ''));
                if ($value !== '') {
                    $label = rtrim(trim((string) ($entry['label'] ?? '')), ':');
                    $legalParts[] = ($label !== '' ? $label.': ' : '').$value;
                }
            }
            if ($legalParts !== []) {
                array_push($compactRows, ...$this->organizationFooterFittedRows(implode(' · ', $legalParts), $width));
            }
            $payment = array_values(array_filter($content['payment']['lines'] ?? [], static fn ($value): bool => trim((string) $value) !== ''));
            if ($payment !== []) {
                array_push($compactRows, ...$this->organizationFooterFittedRows(implode(' · ', $payment), $width));
            }
            foreach ($content['notes'] as $note) {
                array_push($compactRows, ...$this->organizationFooterFittedRows(trim((string) $note), $width));
            }
            foreach ($additionalGroups as $group) {
                $values = array_values(array_filter(array_map(static fn ($value): string => trim((string) $value), $group['values'] ?? [])));
                if ($values !== []) {
                    $title = rtrim(trim((string) ($group['title'] ?? '')), ':');
                    array_push($compactRows, ...$this->organizationFooterFittedRows(($title !== '' ? $title.': ' : '').implode(' · ', $values), $width));
                }
            }
            $informationHeight = count($compactRows) * self::PROFILE_FOOTER_LINE_HEIGHT;
            $pageWidth = min(32.0, $width);
            $referenceWidth = $width - $pageWidth - self::PROFILE_FOOTER_COLUMN_GAP;
            $reference = ''; // Document references belong in the document header, not the compact footer.
            $referenceRows = $reference === '' ? [] : $this->organizationFooterWrappedRows([['text' => $reference, 'bold' => false]], $referenceWidth);
            $utilityHeight = max(1, count($referenceRows)) * self::PROFILE_FOOTER_LINE_HEIGHT;
            $height = self::PROFILE_FOOTER_GAP + $informationHeight + $utilityHeight;
            $top = $this->GetPageHeight() - self::PROFILE_FOOTER_BOTTOM - $height;
            $bodyBottom = $top - self::PROFILE_FOOTER_BODY_GAP;
            if ($bodyBottom < $firstPageBodyTop + $minimumBodyHeight) {
                throw $this->organizationFooterOverflow();
            }
            $contentTop = $top + self::PROFILE_FOOTER_GAP;

            return [
                'top' => $top, 'bodyBottom' => $bodyBottom, 'height' => $height, 'left' => $left, 'width' => $width,
                'contentTop' => $contentTop, 'compactRows' => $compactRows,
                'utility' => [
                    'top' => $this->GetPageHeight() - self::PROFILE_FOOTER_BOTTOM - $utilityHeight,
                    'rows' => $referenceRows, 'width' => max(0.0, $referenceWidth),
                    'pageX' => $left + $width - $pageWidth, 'pageWidth' => $pageWidth,
                    'pageY' => $this->GetPageHeight() - self::PROFILE_FOOTER_BOTTOM - self::PROFILE_FOOTER_LINE_HEIGHT,
                ],
            ];
        } finally {
            $this->restoreOrganizationFooterState($state);
        }
    }

    /**
     * Fit a complete semantic footer group on one line when 7–8 pt permits it.
     * Keep 8 pt for short lines and preserve full-width wrapping for longer
     * content: identifiers and legal details are never omitted or truncated.
     */
    private function organizationFooterFittedRows(string $text, float $width): array
    {
        $runs = [['text' => $text, 'bold' => false]];
        $encoded = $this->organizationFooterEncode($text);
        if (! str_contains($encoded, "\n") && ! str_contains($encoded, "\r")) {
            for ($size = self::PROFILE_FOOTER_FONT_SIZE; $size >= self::PROFILE_FOOTER_MIN_FONT_SIZE; $size -= 0.25) {
                parent::SetFont('Helvetica', '', $size);
                if ($this->GetStringWidth($encoded) <= $width + 0.00001) {
                    return $this->organizationFooterWrappedRows($runs, $width, $size);
                }
            }

            return $this->organizationFooterWrappedRows($runs, $width, self::PROFILE_FOOTER_MIN_FONT_SIZE);
        }

        return $this->organizationFooterWrappedRows($runs, $width);
    }

    /** @return list<array{text:string,runs:array,height:float,fontSize:float}> Encoded runs use identical measurement and drawing metrics. */
    private function organizationFooterWrappedRows(array $runs, float $width, float $fontSize = self::PROFILE_FOOTER_FONT_SIZE): array
    {
        if ($width <= 0.0 || ! is_finite($width)) {
            throw $this->organizationFooterOverflow();
        }
        $rows = $row = [];
        $used = 0.0;
        $space = false;
        $finish = static function () use (&$rows, &$row, &$used, &$space, $fontSize): void {
            if ($row !== []) {
                $rows[] = ['text' => implode('', array_column($row, 'text')), 'runs' => $row, 'height' => self::PROFILE_FOOTER_LINE_HEIGHT, 'fontSize' => $fontSize];
            }
            $row = [];
            $used = 0.0;
            $space = false;
        };
        $append = static function (string $text, bool $bold, float $length) use (&$row, &$used): void {
            $last = count($row) - 1;
            if ($last >= 0 && $row[$last]['bold'] === $bold) {
                $row[$last]['text'] .= $text;
                $row[$last]['width'] += $length;
            } else {
                $row[] = ['text' => $text, 'bold' => $bold, 'width' => $length];
            }
            $used += $length;
        };

        foreach ($runs as $run) {
            $bold = (bool) $run['bold'];
            parent::SetFont('Helvetica', $bold ? 'B' : '', $fontSize);
            $encoded = $this->organizationFooterEncode((string) $run['text']);
            foreach (preg_split('/(\r\n|\r|\n|[\t ]+)/', $encoded, -1, PREG_SPLIT_DELIM_CAPTURE | PREG_SPLIT_NO_EMPTY) ?: [] as $word) {
                if (str_contains($word, "\r") || str_contains($word, "\n")) {
                    $finish();

                    continue;
                }
                if (trim($word, " \t") === '') {
                    $space = $row !== [];

                    continue;
                }
                $wordWidth = $this->GetStringWidth($word);
                $spaceWidth = $space ? $this->GetStringWidth(' ') : 0.0;
                if ($used + $spaceWidth + $wordWidth <= $width + 0.00001) {
                    if ($space) {
                        $append(' ', $bold, $spaceWidth);
                    }
                    $append($word, $bold, $wordWidth);
                } else {
                    $finish();
                    if ($wordWidth <= $width + 0.00001) {
                        $append($word, $bold, $wordWidth);
                    } else {
                        // Hard identifiers have no whitespace to wrap at. Split
                        // only their presentation, without adding or losing bytes.
                        foreach (str_split($word) as $character) {
                            $length = $this->GetStringWidth($character);
                            if ($length > $width + 0.00001) {
                                throw $this->organizationFooterOverflow();
                            }
                            if ($used + $length > $width + 0.00001) {
                                $finish();
                            }
                            $append($character, $bold, $length);
                        }
                    }
                }
                $space = false;
            }
        }
        $finish();

        return $rows;
    }

    private function renderOrganizationFooterRows(array $rows, float $left, float $top): void
    {
        foreach ($rows as $row) {
            $x = $left;
            foreach ($row['runs'] as $run) {
                parent::SetFont('Helvetica', $run['bold'] ? 'B' : '', (float) ($row['fontSize'] ?? self::PROFILE_FOOTER_FONT_SIZE));
                $gray = $run['bold'] ? 51 : 85;
                $this->SetTextColor($gray, $gray, $gray);
                $this->SetXY($x, $top);
                $this->Cell($run['width'], $row['height'], $run['text']);
                $x += $run['width'];
            }
            $top += $row['height'];
        }
    }

    /** Final total-page width is now known; replacing this marker cannot move body content. */
    protected function _putpage($n): void
    {
        foreach ($this->organizationFooterPageNumbers[$n] ?? [] as $number) {
            $text = 'Seite '.$n.' von '.$this->page;
            $font = $this->fonts['helvetica'];
            $width = 0.0;
            foreach (str_split($text) as $character) {
                $width += $font['cw'][$character];
            }
            $width *= self::PROFILE_FOOTER_FONT_SIZE / 1000.0 / $this->k;
            if ($width > $number['width'] + 0.00001) {
                throw $this->organizationFooterOverflow();
            }
            $x = ($number['x'] + $number['width'] - $width) * $this->k;
            $y = ($number['pageHeight'] - ($number['y'] + (self::PROFILE_FOOTER_LINE_HEIGHT / 2.0) + (0.3 * self::PROFILE_FOOTER_FONT_SIZE / $this->k))) * $this->k;
            $command = sprintf('q 0.333 g BT /F%d %.2F Tf %.2F %.2F Td (%s) Tj ET Q', $number['font'], self::PROFILE_FOOTER_FONT_SIZE, $x, $y, $this->_escape($text));
            $this->pages[$n] = str_replace("\n".$number['marker']."\n", "\n".$command."\n", $this->pages[$n]);
        }
        parent::_putpage($n);
    }

    /** Isolate footer metrics, cursor, drawing state and cell padding from every body renderer. */
    private function beginOrganizationFooterState(): array
    {
        $state = [];
        foreach (['x', 'y', 'lasth', 'cMargin', 'FontFamily', 'FontStyle', 'FontSizePt', 'FontSize', 'CurrentFont', 'underline', 'DrawColor', 'FillColor', 'TextColor', 'ColorFlag', 'LineWidth', 'ws', 'InFooter'] as $property) {
            $state[$property] = $this->{$property} ?? null;
        }
        $state['graphicsSaved'] = $this->state === 2;
        if ($state['graphicsSaved']) {
            $this->_out('q');
        }

        return $state;
    }

    private function restoreOrganizationFooterState(array $state): void
    {
        if ($state['graphicsSaved']) {
            $this->_out('Q');
        }
        unset($state['graphicsSaved']);
        foreach ($state as $property => $value) {
            $this->{$property} = $value;
        }
    }

    private function organizationFooterEncode(string $text): string
    {
        $text = str_replace(["\u{00A0}", "\u{202F}"], ' ', $text);
        $encoded = iconv('UTF-8', 'windows-1252//TRANSLIT', $text);
        if ($encoded === false) {
            throw $this->organizationFooterOverflow();
        }

        return $encoded;
    }

    private function organizationFooterOverflow(): ValidationException
    {
        return ValidationException::withMessages(['document.footer' => 'Die Unternehmensangaben sind zu umfangreich für einen lesbaren Dokumentfuß mit ausreichend Platz für den Inhalt. Bitte prüfen Sie die Angaben und das Seitenformat. Es wurden keine Angaben gekürzt.']);
    }

    /** @return array<int,string> Encoded lines measured with the exact emitted font. */
    private function profileWrappedLines(string $text, float $width, string $style, float $size): array
    {
        $this->SetFont('Helvetica', $style, $size);
        $available = max(1.0, $width - (2.0 * $this->cMargin));
        $lines = [];
        foreach (preg_split('/\R/u', $text) ?: [] as $paragraph) {
            $line = '';
            foreach (preg_split('/[\t ]+/u', trim($paragraph), -1, PREG_SPLIT_NO_EMPTY) ?: [] as $word) {
                $word = $this->encode($word);
                $candidate = $line === '' ? $word : $line.' '.$word;
                if ($this->GetStringWidth($candidate) <= $available) {
                    $line = $candidate;

                    continue;
                }
                if ($line !== '') {
                    $lines[] = $line;
                    $line = '';
                }
                foreach (str_split($word) as $character) {
                    if ($line !== '' && $this->GetStringWidth($line.$character) > $available) {
                        $lines[] = $line;
                        $line = '';
                    }
                    $line .= $character;
                }
            }
            if ($line !== '') {
                $lines[] = $line;
            }
        }

        return $lines;
    }

    private function renderOrganizationProfileHeader(array $organization, string $senderName, string $senderAddress): float
    {
        $logo = $this->validatedProfileLogo((string) ($organization['logoDataUri'] ?? ''));
        if ($logo !== null) {
            // The captured logo is the sole visual brand in the letterhead.
            // The full legal sender remains in the return-address window and footer.
            // Align with the 125–190 mm reference column; center the logo in its own
            // 10.5–28.5 mm band. Branded first pages have no divider.
            $scale = min(65.0 / $logo['width'], 18.0 / $logo['height']);
            $imageWidth = $logo['width'] * $scale;
            $imageHeight = $logo['height'] * $scale;

            try {
                $this->Image(
                    $logo['stream'],
                    $this->GetPageWidth() - 20.0 - $imageWidth,
                    10.5 + (18.0 - $imageHeight) / 2.0,
                    $imageWidth,
                    $imageHeight,
                    $logo['type'],
                );
            } catch (\Throwable) {
                throw ValidationException::withMessages(['values.logoDocumentId' => 'Das gespeicherte Logo konnte nicht in das PDF übernommen werden. Bitte laden Sie ein gültiges PNG- oder JPEG-Logo hoch.']);
            }

            // Preserve the reference and address-window spacing, with or without a divider.
            return 32.0;
        }

        // No configured logo: keep a complete, centered, text-only letterhead.
        $left = 25.0;
        $width = 165.0;
        $nameLines = $addressLines = [];
        $nameSize = 11.0;
        $addressSize = 8.0;
        $nameHeight = 5.0;
        $addressHeight = 4.0;
        foreach ([[11.0, 8.0], [10.0, 7.7], [9.0, 7.5]] as [$nameSize, $addressSize]) {
            $nameHeight = $nameSize * 0.44;
            $addressHeight = $addressSize * 0.48;
            $nameLines = $this->profileWrappedLines($senderName, $width, 'B', $nameSize);
            $addressLines = $this->profileWrappedLines($senderAddress, $width, '', $addressSize);
            if ((count($nameLines) * $nameHeight) + (count($addressLines) * $addressHeight) <= 29.0) {
                break;
            }
        }
        if ((count($nameLines) * $nameHeight) + (count($addressLines) * $addressHeight) > 29.0) {
            throw ValidationException::withMessages(['letter' => 'Die Firmierung und Absenderanschrift sind zu umfangreich für den Briefkopf. Bitte prüfen Sie diese Angaben; es wurde kein Text gekürzt.']);
        }
        $y = 10.0;
        foreach ([[$nameLines, 'B', $nameSize, $nameHeight], [$addressLines, '', $addressSize, $addressHeight]] as [$lines, $style, $size, $height]) {
            $this->SetFont('Helvetica', $style, $size);
            $this->SetTextColor($style === 'B' ? 35 : 90, $style === 'B' ? 35 : 90, $style === 'B' ? 35 : 90);
            foreach ($lines as $line) {
                $this->SetXY($left, $y);
                $this->Cell($width, $height, $line, 0, 0, 'C');
                $y += $height;
            }
        }

        return $y;
    }

    /** Keep first-page spacing, drawing a divider only for text-only letterheads. */
    private function finishOrganizationProfileHeader(array $organization, float $headerBottom): float
    {
        $bottom = max(21.0, $headerBottom + 2.0);
        $this->SetDrawColor(210, 210, 210);
        $this->SetLineWidth(0.1);
        if ((string) ($organization['logoDataUri'] ?? '') === '') {
            $this->Line(25.0, $bottom, 190.0, $bottom);
        }

        return $bottom;
    }

    /** @return array{stream:string,type:string,width:int,height:int}|null */
    private function validatedProfileLogo(string $dataUri): ?array
    {
        if ($dataUri === '') {
            return null;
        }
        $invalid = static fn () => ValidationException::withMessages(['values.logoDocumentId' => 'Das gespeicherte Logo ist nicht als gültiges PNG- oder JPEG-Bild verfügbar. Bitte laden Sie das Logo erneut hoch.']);
        if (strlen($dataUri) > 2_800_000 || preg_match('/\Adata:image\/(png|jpeg);base64,([A-Za-z0-9+\/]*={0,2})\z/D', $dataUri, $match) !== 1) {
            throw $invalid();
        }
        $bytes = base64_decode($match[2], true);
        if ($bytes === false || strlen($bytes) === 0 || strlen($bytes) > 2 * 1024 * 1024) {
            throw $invalid();
        }
        $size = @getimagesizefromstring($bytes);
        $expected = $match[1] === 'png' ? IMAGETYPE_PNG : IMAGETYPE_JPEG;
        if ($size === false || $size[2] !== $expected || $size[0] < 1 || $size[1] < 1 || $size[0] > 2048 || $size[1] > 2048) {
            throw $invalid();
        }

        return ['stream' => 'data://application/octet-stream;base64,'.base64_encode($bytes), 'type' => $match[1] === 'png' ? 'PNG' : 'JPG', 'width' => $size[0], 'height' => $size[1]];
    }
}
