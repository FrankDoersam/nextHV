<?php

namespace App\Services\Documents;

final class DocumentTemplateDefinitionAuditor
{
    private const HOUSE_RULES_APPLICABILITY = 'Regelungen dieser Hausordnung zu Hausmeister, Aufzug, Garagen, Stellplätzen, Müllplätzen, Gemeinschaftsräumen oder sonstigen Einrichtungen gelten jeweils nur, soweit die betreffende Einrichtung beim Objekt tatsächlich vorhanden, vorgesehen oder zur Nutzung überlassen ist. Aus der bloßen Nennung in dieser Hausordnung folgt keine Beschaffenheits- oder Ausstattungszusage.';

    private readonly DocumentSuiteDesign $design;

    public function __construct(?DocumentSuiteDesign $design = null)
    {
        $this->design = $design ?? new DocumentSuiteDesign();
    }

    /** @return array<string, mixed> */
    public function audit(array $definition): array
    {
        $definition = match ((string) ($definition['code'] ?? '')) {
            'handover-protocol-residential-source' => $this->handover($definition),
            'house-rules-residential' => $this->houseRules($definition),
            'privacy-notice-residential' => $this->privacy($definition),
            'housing-provider-confirmation-residential' => $this->housingProviderConfirmation($definition),
            default => $definition,
        };

        $code = (string) ($definition['code'] ?? '');
        $documentType = (string) ($definition['documentType'] ?? '');
        $definition['style'] = $this->design->styleFor(
            is_array($definition['style'] ?? null) ? $definition['style'] : [],
            $code,
            $documentType,
        );

        if (is_array($definition['editorBlocks'] ?? null)) {
            $definition['editorBlocks'] = $this->design->upgradeBlocks($definition['editorBlocks'], $code);
        }

        return $definition;
    }

    /** @return array<string, mixed> */
    private function handover(array $definition): array
    {
        $definition['name'] = 'Übergabe- und Zustandsprotokoll';
        $definition['title'] = 'Übergabe- und Zustandsprotokoll';
        $definition['subtitle'] = null;
        $definition['description'] = 'Beweissicheres Übergabe- und Rückgabeprotokoll mit Parteien, Objekt, Anlass, Schlüsselbestand, raumbezogenen Zustandsfeststellungen, Mängeln, Fotos, Zählererfassung und Unterschriften.';

        $replacements = [
            'Für Notfälle hat der Vermieter einen Schlüssel für die Einheit zurückbehalten.' => 'Ein beim Vermieter verbleibender Schlüssel wird nur berücksichtigt, wenn dies gesondert vereinbart und im Schlüsselbestand dieses Protokolls ausdrücklich dokumentiert ist.',
            'Die Verpflichtungen des Mieters zur Ausführung von Schönheitsreparaturen und Reinigungsarbeiten ergeben sich aus den im Mietvertrag getroffenen Vereinbarungen. Die notwendigen Arbeiten sind bei Beendigung des Mietverhältnisses unmittelbar vor der Rückgabe des Mietobjekts an den Vermieter auszuführen.' => 'Ob und in welchem Umfang Schönheitsreparaturen oder Reinigungsarbeiten geschuldet sind, richtet sich ausschließlich nach den wirksamen Vereinbarungen des Mietvertrags sowie dem dokumentierten Anfangs- und Rückgabezustand. Dieses Protokoll begründet keine darüber hinausgehende Renovierungs- oder Endrenovierungspflicht.',
            "Zusätzlich dazu muss die Wohnung bei Übergabe gereinigt sein und sich in dem gleichen makellosen Zustand befinden, wie sie bei der Übergabe vorgefunden wurde (siehe Kriterien im Abschnitt 'Zustand bei der Besichtigung'). Beim Einzug, insbesondere beim Transport von Möbeln, ist darauf zu achten, dass mögliche Beschädigungen an Haustür, Treppenhaus und Fahrstuhl vermieden werden. Sollten dennoch Schäden auftreten, ist dies unverzüglich zu melden. Die Beseitigung dieser Schäden erfolgt auf Kosten des Mieters oder Verursachers durch den Vermieter." => 'Bei Rückgabe ist das Mietobjekt in dem nach Mietvertrag geschuldeten Zustand und gereinigt zu übergeben. Veränderungen oder Verschlechterungen durch den vertragsgemäßen Gebrauch bleiben außer Betracht. Schäden, die während Ein- oder Auszug insbesondere an Haustür, Treppenhaus, Aufzug oder sonstigen Gebäudeteilen verursacht werden, sind unverzüglich zu melden; eine Kostentragung richtet sich nach der gesetzlichen beziehungsweise wirksam vereinbarten Verantwortlichkeit.',
            "Sollte der Mieter Wände farblich gestaltet haben oder Löcher gebohrt haben, ist er verpflichtet, diese bei Auszug wieder in ihren ursprünglichen Zustand zu versetzen. Dabei ist die Farbe 'Alpinweiß' in mattem Finish als Standard vorgegeben. Angrenzende Bauteile wie Fußleisten usw. sind entsprechend zu schützen." => 'Farbgestaltungen, Bohrlöcher oder sonstige Veränderungen sind bei Rückgabe nur insoweit zu beseitigen oder zurückzubauen, wie dies nach den wirksamen Vereinbarungen des Mietvertrags oder wegen einer vom Mieter zu vertretenden Beschädigung geschuldet ist. Eine starre Farb- oder Endrenovierungsvorgabe wird durch dieses Protokoll nicht begründet.',
            'Sollten einzelne individuelle Vereinbarungen den Reglungen im vorformulierten Mietvertrag widersprechen, so gelten die hier nach individueller Absprache getroffenen Vereinbarungen.' => 'Individuell ausgehandelte und von beiden Parteien bestätigte Vereinbarungen gehen entgegenstehenden vorformulierten Regelungen vor. Reine Zustandsfeststellungen in diesem Protokoll ändern die vertraglichen Rechte und Pflichten dagegen nicht.',
        ];

        if (is_array($definition['editorBlocks'] ?? null)) {
            $blocks = $this->replaceText($definition['editorBlocks'], $replacements);
            // Historical source pagination is not part of the editable protocol.
            $definition['editorBlocks'] = $this->removeNodesByType($blocks, 'pageBreak');
        }

        return $definition;
    }

