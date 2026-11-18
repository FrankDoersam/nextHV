<?php

namespace App\Services\Documents;

/**
 * Final editor-first normalization for document reports.
 *
 * Visible report content is stored as Tiptap nodes. Renderer-only chrome,
 * historical page-break artifacts and implementation labels are removed here
 * before a template is persisted.
 */
final class DocumentEditorContentPolicy
{
    private const REMOVED_TEXT = [
        'Eine Wohnanschrift darf nicht für eine Anmeldung angeboten oder zur Verfügung gestellt werden, wenn ein tatsächlicher Bezug der Wohnung weder stattfindet noch beabsichtigt ist.',
        'Tiptap Community · PDF serverseitig mit FPDF',
    ];

    private const NO_PAGE_BREAK_CODES = [
        'lease-contract-parking-space',
        'lease-contract-garage-source',
    ];

    private const GENERIC_FACT_HEADERS = [
        'angabe',
        'wert',
        'daten',
        'regelung',
        'vereinbart',
        'zahlung',
        'vertragsobjekt',
        'information',
        'informationen',
        'details',
    ];

    private const TEXT_REPLACEMENTS = [
        'Bei einer ausgewiesenen Mindestlaufzeit von mehr als 0 Monaten vereinbaren die Parteien für diesen Zeitraum einen wechselseitigen Ausschluss der ordentlichen Kündigung; dadurch wird kein Zeitmietvertrag begründet. Die ordentliche Kündigung darf bereits so rechtzeitig erklärt werden, dass sie unter Einhaltung der gesetzlichen Kündigungsfrist zum Ablauf der wirksamen Mindestbindung wirksam wird. Ein formularmäßiger Kündigungsverzicht des Mieters ist auf höchstens vier Jahre ab Vertragsschluss begrenzt. Soweit eine hinterlegte Mindestlaufzeit rechnerisch darüber hinausreichen würde, gilt der ordentliche Kündigungsverzicht nur bis zur rechtlich zulässigen Höchstgrenze. Das Recht beider Parteien zur außerordentlichen Kündigung aus wichtigem Grund sowie zwingende Sonderkündigungsrechte bleiben unberührt.'
            => 'Bei einer ausgewiesenen Mindestlaufzeit von mehr als 0 Monaten verzichten die Parteien wechselseitig für die vereinbarte Dauer auf die ordentliche Kündigung; ein Zeitmietvertrag wird dadurch nicht begründet. Eine ordentliche Kündigung darf bereits während der Bindungszeit erklärt werden, wenn sie unter Einhaltung der gesetzlichen Kündigungsfrist frühestens zum Ende der wirksam vereinbarten Bindung wirkt. Wird diese Regelung als vorformulierte Vertragsbedingung verwendet, darf der Kündigungsausschluss den Mieter nicht länger als vier Jahre ab Vertragsschluss an der ordentlichen Kündigung hindern. Eine darüber hinausgehende formularmäßige Bindung wird nicht vereinbart; eine längere Bindung kommt nur aufgrund einer im Einzelfall wirksam ausgehandelten Individualvereinbarung in Betracht. Das Recht beider Parteien zur außerordentlichen Kündigung aus wichtigem Grund sowie zwingende Sonderkündigungsrechte bleiben unberührt.',
        'Nach Ablauf einer wirksamen Mindestbindung kann der Mieter ordentlich nach § 573c Abs. 1 BGB kündigen. Für eine ordentliche Kündigung durch den Vermieter gelten insbesondere die Voraussetzungen des § 573 BGB und die gesetzlichen Kündigungsfristen des § 573c BGB. Eine Kündigung zum Zweck der Mieterhöhung wird nicht vereinbart.'
            => 'Nach Ende einer wirksam vereinbarten Bindung kann der Mieter nach § 573c Abs. 1 BGB ordentlich kündigen. Der Vermieter kann nur bei einem berechtigten Interesse im Sinne des § 573 BGB und unter Einhaltung der gesetzlichen Kündigungsfristen des § 573c BGB ordentlich kündigen. Eine Kündigung zum Zweck der Mieterhöhung ist gesetzlich ausgeschlossen.',
        'Ist als Laufzeit „befristet“ vereinbart, endet das Mietverhältnis nur dann zum angegebenen Zeitpunkt, wenn die gesetzlichen Voraussetzungen eines Zeitmietvertrags nach § 575 BGB erfüllt sind und der gesetzlich erforderliche Befristungsgrund bei Vertragsschluss mitgeteilt wurde. Andernfalls gelten die gesetzlichen Folgen einer unwirksamen Befristung.'
            => 'Ist „befristet“ ausgewiesen, liegt ein wirksamer Zeitmietvertrag nur vor, wenn bei Vertragsschluss ein Befristungsgrund nach § 575 Abs. 1 BGB besteht und dieser dem Mieter bei Vertragsschluss schriftlich mitgeteilt wird. Fehlt eine gesetzliche Voraussetzung oder die schriftliche Mitteilung, gilt das Mietverhältnis als auf unbestimmte Zeit geschlossen. Die Rechte des Mieters nach § 575 Abs. 2 und 3 BGB bleiben unberührt.',
        'Die vereinbarten Mietstaffeln werden aus den Vertragskonditionen erzeugt.'
            => 'Eine Staffelmiete ist nur vereinbart, wenn im Dokument konkrete Mietstaffeln mit ihrem jeweiligen Beginn und der jeweiligen Miete oder Erhöhung als Geldbetrag ausgewiesen sind. Die Miete muss je Staffel mindestens ein Jahr unverändert bleiben; während der Laufzeit der Staffelmiete sind Erhöhungen nach den §§ 558 bis 559b BGB ausgeschlossen. Im Übrigen gilt § 557a BGB. Fehlen konkrete Staffeln, wird durch diesen Abschnitt keine Staffelmiete vereinbart.',
        'Die Indexmietvereinbarung wird aus dem gewählten Mietanpassungsmodell erzeugt.'
            => 'Eine Indexmiete ist nur vereinbart, wenn im Dokument ausdrücklich das Mietanpassungsmodell „Indexmiete“ ausgewiesen ist. In diesem Fall bestimmt sich die Miete nach dem vom Statistischen Bundesamt ermittelten Preisindex für die Lebenshaltung aller privaten Haushalte in Deutschland. Die Miete muss – abgesehen von den gesetzlich zugelassenen Ausnahmen – jeweils mindestens ein Jahr unverändert bleiben. Eine Änderung ist in Textform geltend zu machen und muss die eingetretene Indexänderung sowie die neue Miete oder den Erhöhungsbetrag in Geld ausweisen; die geänderte Miete ist mit Beginn des übernächsten Monats nach Zugang der Erklärung zu entrichten. Eine Erhöhung nach § 558 BGB ist während der Indexmiete ausgeschlossen; im Übrigen gilt § 557b BGB. Ist keine Indexmiete ausgewiesen, wird durch diesen Abschnitt keine Indexmiete vereinbart.',
        'Ist dieser Garagen- oder Stellplatzvertrag in der Vertragsakte mit einem Wohnraummietvertrag als Hauptvertrag verknüpft, entscheidet die technische Verknüpfung allein noch nicht über die zivilrechtliche Einheit beider Verträge. Bilden beide Vereinbarungen nach Parteien, Abschlussumständen und Vertragszweck rechtlich ein einheitliches Wohnraummietverhältnis, gehen für Mindestbindung, ordentliche Kündigung und zwingende Schutzvorschriften die Regeln des Wohnraummietverhältnisses vor; eine isolierte ordentliche Beendigung nur der Garage oder des Stellplatzes ist dann nur zulässig, soweit sie rechtlich eröffnet ist. Bleibt der Garagen- oder Stellplatzvertrag rechtlich selbstständig, gelten die Regelungen dieses Vertrags.'
            => 'Ob dieser Vertrag zusammen mit einem Wohnraummietvertrag eine rechtliche Einheit bildet, richtet sich nach den Vereinbarungen, den Abschlussumständen und dem erkennbaren Parteiwillen. Bei getrennten Vertragsurkunden spricht grundsätzlich eine tatsächliche Vermutung für die rechtliche Selbstständigkeit der Verträge; besondere Umstände des Einzelfalls können jedoch eine rechtliche Einheit ergeben. Besteht eine rechtliche Einheit, gehen die zwingenden Schutzvorschriften des Wohnraummietrechts vor; eine isolierte ordentliche Beendigung nur der Garage oder des Stellplatzes ist dann nur zulässig, soweit sie rechtlich eröffnet ist. Bleibt dieser Vertrag rechtlich selbstständig, gelten die Regelungen dieses Vertrags.',
        'Ist Garage oder Stellplatz nach der Vereinbarung und den Umständen rechtlich Bestandteil eines einheitlichen Wohnraummietverhältnisses, gehen die dafür geltenden zwingenden wohnraummietrechtlichen Vorschriften vor. Eine in s4v2 gepflegte Hauptvertragsverknüpfung dokumentiert die organisatorische Zuordnung, ersetzt aber nicht die rechtliche Würdigung des Einzelfalls. Bei einem rechtlich selbstständigen Mietverhältnis gelten die allgemeinen Vorschriften über die Miete; soweit keine abweichende wirksame Kündigungsfrist vereinbart ist, richtet sich die ordentliche Kündigung insbesondere nach § 580a BGB.'
            => 'Werden Wohnraum und Garage oder Stellplatz in getrennten Vertragsurkunden vermietet, spricht grundsätzlich eine tatsächliche Vermutung für die rechtliche Selbstständigkeit der Verträge. Besondere Umstände des Einzelfalls können jedoch ergeben, dass beide Vereinbarungen nach dem Parteiwillen eine rechtliche Einheit bilden. In diesem Fall gelten die zwingenden Schutzvorschriften des Wohnraummietrechts; eine isolierte ordentliche Kündigung nur der Garage oder des Stellplatzes ist dann nur zulässig, soweit sie rechtlich eröffnet ist. Bleibt der Vertrag rechtlich selbstständig, gelten die allgemeinen mietrechtlichen Vorschriften; soweit keine wirksame abweichende Kündigungsfrist vereinbart ist, richtet sich die ordentliche Kündigung insbesondere nach § 580a BGB.',
        'Eine Mindestbindung von 0 Monaten bedeutet ausschließlich, dass keine zusätzliche Mindestlaufzeit vereinbart ist. Sie bedeutet nicht automatisch eine ordentliche Kündigung ohne Frist.'
            => 'Das Mietverhältnis wird auf unbestimmte Zeit geschlossen. Soweit eine Mindestbindung ausgewiesen ist, kann das Mietverhältnis während dieses Zeitraums nicht ordentlich beendet werden. Eine ordentliche Kündigung darf jedoch bereits während der Mindestbindung erklärt werden, wenn sie unter Einhaltung der maßgeblichen Kündigungsfrist frühestens zum Ablauf der Mindestbindung wirksam wird. Eine Mindestbindung von 0 Monaten bedeutet lediglich, dass keine zusätzliche Bindungsdauer vereinbart ist; die für die ordentliche Kündigung geltende Frist bleibt davon unberührt.',
        'Bei einem rechtlich selbstständigen, auf unbestimmte Zeit geschlossenen und nach Monaten bemessenen Stellplatzmietverhältnis richtet sich die ordentliche Kündigung, soweit keine wirksame abweichende Vereinbarung getroffen ist, nach § 580a Abs. 1 Nr. 3 BGB. Eine abweichend ausgewiesene Kündigungsfrist gilt nur, soweit sie wirksam vereinbart ist. Das Recht beider Parteien zur außerordentlichen fristlosen Kündigung aus wichtigem Grund nach § 543 BGB bleibt unberührt.'
            => 'Für ein rechtlich selbstständiges Stellplatzmietverhältnis gilt, soweit keine wirksame abweichende Vereinbarung besteht: Wird die Miete nach Monaten oder längeren Zeitabschnitten bemessen, richtet sich die ordentliche Kündigung nach § 580a Abs. 1 Nr. 3 BGB. Danach muss die Kündigung spätestens am dritten Werktag eines Kalendermonats zugehen, damit sie zum Ablauf des übernächsten Monats wirksam wird. Eine im Vertrag abweichend ausgewiesene Kündigungsfrist gilt nur, soweit sie wirksam vereinbart ist. Das Recht beider Parteien zur außerordentlichen fristlosen Kündigung aus wichtigem Grund nach § 543 BGB bleibt unberührt.',
    ];

