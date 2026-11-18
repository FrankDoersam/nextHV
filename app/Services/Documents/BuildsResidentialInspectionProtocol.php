<?php

namespace App\Services\Documents;

/**
 * Shared print-first layout for move-in handover and move-out inspection.
 * Both documents deliberately use the same visual rhythm while remaining separate reports.
 */
trait BuildsResidentialInspectionProtocol
{
    use BuildsStructuredDocuments;

    /** @return array<int, array<string, mixed>> */
    protected function buildInspectionProtocol(bool $moveOut): array
    {
        $title = $moveOut ? 'Wohnungsabnahme bei Auszug' : 'Wohnungsübergabe bei Einzug';
        $phaseIntro = $moveOut
            ? 'Das Formular dokumentiert den bei der gemeinsamen Abnahme sichtbaren Auszugszustand. Zutreffende Zustände werden eingekreist; nur Abweichungen werden kurz beschrieben.'
            : 'Das Formular dokumentiert den bei der gemeinsamen Übergabe sichtbaren Ausgangszustand. Zutreffende Zustände werden eingekreist; nur Abweichungen werden kurz beschrieben.';
        $keyQuantityLabel = $moveOut ? 'Zurückgegeben' : 'Übergeben';

        return [
            $this->heading(1, $title),
            $this->paragraph('Vertrag {{ contract.number }} · {{ property.fullAddress }} · {{ unit.label }}', [['type' => 'bold']]),
            $this->horizontalRule(),
            $this->heading(2, '1 Mietobjekt, Termin und Anwesende'),
            $this->factsTable([
                ['Anschrift', '{{ property.fullAddress }}'],
                ['Einheit', '{{ unit.label }}'],
                ['Anwesend – Mieter', '{{ tenants.signatureNames }}'],
                ['Anwesend – Vermieter / Verwaltung', '{{ inputs.signature.landlord }}'],
            ], 185, 435),
            $this->appointmentTable(),
            $this->paragraph($phaseIntro),
            $this->paragraph('„Ohne erkennbare Mängel“ beschreibt ausschließlich den beim Termin sichtbaren Zustand. Normale Abnutzung durch vertragsgemäßen Gebrauch ist kein Schaden.'),
            $this->heading(2, '2 Zustand der Wohnung'),
            $this->paragraph('Je Raum einen Zustand einkreisen. Die rechte Spalte ist bewusst groß gehalten: dort nur die konkrete Stelle, Art der Abweichung und gegebenenfalls die Foto-Nummer eintragen.'),
            $this->conditionTable(['Wohn- / Essbereich', 'Schlafzimmer', 'Küche', 'Bad / WC', 'Flur / Diele', 'Balkon / Terrasse', 'Keller / Nebenraum', 'Weiterer Raum / Bereich 1', 'Weiterer Raum / Bereich 2']),
            $this->heading(3, 'Wände, Tapeten und Anstrich'),
            $this->finishTable($moveOut),
            $this->paragraph('Bei Abweichungen können insbesondere Flecken, Streifen, sichtbare Ansätze oder Läufer, Verschmierungen, Farbspritzer, offene Tapetennähte, Blasen oder Beschädigungen kurz mit Raum und Foto-Nummer beschrieben werden.'),
            $this->heading(2, '3 Schlüssel und Zähler'),
            $this->heading(3, 'Schlüssel und Zugangsmittel'),
            $this->relationTable('keys', 'Schlüsselbestand', [
                ['key' => 'label', 'label' => 'Bezeichnung'], ['key' => 'quantityTotal', 'label' => 'Bestand'],
                ['key' => 'handoverQuantity', 'label' => $keyQuantityLabel], ['key' => 'handoverNote', 'label' => 'Bemerkung'],
            ], 4),
            $this->heading(3, 'Zählerstände'),
            $this->paragraph('Zähler gemeinsam ablesen. Der Stand wird direkt in die freie Tabellenzelle geschrieben; die Einheit ist bereits separat angegeben.'),
            $this->relationTable('meters', 'Zähler', [
                ['key' => 'typeLabel', 'label' => 'Art'], ['key' => 'number', 'label' => 'Zählernummer'], ['key' => '', 'label' => 'Stand'], ['key' => 'unit', 'label' => 'Einheit'],
            ], 4),
            $this->heading(2, '4 Bemerkungen, Fotos und Bestätigung'),
            $this->paragraph('Hier ist Platz für alles, was in Abschnitt 2 oder 3 nicht ausreichend beschrieben werden konnte. Die bloße Aufnahme einer Feststellung stellt kein Schuldanerkenntnis dar.'),
            $this->remarksTable(5),
            $this->paragraph('Mit ihrer Unterschrift bestätigen die Beteiligten ausschließlich die vorstehend gemeinsam dokumentierten tatsächlichen Feststellungen zum Termin. Gesetzliche und vertragliche Rechte sowie verdeckte oder beim Termin nicht erkennbare Umstände bleiben unberührt.'),
            $this->signatureBlock('Unterschrift Vermieter / Vertretung', 'Unterschrift Mieter / Mieterin'),
        ];
    }

