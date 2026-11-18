<?php

namespace App\Services\Documents;

/**
 * Compact residential house rules intended as a transparent lease attachment.
 * It concretises ordinary use, safety and consideration without silently
 * creating material tenant duties that belong in the lease itself.
 */
final class HouseRulesDocumentBuilder
{
    use BuildsStructuredDocuments;

    /** @return array<int, array<string, mixed>> */
    public function build(): array
    {
        $nbsp = "\u{00A0}";

        return [
            $this->heading(1, 'Hausordnung'),
            $this->paragraph("Anlage zum Mietvertrag{$nbsp}{{ contract.number }}{$nbsp}·{$nbsp}{{ property.fullAddress }}", [['type' => 'bold']]),
            $this->horizontalRule(),
            $this->paragraph('Diese Hausordnung konkretisiert den vertragsgemäßen Gebrauch von Wohnung, Gemeinschaftsflächen und Einrichtungen sowie die gegenseitige Rücksichtnahme. Gesetzliche Rechte und ausdrückliche Mietvertragsregelungen bleiben unberührt; neue wesentliche Leistungspflichten werden hierdurch nicht begründet.'),

            $this->heading(2, '1. Rücksichtnahme und Hausfrieden'),
            $this->paragraph('Vermeidbare Störungen, Gefährdungen, Verschmutzungen und Beschädigungen sind zu unterlassen. Gemeinschaftsflächen und Einrichtungen dürfen nur bestimmungsgemäß genutzt werden. Eigene Verunreinigungen sind unverzüglich zu beseitigen. Mieter haben im zumutbaren Umfang darauf hinzuwirken, dass Haushaltsangehörige und Besucher diese Hausordnung beachten. Aus Gründen der Hygiene und der Schädlingsprävention ist das Füttern von Tauben, Möwen, sonstigen Wildtieren sowie herrenlosen Tieren auf dem gesamten Grundstück, von den Balkonen oder aus den Fenstern heraus ausdrücklich untersagt.'),

            $this->heading(2, '2. Ruhe und Geräusche'),
            $this->paragraph('Für das Haus gelten als Ruhezeiten 22:00 bis 07:00 Uhr sowie 13:00 bis 15:00 Uhr, soweit keine zwingenden örtlichen Vorschriften abweichen. Während dieser Zeiten sind vermeidbare störende Geräusche zu unterlassen; Medien sind auf Zimmerlautstärke zu begrenzen. Bohr-, Hammer- und vergleichbar lärmintensive Arbeiten sind außerhalb der Ruhezeiten und unter Beachtung der Sonn- und Feiertagsvorschriften auszuführen. Türen sind leise zu schließen. Musizieren muss nach Dauer, Lautstärke und Tageszeit nachbarschaftlich verträglich bleiben. Feiern entbinden nicht von den Ruhezeiten. Altersgerechte Geräusche von Kindern gehören grundsätzlich zum Wohnen; Treppenhäuser, Flure und Rettungswege sind jedoch keine dauerhaften Spiel- oder Aufenthaltsflächen.'),

            $this->heading(2, '3. Sicherheit, Türen und Rettungswege'),
            $this->paragraph('Haus- und Hofeingänge, Treppen, Podeste, Flure, Feuerwehrzufahrten sowie Flucht- und Rettungswege sind freizuhalten. Aus Brandschutzgründen und zur Sicherung der Fluchtwege ist das Aufstellen von Schuhschränken, Regalen, Garderoben, Pflanzen, Schirmständern oder ähnlichen privaten Gegenständen im Treppenhaus und auf den Podesten strikt untersagt. Zulässig ist lediglich eine handelsübliche Fußmatte direkt vor der Wohnungstür. Kinderwagen, Rollatoren, Rollstühle und vergleichbare Mobilitätshilfen dürfen nur so abgestellt werden, dass Rettungswege nicht versperrt oder unzulässig verengt und andere nicht unzumutbar behindert werden; vorhandene Abstellflächen haben Vorrang. Fahrräder, Roller, Möbel, Kartons und Abfälle gehören in die vorgesehenen Bereiche.'),
            $this->paragraph('Haus- und Kelleraußentüren sind entsprechend ihrer Schließfunktion geschlossen zu halten und dürfen nicht verkeilt werden; Fluchtmöglichkeiten dürfen nicht beeinträchtigt werden. Brand- und Rauchschutztüren, Feuerlöscher, Melder und Beschilderungen dürfen nicht blockiert, entfernt oder manipuliert werden. Rauchen und offenes Feuer sind in gemeinschaftlichen Innen- und Verkehrsflächen untersagt. Leicht entzündliche oder explosionsgefährliche Stoffe dürfen dort nicht gelagert werden.'),
            $this->paragraph('Der Verlust von Haus- oder Zugangsschlüsseln ist der Vermietung oder Verwaltung unverzüglich mitzuteilen, wenn Sicherheitsinteressen des Hauses betroffen sein können. Eigenmächtige Nachfertigungen von Schlüsseln für die Schließanlage sind unzulässig. Der Mieter haftet bei von ihm verschuldetem Schlüsselverlust für die erforderlichen Kosten des Austauschs von Schlössern oder der Schließanlage, sofern eine Missbrauchsgefahr nicht ausgeschlossen werden kann.'),

            $this->heading(2, '4. Abfall, Sauberkeit und Biotonne'),
            $this->paragraph('Abfälle sind nach den am Objekt geltenden Vorgaben des zuständigen öffentlich-rechtlichen Entsorgungsträgers zu trennen und ausschließlich in den vorgesehenen Behältern zu entsorgen. Kartonagen und Schachteln sind vor dem Einwurf in die Papiertonne zwingend flach zu falten oder zu zerkleinern, um eine Blockade der Behälter zu vermeiden. Sperrmüll, Elektrogeräte, Batterien, Akkus und Problemstoffe dürfen weder neben den Behältern noch in Gemeinschaftsflächen abgestellt werden.'),
            $this->paragraph('Für Objekte im Gebiet des ZAKB gilt insbesondere: In die Biotonne gehören Küchen- und Gartenabfälle einschließlich unverpackter Lebensmittelreste, Knochen und Fischgräten; nicht hinein gehören Kunststoffbeutel – auch keine kompostierbaren oder biologisch abbaubaren –, Glas, Asche, Windeln, Zigarettenkippen, Tabak, Tierkot und sonstige Fremdstoffe. Aus Gründen der Hygiene dürfen Küchenabfälle in gemeinschaftlich genutzten Biotonnen nicht lose, sondern nur in Zeitungspapier oder geeigneten Papiertüten eingeworfen werden. Fleisch-, Fisch- und Käsereste sind vollständig in Papier einzuwickeln. Gartenabfälle dürfen entsprechend den örtlichen Vorgaben lose eingefüllt werden. Der Deckel ist geschlossen zu halten; vom jeweiligen Nutzer verursachte Verschmutzungen an Einwurf, Deckelrand oder Stellplatz sind unverzüglich zu beseitigen. Soweit die Behälterreinigung den Mietern wirksam übertragen ist, ist die Biotonne in warmen Monaten nach der Leerung bei Bedarf mit Wasser zu reinigen; chemische Insektenmittel sind zu vermeiden.'),
            $this->paragraph('Bei erkannten Fremdstoffen kann der ZAKB eine Biotonne mit Roter Karte stehen lassen; dann ist nachzusortieren oder eine kostenpflichtige Sonderentleerung als Restabfall zu veranlassen. Maßgeblich sind die jeweils geltenden Entsorgungs- und Gebührenregelungen. Nachweislich und eindeutig einem Verursacher zuordenbare Mehrkosten bleiben im Rahmen der gesetzlichen und vertraglichen Voraussetzungen erstattungsfähig. Dies gilt auch für Mehrkosten durch unzerkleinerte Kartonagen. Turnusmäßige Reinigungs-, Winterdienst- oder sonstige Leistungspflichten treffen Mieter nur, soweit sie wirksam vereinbart oder übertragen wurden.'),

            $this->heading(2, '5. Wohnung, Lüften, Feuchtigkeit und Schäden'),
            $this->paragraph('Die Wohnung ist so zu nutzen, zu heizen und zu lüften, dass nach den konkreten Nutzungs-, Witterungs- und baulichen Verhältnissen vermeidbare Feuchte-, Frost- und Folgeschäden verhindert werden. Insbesondere nach Duschen, Kochen oder Wäschetrocknen ist erhöhte Feuchtigkeit zeitnah abzuführen; in der Heizperiode ist regelmäßiges kurzes Stoß- oder Querlüften regelmäßig geeigneter als eine dauerhafte Kippstellung. Alle Räume sind angemessen zu temperieren. Auch bei längerer Abwesenheit sind im zumutbaren Umfang Vorkehrungen gegen Frost- und Feuchteschäden zu treffen. Wasch- und Spülmaschinen sind nach den Herstellerangaben mit intakten Zu- und Abläufen sowie vorhandenen Sicherheitseinrichtungen zu betreiben; bei längerer Abwesenheit sollen Wasserzuläufe geschlossen werden, soweit dies technisch möglich und zumutbar ist. Der Betrieb mobiler Klimageräte mit Abluftschlauch darf zu keinen Beschädigungen der Bausubstanz, Fassade oder Fensterelemente führen.'),
            $this->paragraph('Auftretende Mängel und Schäden, insbesondere Undichtigkeiten, auffällige Feuchtigkeit oder Schimmelverdacht, Schädlingsbefall sowie Störungen an Leitungen, Heizung, Elektro-, Sanitär- oder Sicherheitseinrichtungen, sind Vermietung oder Verwaltung unverzüglich anzuzeigen. Vom Mieter, seinen Haushaltsangehörigen oder zurechenbaren Dritten verursachte Schäden am Mietobjekt, an Gemeinschaftsflächen oder an Einrichtungen sind ebenfalls unverzüglich zu melden. Eine Haftung des Mieters richtet sich nach den gesetzlichen Voraussetzungen und setzt insbesondere eine zurechenbare schuldhafte Pflichtverletzung voraus; Veränderungen oder Verschlechterungen durch vertragsgemäßen Gebrauch bleiben außer Betracht. Die Reparatur oder Regulierung erfolgt in Abstimmung mit der Vermietung; eigenmächtige, unfachmännische Reparaturversuche sind zu unterlassen.'),

            $this->heading(2, '6. Balkon, Terrasse, Fassade und Außenbereiche'),
            $this->paragraph('Balkone und Terrassen dürfen im üblichen Wohnrahmen genutzt werden. Gegenstände sind standsicher anzubringen; Gegenstände, Abfälle, Gießwasser oder andere Flüssigkeiten dürfen nicht auf darunterliegende Flächen oder Nachbarbereiche gelangen. Das Herabwerfen von Zigarettenkippen, Asche oder sonstigem Unrat aus Fenstern oder von Balkonen ist strengstens untersagt. Eingriffe in Fassade, Dach, Fenster, Geländer oder andere Gebäudeteile sowie Antennen- oder Satellitenanlagen bedürfen einer Zustimmung, soweit Mietvertrag oder Gesetz dies verlangen.'),
            $this->grillParagraph(),

            $this->heading(2, '7. Tierhaltung'),
            $this->paragraph('Für Tierhaltung gelten Mietvertrag und Gesetz; ein pauschales Verbot jeglicher Tierhaltung wird nicht begründet. Soweit eine Zustimmung erforderlich ist, erfolgt die Entscheidung einzelfallbezogen. Eine erteilte Zustimmung gilt ausschließlich für das konkret genehmigte Tier und ist weder allgemeine Freigabe weiterer Tiere noch Bindung für andere, nicht vergleichbare Fälle. Zustimmungsfrei zulässige Kleintierhaltung bleibt unberührt. Tiere sind in Gemeinschaftsflächen so zu führen und zu beaufsichtigen, dass vermeidbare erhebliche Störungen, Verunreinigungen oder Gefährdungen unterbleiben; Verunreinigungen sind unverzüglich zu beseitigen.'),

            $this->heading(2, '8. Fahrzeuge, technische Anlagen und Notfälle'),
            $this->paragraph('Fahrzeuge und Fahrräder dürfen nur auf vorgesehenen oder vertraglich zugewiesenen Flächen abgestellt werden; Motoren und Audioanlagen sind nicht unnötig laufen zu lassen. Akkus, E-Bikes, E-Scooter und vergleichbare Geräte dürfen in gemeinschaftlichen Flucht- und Rettungswegen weder abgestellt noch geladen werden. Werden große Lithium-Ionen-Akkus innerhalb der Wohnung geladen, hat dies auf einer nicht brennbaren Unterlage und nach Möglichkeit unter Aufsicht zu erfolgen. Beschädigte oder aufgeblähte Akkus dürfen im Gebäude weder gelagert noch geladen werden. Technische Gemeinschaftsanlagen und Zugänge zu Zählern, Absperrungen und Sicherheitseinrichtungen sind bestimmungsgemäß nutzbar und frei zugänglich zu halten. Bei Gasgeruch, Brand, Wasseraustritt oder vergleichbarer akuter Gefahr ist der Gefahrenbereich zu verlassen und der zuständige Not-, Feuerwehr- oder Versorgungsdienst zu verständigen; bei Gasgeruch sind vermeidbare Zünd- und Schaltvorgänge zu unterlassen.'),

            $this->heading(2, '9. Verbindlichkeit und Folgen von Verstößen'),
            $this->paragraph('Diese Hausordnung gilt, soweit sie wirksam in das Mietverhältnis einbezogen wurde. Organisatorische Hinweise der Vermietung oder Verwaltung, insbesondere zu Abfuhrterminen, Behälterzuordnung, Abstellflächen, Zugängen und Sicherheit, sind zu beachten, soweit sie bestehende Pflichten konkretisieren und keine neuen wesentlichen Vertragspflichten begründen. Verstöße sind unverzüglich abzustellen. Gesetzliche und vertragliche Rechte des Vermieters, insbesondere auf Abmahnung, Beseitigung, Unterlassung und Schadensersatz sowie bei Vorliegen der gesetzlichen Voraussetzungen auf Kündigung, bleiben unberührt.'),
        ];
    }