    /** @param array<string,mixed> $style @return array<string,mixed> */
    public function style(array $style): array
    {
        $style = [
            ...$style,
            'engine' => 'tiptap-fpdf',
            'editorSchemaVersion' => 15,
            'reportWorkspaceVersion' => 15,
            'documentSuiteDesignVersion' => 22,
            'layoutProfile' => 'editor-authoritative-document-suite-v2',
            'pageSize' => 'A4',
            'orientation' => 'portrait',
            'marginLeft' => 20.0,
            'marginRight' => 20.0,
            'marginTop' => 18.0,
            'marginBottom' => 17.0,
            'firstPageBodyTop' => 18.0,
            'continuationBodyTop' => 18.0,
            'fontFamily' => 'Helvetica',
            'fontSize' => 9.5,
            'lineHeight' => 4.35,
            'paragraphGap' => 1.05,
            'emptyParagraphHeight' => 3.2,
            'h1FontSize' => 16.5,
            'h1LineHeight' => 6.3,
            'h1GapBefore' => 0.0,
            'h1GapAfter' => 3.2,
            'h2FontSize' => 10.5,
            'h2LineHeight' => 4.9,
            'h2GapBefore' => 3.2,
            'h2GapAfter' => 1.0,
            'h3FontSize' => 9.6,
            'h3LineHeight' => 4.4,
            'h3GapBefore' => 2.3,
            'h3GapAfter' => 0.8,
            'headingTreatment' => 'editorial',
            'headingTextColor' => '1D2A33',
            'headingAccentColor' => '4E7187',
            'headingRuleColor' => 'D9E3E8',
            'horizontalRuleColor' => 'D9E3E8',
            'horizontalRuleGapBefore' => 1.3,
            'horizontalRuleGapAfter' => 2.1,
            'horizontalRuleLineWidth' => 0.14,
            'tableGap' => 1.8,
            'tableHeaderFill' => 'EEF0F1',
            'tableHeaderTextColor' => '2C353A',
            'tableRowHeaderFill' => 'F7F8F8',
            'tableRowHeaderTextColor' => '4A545A',
            'tableBodyTextColor' => '252C30',
            'tableBorderColor' => 'D9DEE1',
            'tableBorderWidth' => 0.12,
            'tableCellPaddingX' => 2.5,
            'tableCellPaddingY' => 1.8,
            'tableMinRowHeight' => 7.4,
            'tableHeaderTextAlign' => 'L',
            'tableBodyTextAlign' => 'L',
            'tableAlternateRows' => false,
            'tableRowAlternateFill' => 'FFFFFF',
            'footerTextColor' => '6F7A80',
            'headerPreset' => 'none',
            'preserveSourcePageBreaks' => false,
        ];

        foreach ([
            'pageHeaderText', 'pageHeaderAlign', 'pageHeaderFontFamily', 'pageHeaderFontSize',
            'pageFooterText', 'pageFooterAlign', 'pageFooterFontFamily', 'pageFooterFontSize',
            'footerPageNumber', 'footerPageNumberFormat', 'footerPageNumberAlign', 'footerFontSize',
        ] as $legacyChromeKey) {
            unset($style[$legacyChromeKey]);
        }

        return $style;
    }