    private function appointmentTable(): array
    {
        return ['type' => 'table', 'content' => [
            ['type' => 'tableRow', 'content' => [
                $this->tableCell('tableHeader', 'Datum', [115]), $this->tableCell('tableHeader', 'Uhrzeit', [95]), $this->tableCell('tableHeader', 'Weitere anwesende Personen / Vertretungen', [410]),
            ]],
            ['type' => 'tableRow', 'content' => [$this->blankWritableCell(115, 2), $this->blankWritableCell(95, 2), $this->blankWritableCell(410, 2)]],
        ]];
    }

    /** @param array<int, string> $areas */
    private function conditionTable(array $areas): array
    {
        $content = [['type' => 'tableRow', 'content' => [
            $this->tableCell('tableHeader', 'Raum / Bereich', [130]),
            $this->tableCell('tableHeader', 'Zustand – Zutreffendes einkreisen', [175]),
            $this->tableCell('tableHeader', 'Bemerkung / genaue Stelle / Foto', [315]),
        ]]];
        foreach ($areas as $area) {
            $content[] = ['type' => 'tableRow', 'content' => [
                $this->tableCell('tableHeader', $area, [130]),
                $this->tableCell('tableCell', "ohne erkennbare Mängel\nübliche Gebrauchsspuren\nMangel / Schaden", [175]),
                $this->blankWritableCell(315, 3),
            ]];
        }
        return ['type' => 'table', 'content' => $content];
    }

    private function finishTable(bool $moveOut): array
    {
        $rows = $moveOut ? [
            ['Wände / Decken / Tapeten', "ohne erkennbare Mängel\nübliche Gebrauchsspuren\nMangel / Beschädigung"],
            ['Farbgestaltung', "weiß / hell-neutral\nkräftig / dunkel / mehrfarbig\nsonstig abweichend"],
            ['Maler- / Tapezierarbeit', "gleichmäßig / deckend / sauber\nFlecken / Streifen / Ansätze\nLäufer / Verschmierung / Farbspritzer"],
        ] : [
            ['Wände / Decken / Tapeten', "frisch renoviert / tapeziert\nübliche Gebrauchsspuren\nrenovierungsbedürftig"],
            ['Farbgestaltung', "weiß / hell-neutral\nabweichender Farbton\nuneinheitlich / fleckig"],
            ['Maler- / Tapezierarbeit', "gleichmäßig / deckend / sauber\nleichte Gebrauchsspuren\nAusführungsmängel"],
        ];
        $content = [['type' => 'tableRow', 'content' => [
            $this->tableCell('tableHeader', 'Merkmal', [155]),
            $this->tableCell('tableHeader', 'Zustand – Zutreffendes einkreisen', [200]),
            $this->tableCell('tableHeader', 'Bemerkung / genaue Stelle / Foto', [265]),
        ]]];
        foreach ($rows as [$label, $status]) {
            $content[] = ['type' => 'tableRow', 'content' => [
                $this->tableCell('tableHeader', $label, [155]), $this->tableCell('tableCell', $status, [200]), $this->blankWritableCell(265, 3),
            ]];
        }
        return ['type' => 'table', 'content' => $content];
    }

    private function remarksTable(int $rows): array
    {
        $content = [['type' => 'tableRow', 'content' => [
            $this->tableCell('tableHeader', 'Bereich / Bauteil', [150]),
            $this->tableCell('tableHeader', 'Bemerkung / Feststellung / ggf. Maßnahme', [390]),
            $this->tableCell('tableHeader', 'Foto-Nr.', [80]),
        ]]];
        for ($index = 0; $index < $rows; $index++) {
            $content[] = ['type' => 'tableRow', 'content' => [$this->blankWritableCell(150, 3), $this->blankWritableCell(390, 3), $this->blankWritableCell(80, 3)]];
        }
        return ['type' => 'table', 'content' => $content];
    }

    private function blankWritableCell(int $width, int $lines): array
    {
        return $this->tableCell('tableCell', implode("\n", array_fill(0, max(1, $lines), "\u{00A0}")), [$width]);
    }
}