    /** @return array<string, mixed> */
    private function houseRules(array $definition): array
    {
        $definition['name'] = 'Hausordnung';
        $definition['title'] = 'Hausordnung';
        $definition['subtitle'] = null;
        $definition['description'] = 'Klare Vertragsanlage für ein sicheres und rücksichtsvolles Zusammenleben; objektabhängige Regeln gelten nur, soweit die jeweilige Einrichtung tatsächlich vorhanden oder wirksam einbezogen ist.';

        if (! is_array($definition['editorBlocks'] ?? null)) return $definition;

        $blocks = $this->replaceText($definition['editorBlocks'], [
            'Hausmeister und Verwaltung sind Ansprechpartner für den ordnungsgemäßen Betrieb der Gemeinschaftsanlagen und können auf die Einhaltung dieser Hausordnung sowie bestehender Sicherheits- und Nutzungsregeln hinweisen. Ihre Zuständigkeit richtet sich nach dem jeweiligen Auftrag; private Dienstleistungen für einzelne Haushalte sind hiervon nicht umfasst.' => 'Soweit für das Objekt ein Hausmeister oder eine Verwaltung eingesetzt ist, sind diese im Rahmen ihrer jeweils übertragenen Aufgaben Ansprechpartner für den ordnungsgemäßen Betrieb der Gemeinschaftsanlagen und können auf die Einhaltung dieser Hausordnung sowie bestehender Sicherheits- und Nutzungsregeln hinweisen. Private Dienstleistungen für einzelne Haushalte sind hiervon nicht umfasst.',
            'Als besondere Ruhezeiten gelten – soweit keine abweichenden örtlichen Vorschriften oder wirksam vereinbarten Regelungen vorgehen – 13:00 bis 15:00 Uhr sowie 22:00 bis 07:00 Uhr.' => 'Gesetzliche, behördliche und örtliche Ruhezeiten sind einzuhalten. Unabhängig davon ist insbesondere während der Nachtzeit besondere Rücksicht zu nehmen. Eine zusätzliche Mittagsruhe gilt nur, soweit sie örtlich vorgeschrieben oder für das Objekt wirksam vereinbart ist.',
            'Wäsche darf im üblichen Rahmen getrocknet werden. Dabei sind Gefahren, herabtropfendes Wasser und erhebliche Beeinträchtigungen des äußeren Erscheinungsbildes zu vermeiden.' => 'Wäsche darf im üblichen Rahmen getrocknet werden. Dabei sind Gefahren, herabtropfendes Wasser und konkrete Beeinträchtigungen anderer Bewohner oder Gemeinschaftsflächen zu vermeiden.',
        ]);

        if (! $this->containsText($blocks, self::HOUSE_RULES_APPLICABILITY)) {
            array_splice($blocks, min(2, count($blocks)), 0, [[
                'type' => 'paragraph',
                'content' => [
                    ['type' => 'text', 'text' => 'Geltungsbereich. ', 'marks' => [['type' => 'bold']]],
                    ['type' => 'text', 'text' => self::HOUSE_RULES_APPLICABILITY],
                ],
            ]]);
        }

        $definition['editorBlocks'] = $blocks;
        return $definition;
    }