    /**
     * @param array<int,mixed> $blocks
     * @param array<string,mixed> $style
     * @return array<int,array<string,mixed>>
     */
    public function normalize(array $blocks, string $code, string $name, array $style = []): array
    {
        $removePageBreaks = in_array($code, self::NO_PAGE_BREAK_CODES, true);
        $cleaned = array_values(array_filter(array_map(
            fn (mixed $node): ?array => $this->cleanNode($node, $removePageBreaks),
            $blocks,
        )));

        $format = $this->firstOfType($cleaned, 'documentFormat');
        $header = $this->firstOfType($cleaned, 'pageHeader');
        $footer = $this->firstOfType($cleaned, 'pageFooter');

        $body = array_values(array_filter($cleaned, fn (array $node): bool => ! in_array(
            (string) ($node['type'] ?? ''),
            ['documentFormat', 'pageHeader', 'pageFooter'],
            true,
        )));

        $format = $format ?? ['type' => 'documentFormat', 'attrs' => []];
        $format['attrs'] = [
            ...(is_array($format['attrs'] ?? null) ? $format['attrs'] : []),
            'fontFamily' => (string) ($style['fontFamily'] ?? 'Helvetica'),
            'fontSize' => (float) ($style['fontSize'] ?? 9.5),
        ];

        $header = $header ?? [
            'type' => 'pageHeader',
            'attrs' => [],
            'content' => [['type' => 'text', 'text' => $name]],
        ];
        $header['attrs'] = [
            ...(is_array($header['attrs'] ?? null) ? $header['attrs'] : []),
            'align' => (string) ($header['attrs']['align'] ?? 'right'),
            'fontFamily' => (string) ($header['attrs']['fontFamily'] ?? $style['fontFamily'] ?? 'Helvetica'),
            'fontSize' => (float) ($header['attrs']['fontSize'] ?? 7.2),
        ];
        if (! is_array($header['content'] ?? null)) {
            $header['content'] = [];
        }

        $footer = $footer ?? [
            'type' => 'pageFooter',
            'attrs' => [],
            'content' => [['type' => 'text', 'text' => $name]],
        ];
        $footer['attrs'] = [
            ...(is_array($footer['attrs'] ?? null) ? $footer['attrs'] : []),
            'align' => (string) ($footer['attrs']['align'] ?? 'left'),
            'fontFamily' => (string) ($footer['attrs']['fontFamily'] ?? $style['fontFamily'] ?? 'Helvetica'),
            'fontSize' => (float) ($footer['attrs']['fontSize'] ?? 6.8),
            'pageNumbers' => ($footer['attrs']['pageNumbers'] ?? true) !== false,
            'pageNumberFormat' => (string) ($footer['attrs']['pageNumberFormat'] ?? 'Seite {pageNo} / {pageCount}'),
            'pageNumberAlign' => (string) ($footer['attrs']['pageNumberAlign'] ?? 'right'),
            'pageNumberFontSize' => (float) ($footer['attrs']['pageNumberFontSize'] ?? 6.8),
        ];
        if (! is_array($footer['content'] ?? null)) {
            $footer['content'] = [];
        }

        if (! $this->containsType($body, 'signatureBlock')) {
            $body[] = $this->signatureFor($code);
        }

        return [$format, $header, ...$body, $footer];
    }