    private function grillParagraph(): array
    {
        return [
            'type' => 'paragraph',
            'content' => [
                ['type' => 'text', 'text' => 'Grillen, Rauchen und vergleichbare Nutzungen sind nur zulässig, soweit Brandschutz, örtliche Vorgaben und die Rechte anderer Bewohner gewahrt bleiben; unzumutbare Rauch-, Geruchs- oder Gefahreneinwirkungen sind zu unterlassen. '],
                ['type' => 'text', 'text' => 'Besondere Bestimmungen zum Grillen:', 'marks' => [['type' => 'bold']]],
                ['type' => 'text', 'text' => ' Das Grillen mit festen Brennstoffen (wie Holzkohle oder Briketts) ist auf den Balkonen, Terrassen und angrenzenden Freiflächen aus Brandschutzgründen strikt untersagt. Die Nutzung von Elektro- oder Gasgrills ist gestattet. Um teure Spannungsrisse oder Hitzeschäden am Glas und der Fassade zu vermeiden, ist beim Betrieb von Elektro- oder Gasgrills zwingend ein '],
                ['type' => 'text', 'text' => 'Sicherheitsabstand von mindestens 0,5 Metern zu allen Glasflächen, Glasgeländern, Trennwänden und der Außenwand/Fassade', 'marks' => [['type' => 'bold']]],
                ['type' => 'text', 'text' => ' einzuhalten.'],
            ],
        ];
    }
}