    /** @return array<string, mixed> */
    private function privacy(array $definition): array
    {
        $definition['name'] = 'Datenschutzhinweise Mietverhältnis';
        $definition['title'] = 'Datenschutzhinweise zum Mietverhältnis';
        $definition['subtitle'] = null;
        $definition['description'] = 'Datenschutzhinweise nach Art. 13 DSGVO als klar strukturiertes Informationsblatt; eine optionale Unterschrift bestätigt ausschließlich den Erhalt und ist keine Einwilligung.';

        if (! is_array($definition['editorBlocks'] ?? null)) return $definition;

        $blocks = $this->replaceText($definition['editorBlocks'], [
            'Soweit personenbezogene Daten nicht unmittelbar bei Ihnen erhoben werden, erfüllen wir die zusätzlichen Informationspflichten nach Art. 14 DSGVO. Beabsichtigen wir eine Weiterverarbeitung für einen anderen Zweck als denjenigen, für den die Daten erhoben wurden, informieren wir vorab über den neuen Zweck und die gesetzlich erforderlichen weiteren Angaben.' => 'Soweit personenbezogene Daten nicht unmittelbar bei Ihnen erhoben werden, erhalten Sie die nach Art. 14 DSGVO erforderlichen Informationen grundsätzlich gesondert. Beabsichtigen wir eine Weiterverarbeitung für einen anderen Zweck als denjenigen, für den die Daten erhoben wurden, informieren wir vorab über den neuen Zweck und die gesetzlich erforderlichen weiteren Angaben.',
        ]);

        $definition['editorBlocks'] = $this->replaceParagraphContainingVariable(
            $blocks,
            'organization.privacyContact',
            [
                'type' => 'paragraph',
                'content' => [[
                    'type' => 'text',
                    'text' => 'Datenschutzanfragen können über die oben genannten Kontaktdaten gestellt werden. Soweit ein Datenschutzbeauftragter bestellt ist, werden dessen Kontaktdaten gesondert mitgeteilt.',
                ]],
            ],
        );

        return $definition;
    }

    /** @return array<string, mixed> */
    private function housingProviderConfirmation(array $definition): array
    {
        $style = is_array($definition['style'] ?? null) ? $definition['style'] : [];
        $definition['style'] = [
            ...$style,
            'officialForm' => false,
            'officialFormLockedGeometry' => false,
            'officialFormBackgroundImage' => false,
        ];
        return $definition;
    }

    /** @param array<string, string> $replacements */
    private function replaceText(array $value, array $replacements): array
    {
        foreach ($value as $key => $child) {
            if ($key === 'text' && is_string($child) && array_key_exists($child, $replacements)) {
                $value[$key] = $replacements[$child];
                continue;
            }
            if (is_array($child)) $value[$key] = $this->replaceText($child, $replacements);
        }
        return $value;
    }

    private function replaceParagraphContainingVariable(array $blocks, string $path, array $replacement): array
    {
        foreach ($blocks as $index => $node) {
            if (! is_array($node)) continue;
            if (($node['type'] ?? null) === 'paragraph' && $this->containsVariable($node, $path)) {
                $blocks[$index] = $replacement;
            }
        }
        return $blocks;
    }

    private function removeNodesByType(array $nodes, string $type): array
    {
        $result = [];
        foreach ($nodes as $node) {
            if (! is_array($node)) continue;
            if (($node['type'] ?? null) === $type) continue;
            if (is_array($node['content'] ?? null)) $node['content'] = $this->removeNodesByType($node['content'], $type);
            $result[] = $node;
        }
        return $result;
    }

    private function containsVariable(array $value, string $path): bool
    {
        if (($value['type'] ?? null) === 'variable' && (string) data_get($value, 'attrs.path', '') === $path) return true;
        foreach ($value as $child) {
            if (is_array($child) && $this->containsVariable($child, $path)) return true;
        }
        return false;
    }

    private function containsText(array $value, string $needle): bool
    {
        foreach ($value as $key => $child) {
            if ($key === 'text' && $child === $needle) return true;
            if (is_array($child) && $this->containsText($child, $needle)) return true;
        }
        return false;
    }
}