    /** @param array<int,array<string,mixed>> $nodes */
    private function containsType(array $nodes, string $type): bool
    {
        foreach ($nodes as $node) {
            if (($node['type'] ?? null) === $type) {
                return true;
            }
        }

        return false;
    }

    /** @param array<int,array<string,mixed>> $nodes */
    private function firstOfType(array $nodes, string $type): ?array
    {
        foreach ($nodes as $node) {
            if (($node['type'] ?? null) === $type) {
                return $node;
            }
        }

        return null;
    }

    private function cleanNode(mixed $node, bool $removePageBreaks): ?array
    {
        if (! is_array($node)) {
            return null;
        }

        if ($removePageBreaks && ($node['type'] ?? null) === 'pageBreak') {
            return null;
        }

        if (($node['type'] ?? null) === 'text' && is_string($node['text'] ?? null)) {
            $text = $node['text'];
            foreach (self::REMOVED_TEXT as $removed) {
                $text = str_replace($removed, '', $text);
            }
            $text = str_replace(array_keys(self::TEXT_REPLACEMENTS), array_values(self::TEXT_REPLACEMENTS), $text);
            if (trim($text) === '') {
                return null;
            }
            $node['text'] = $text;
        }

        if (is_array($node['content'] ?? null)) {
            $node['content'] = array_values(array_filter(array_map(
                fn (mixed $child): ?array => $this->cleanNode($child, $removePageBreaks),
                $node['content'],
            )));
        }

        if (($node['type'] ?? null) === 'table') {
            $node = $this->normalizeTable($node);
        }

        return $node;
    }

    /** @param array<string,mixed> $table @return array<string,mixed> */
    private function normalizeTable(array $table): array
    {
        $rows = is_array($table['content'] ?? null) ? array_values($table['content']) : [];

        if ($this->hasGenericFactsHeader($rows)) {
            array_shift($rows);
            foreach ($rows as &$row) {
                if (! is_array($row) || ($row['type'] ?? null) !== 'tableRow') {
                    continue;
                }
                $cells = is_array($row['content'] ?? null) ? array_values($row['content']) : [];
                foreach ($cells as $cellIndex => &$cell) {
                    if (! is_array($cell) || ! in_array(($cell['type'] ?? null), ['tableCell', 'tableHeader'], true)) {
                        continue;
                    }
                    $cell['type'] = $cellIndex === 0 ? 'tableHeader' : 'tableCell';
                }
                unset($cell);
                $row['content'] = $cells;
            }
            unset($row);
        }

        $keyValueTable = $this->isKeyValueTable($rows);
        foreach ($rows as $rowIndex => &$row) {
            if (! is_array($row) || ($row['type'] ?? null) !== 'tableRow' || ! is_array($row['content'] ?? null)) {
                continue;
            }
            foreach ($row['content'] as $cellIndex => &$cell) {
                if (! is_array($cell) || ! in_array(($cell['type'] ?? null), ['tableCell', 'tableHeader'], true)) {
                    continue;
                }
                $cell['type'] = $keyValueTable
                    ? ($cellIndex === 0 ? 'tableHeader' : 'tableCell')
                    : ($rowIndex === 0 ? 'tableHeader' : 'tableCell');
            }
            unset($cell);
        }
        unset($row);
        $table['content'] = $rows;

        return $table;
    }

    /** @param array<int,mixed> $rows */
    private function hasGenericFactsHeader(array $rows): bool
    {
        if (count($rows) < 2 || ! is_array($rows[0]) || ($rows[0]['type'] ?? null) !== 'tableRow') {
            return false;
        }

        $cells = is_array($rows[0]['content'] ?? null) ? array_values($rows[0]['content']) : [];
        if (count($cells) !== 2) {
            return false;
        }

        foreach ($cells as $cell) {
            if (! is_array($cell) || ($cell['type'] ?? null) !== 'tableHeader') {
                return false;
            }
        }

        $labels = array_map(
            fn (array $cell): string => strtolower(trim($this->cellText($cell))),
            $cells,
        );

        return $labels[0] !== ''
            && $labels[1] !== ''
            && in_array($labels[0], self::GENERIC_FACT_HEADERS, true)
            && in_array($labels[1], self::GENERIC_FACT_HEADERS, true);
    }

    /** @param array<string,mixed> $node */
    private function cellText(array $node): string
    {
        $text = ($node['type'] ?? null) === 'text' ? (string) ($node['text'] ?? '') : '';
        foreach (($node['content'] ?? []) as $child) {
            if (is_array($child)) {
                $text .= $this->cellText($child);
            }
        }

        return $text;
    }

    /** @param array<int,mixed> $rows */
    private function isKeyValueTable(array $rows): bool
    {
        if ($rows === []) {
            return false;
        }

        foreach ($rows as $row) {
            if (! is_array($row) || ($row['type'] ?? null) !== 'tableRow') {
                return false;
            }

            $cells = is_array($row['content'] ?? null) ? array_values($row['content']) : [];
            if (count($cells) < 2 || ! is_array($cells[0]) || ($cells[0]['type'] ?? null) !== 'tableHeader') {
                return false;
            }

            foreach (array_slice($cells, 1) as $cell) {
                if (! is_array($cell) || ($cell['type'] ?? null) !== 'tableCell') {
                    return false;
                }
            }
        }

        return true;
    }

    /** @return array<string,mixed> */
    private function signatureFor(string $code): array
    {
        $attrs = match ($code) {
            'housing-provider-confirmation-residential' => [
                'locationPath' => 'organization.city',
                'datePath' => 'today.date',
                'placeDateLabel' => 'Ort, Datum',
                'leftEnabled' => true,
                'rightEnabled' => false,
                'leftLabel' => 'Unterschrift Wohnungsgeber / beauftragte Person',
                'rightLabel' => '',
                'leftNamePath' => 'organization.signatureName',
                'rightNamePath' => '',
            ],
            'privacy-notice-residential' => [
                'locationPath' => 'organization.city',
                'datePath' => 'today.date',
                'placeDateLabel' => 'Ort, Datum',
                'leftEnabled' => false,
                'rightEnabled' => true,
                'leftLabel' => '',
                'rightLabel' => 'Kenntnisnahme (keine Einwilligung)',
                'leftNamePath' => '',
                'rightNamePath' => 'tenants.signatureNames',
            ],
            default => [
                'locationPath' => 'organization.city',
                'datePath' => 'today.date',
                'placeDateLabel' => 'Ort, Datum',
                'leftEnabled' => true,
                'rightEnabled' => true,
                'leftLabel' => 'Vermieter / Vertretung',
                'rightLabel' => 'Mieter / Mieterin',
                'leftNamePath' => 'organization.signatureName',
                'rightNamePath' => 'tenants.signatureNames',
            ],
        };

        return ['type' => 'signatureBlock', 'attrs' => $attrs];
    }
}
