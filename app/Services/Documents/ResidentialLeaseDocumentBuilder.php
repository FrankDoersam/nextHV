<?php

namespace App\Services\Documents;

/**
 * Canonical editor-first residential lease for the 2026 legal baseline.
 * The master states the actual agreement and leaves page geometry to Canvas Editor.
 */
final class ResidentialLeaseDocumentBuilder
{
    use BuildsStructuredDocuments;

    /** @return array<int, array<string, mixed>> */
    public function build(): array
    {
        return [
            $this->heading(1, 'Mietvertrag über Wohnraum'),
            $this->paragraph('Vertrag {{ contract.number }}', [['type' => 'bold']]),
            $this->horizontalRule(),
            $this->partyTable('Vermieter', "{{ organization.signatureName }}\n{{ organization.address }}", 'Mieter', '{{ tenants.all }}'),
            $this->paragraph('Zwischen den vorstehend bezeichneten Parteien wird folgender Mietvertrag geschlossen.'),
            $this->heading(2, '§ 1 Mietsache'),
            $this->factsTable([
                ['Anschrift', '{{ property.fullAddress }}'], ['Einheit', '{{ unit.label }}'], ['Wohnfläche', '{{ unit.livingArea }}'],
                ['Raumaufteilung', '{{ unit.roomSummary }}'], ['Nebenräume / Zubehör', '{{ unit.leaseAncillarySpacesLabel }}'], ['Gemeinschaftliche Mitbenutzung', '{{ property.sharedUseAreasLabel }}'],
            ]),
            $this->paragraph('Vermietet wird die vorstehend bezeichnete Wohnung einschließlich der ausdrücklich aufgeführten Nebenräume und Nutzungsrechte. Der Mitgebrauch gemeinschaftlicher Bereiche richtet sich nach ihrer Zweckbestimmung, der Hausordnung und den konkret eingeräumten Nutzungsrechten. Nicht ausdrücklich als mitvermietet bezeichnete Flächen werden nicht zur alleinigen Nutzung überlassen.'),
            $this->paragraph('Die angegebene Wohnfläche ist die dem Vertrag zugrunde gelegte Flächenangabe. Gesetzliche Rechte bei einer erheblichen Flächenabweichung bleiben unberührt. Der bei Übergabe dokumentierte tatsächliche Zustand der Mietsache ergibt sich ergänzend aus dem Übergabeprotokoll; das Protokoll begründet ohne ausdrückliche Vereinbarung keine über den Vertrag hinausgehende Beschaffenheitsgarantie.'),
            $this->heading(2, '§ 2 Nutzung und Gebrauchsüberlassung'),
            $this->paragraph('Die Mietsache wird zu Wohnzwecken vermietet. Eine übliche berufliche Tätigkeit im Homeoffice ohne störende Außenwirkung ist zulässig. Eine darüber hinausgehende gewerbliche oder sonstige Nutzung bedarf der vorherigen Zustimmung des Vermieters, soweit kein gesetzlicher Anspruch besteht.'),
            $this->paragraph('Die vollständige oder teilweise Überlassung an Dritte bedarf der Zustimmung des Vermieters. Gesetzliche Ansprüche des Mieters, insbesondere nach § 553 BGB, bleiben unberührt. Eine erlaubte Gebrauchsüberlassung entbindet den Mieter nicht von seinen vertraglichen Pflichten und seiner gesetzlichen Verantwortlichkeit für zurechenbares Verhalten Dritter.'),
            $this->paragraph('Treppenräume, Flure sowie Flucht- und Rettungswege sind freizuhalten. Gegenstände dürfen in Gemeinschaftsbereichen nur dort abgestellt werden, wo dies vorgesehen und sicher zulässig ist.'),
            $this->heading(2, '§ 3 Mietzeit, Mindestbindung und Kündigung'),
            $this->factsTable([
                ['Vertragsbeginn', '{{ contract.startsOn }}'],
                ['Laufzeit', '{{ contract.termTypeLabel }}'],
                ['Mindestlaufzeit / Kündigungsverzicht', '{{ contract.minimumMonths }} Monate'],
                ['Befristet bis', '{{ contract.fixedUntil }}'],
            ]),
            $this->paragraph('Bei einer ausgewiesenen Mindestlaufzeit von mehr als 0 Monaten vereinbaren die Parteien für diesen Zeitraum einen wechselseitigen Ausschluss der ordentlichen Kündigung; dadurch wird kein Zeitmietvertrag begründet. Die ordentliche Kündigung darf bereits so rechtzeitig erklärt werden, dass sie unter Einhaltung der gesetzlichen Kündigungsfrist zum Ablauf der wirksamen Mindestbindung wirksam wird. Ein formularmäßiger Kündigungsverzicht des Mieters ist auf höchstens vier Jahre ab Vertragsschluss begrenzt. Soweit eine hinterlegte Mindestlaufzeit rechnerisch darüber hinausreichen würde, gilt der ordentliche Kündigungsverzicht nur bis zur rechtlich zulässigen Höchstgrenze. Das Recht beider Parteien zur außerordentlichen Kündigung aus wichtigem Grund sowie zwingende Sonderkündigungsrechte bleiben unberührt.'),
            $this->paragraph('Nach Ablauf einer wirksamen Mindestbindung kann der Mieter ordentlich nach § 573c Abs. 1 BGB kündigen. Für eine ordentliche Kündigung durch den Vermieter gelten insbesondere die Voraussetzungen des § 573 BGB und die gesetzlichen Kündigungsfristen des § 573c BGB. Eine Kündigung zum Zweck der Mieterhöhung wird nicht vereinbart.'),
            $this->paragraph('Ist als Laufzeit „befristet“ vereinbart, endet das Mietverhältnis nur dann zum angegebenen Zeitpunkt, wenn die gesetzlichen Voraussetzungen eines Zeitmietvertrags nach § 575 BGB erfüllt sind und der gesetzlich erforderliche Befristungsgrund bei Vertragsschluss mitgeteilt wurde. Andernfalls gelten die gesetzlichen Folgen einer unwirksamen Befristung.'),
            $this->heading(2, '§ 4 Miete'),
            $this->factsTable([
                ['Grundmiete monatlich', '{{ rent.base }}'], ['Betriebskostenvorauszahlung', '{{ rent.operatingAdvance }}'], ['Heizkostenvorauszahlung', '{{ rent.heatingAdvance }}'], ['Gesamtmiete monatlich', '{{ rent.total }}', true],
            ]),
            $this->paragraph('Änderungen der Miete und der Vorauszahlungen sind nur nach Maßgabe einer wirksamen Vereinbarung oder der gesetzlichen Vorschriften zulässig.'),
            $this->paragraph('Soweit die Vorschriften über die zulässige Miethöhe bei Mietbeginn anwendbar sind, gelten §§ 556d bis 556g BGB. Beruft sich der Vermieter auf eine gesetzliche Ausnahme oder eine berücksichtigungsfähige Vormiete, werden die dafür gesetzlich erforderlichen Informationen vor Abgabe der Vertragserklärung in Textform mitgeteilt.'),
            $this->heading(2, '§ 5 Zahlung und Fälligkeit'),
            $this->paragraph('Die monatliche Gesamtmiete ist im Voraus, spätestens bis zum dritten Werktag eines Kalendermonats, zu zahlen. Für die Rechtzeitigkeit gelten die gesetzlichen Bestimmungen.'),
            $this->factsTable([
                ['Kontoinhaber', '{{ bank.accountHolder }}'], ['IBAN', '{{ bank.iban }}'], ['Verwendungszweck', 'Vertrag {{ contract.number }}'],
            ]),
            $this->paragraph('Änderungen der Bankverbindung teilt der Vermieter in Textform mit.'),
            $this->heading(2, '§ 6 Mietänderungen'),
            $this->paragraph('Soweit keine Staffel- oder Indexmiete vereinbart ist, richten sich Mieterhöhungen sowie Änderungen von Betriebs- und Heizkostenvorauszahlungen nach den jeweils anwendbaren gesetzlichen Vorschriften.'),
            $this->heading(2, '§ 7 Staffelmiete'),
            $this->paragraph('Die vereinbarten Mietstaffeln werden aus den Vertragskonditionen erzeugt.'),
            $this->heading(2, '§ 8 Indexmiete'),
            $this->paragraph('Die Indexmietvereinbarung wird aus dem gewählten Mietanpassungsmodell erzeugt.'),
            $this->heading(2, '§ 9 Betriebskosten'),
            $this->paragraph('Der Mieter trägt die Betriebskosten im Sinne von § 2 Betriebskostenverordnung, soweit sie für das Objekt tatsächlich entstehen und nicht unmittelbar vom Mieter getragen werden. Sonstige Betriebskosten im Sinne von § 2 Nr. 17 BetrKV werden nur geschuldet, wenn sie konkret vereinbart sind.'),
            $this->paragraph('Über vereinbarte Betriebskostenvorauszahlungen wird jährlich nach den gesetzlichen Vorschriften abgerechnet. Für Abrechnungszeitraum, Abrechnungsfrist, Wirtschaftlichkeitsgebot und Anpassung der Vorauszahlungen gelten insbesondere §§ 556 und 560 BGB.'),
            $this->paragraph('Die Verteilung richtet sich nach dem gesetzlich oder wirksam vertraglich maßgeblichen Umlageschlüssel. Soweit nichts anderes wirksam vereinbart ist, gilt § 556a BGB; verbrauchs- oder verursachungsabhängige Kosten werden nach dem erfassten Verbrauch beziehungsweise der erfassten Verursachung verteilt.'),
            $this->heading(2, '§ 10 Heiz- und Warmwasserkosten'),
            $this->paragraph('Soweit die Heizkostenverordnung anwendbar ist, werden Heiz- und Warmwasserkosten nach deren jeweils geltenden Vorgaben verbrauchsabhängig verteilt. Die gesetzliche Aufteilung von Kohlendioxidkosten zwischen Vermieter und Mieter nach dem CO₂-Kostenaufteilungsgesetz bleibt unberührt.'),
            $this->heading(2, '§ 11 Einzelheizung'),
            $this->paragraph('Soweit die Einheit über eine vom Mieter unmittelbar betriebene oder auf eigene Rechnung versorgte Einzelheizung verfügt und die entsprechenden Kosten nicht über den Vermieter abgerechnet werden, trägt der Mieter die hierfür unmittelbar anfallenden Liefer- und Betriebskosten selbst. Gesetzliche Erstattungs- und Aufteilungsansprüche, insbesondere zu Kohlendioxidkosten, bleiben unberührt.'),
            $this->heading(2, '§ 12 Mietsicherheit'),
            $this->factsTable([
                ['Vereinbarte Mietsicherheit', '{{ deposit.amount }}'],
                ['Mietbeginn / früheste Fälligkeit der 1. Rate', '{{ contract.startsOn }}'],
            ]),
            $this->paragraph('Soweit eine Geldkaution vereinbart ist, darf sie nach § 551 BGB höchstens drei monatliche Nettokaltmieten betragen. Der Mieter ist unabhängig von einer abweichenden internen Zahlungsplanung berechtigt, die Geldkaution in drei gleichen monatlichen Teilzahlungen zu leisten. Die erste Teilzahlung ist zu Beginn des Mietverhältnisses fällig; die beiden weiteren Teilzahlungen werden zusammen mit den unmittelbar folgenden Mietzahlungen fällig. Eine frühere Gesamtfälligkeit wird nicht vereinbart. Eine für den Mieter günstigere Vereinbarung, insbesondere zusätzliche Teilzahlungen oder ein späterer Fälligkeitstermin, bleibt zulässig.'),
            $this->paragraph('Eine vom Vermieter erhaltene Geldkaution wird nach den gesetzlichen Vorgaben getrennt vom Vermögen des Vermieters angelegt. Nach Beendigung des Mietverhältnisses wird die Mietsicherheit nach Ablauf einer angemessenen Prüfungs- und Abrechnungsfrist zurückgewährt, soweit keine gesicherten Ansprüche entgegenstehen. Für noch nicht abrechenbare Betriebskosten darf ein angemessener Teil bis zur Abrechnung zurückbehalten werden.'),
            $this->heading(2, '§ 13 Übergabe und Schlüssel'),
            $this->paragraph('Art und Anzahl der bei Übergabe ausgehändigten Schlüssel sowie der tatsächliche Zustand der Wohnung werden im Übergabeprotokoll dokumentiert. Wird die Wohnung bei Mietbeginn tatsächlich frisch tapeziert und mit einem weißen oder sonstigen hell-neutralen, gleichmäßig deckenden Anstrich ohne erkennbare Farbverschmutzungen übergeben, soll dieser Ausgangszustand im Protokoll ausdrücklich festgehalten werden; erkennbare Abweichungen sind raum- und stellenbezogen zu dokumentieren.'),
            $this->paragraph('Die Zustandsdokumentation dient der Beweissicherung. Aus der bloßen Feststellung eines renovierten oder weißen Ausgangszustands folgt keine starre Pflicht zur Endrenovierung unabhängig vom tatsächlichen Zustand. Rückgabe-, Wiederherstellungs- und Schadensersatzpflichten richten sich nach diesem Vertrag und den gesetzlichen Vorschriften.'),
            $this->paragraph('Zusätzliche Schlüssel für Schließ- oder Sicherheitssysteme sind vor der Anfertigung mit dem Vermieter abzustimmen. Der Verlust eines Schlüssels ist unverzüglich mitzuteilen. Ein Kostenersatz für Ersatzschlüssel, Schlösser oder eine Schließanlage richtet sich nach den gesetzlichen Schadensersatzvoraussetzungen und setzt insbesondere Verantwortlichkeit, Erforderlichkeit und eine tatsächlich veranlasste Sicherheitsmaßnahme voraus.'),
            $this->heading(2, '§ 14 Obhut, Mängel und Schäden'),
            $this->paragraph('Der Mieter behandelt die Mietsache, mitvermietete Einrichtungen und Gemeinschaftseinrichtungen pfleglich und sorgt für ein den tatsächlichen Verhältnissen angemessenes Heizen und Lüften. Während der Mietzeit auftretende Mängel, Schäden oder Gefahren für die Mietsache sind dem Vermieter unverzüglich anzuzeigen.'),
            $this->paragraph('Für vom Mieter, seinen Haushaltsangehörigen oder zurechenbaren Dritten schuldhaft verursachte Schäden gelten die gesetzlichen Vorschriften. Veränderungen oder Verschlechterungen durch vertragsgemäßen Gebrauch hat der Mieter nicht zu vertreten.'),
            $this->heading(2, '§ 15 Schönheitsreparaturen, Farbgestaltung und Ausführungsqualität'),
            $this->paragraph('Die laufenden Schönheitsreparaturen innerhalb der Wohnung trägt der Mieter nur, wenn die Wohnung bei Mietbeginn renoviert oder in einem renovierten Zustand vergleichbar übergeben wird. Bei unrenovierter oder renovierungsbedürftiger Übergabe gilt dies nur, wenn hierfür ein angemessener Ausgleich gewährt wird.'),
            $this->paragraph('Bei wirksamer Übertragung umfassen Schönheitsreparaturen insbesondere das Tapezieren oder Anstreichen von Wänden und Decken, das Streichen von Heizkörpern und sichtbaren Heizrohren sowie von Innentüren und den Innenseiten von Fenstern und Außentüren, soweit die jeweilige Oberfläche hierfür vorgesehen ist. Sie sind ausschließlich nach dem tatsächlichen Renovierungsbedarf auszuführen. Starre Fristen und eine davon unabhängige Endrenovierung werden nicht vereinbart; eine fachgerechte Ausführung durch den Mieter selbst bleibt zulässig.'),
            $this->paragraph('Die Farbgestaltung während der Mietzeit steht dem Mieter frei. Hat der Mieter eine bei Mietbeginn neutral dekorierte Wohnung während der Mietzeit in kräftigen, dunklen, grellen, mehrfarbigen oder sonst ungewöhnlichen Farbtönen gestaltet, hat er diese von ihm geschaffene Gestaltung bei Rückgabe zu beseitigen, soweit sie von einem breiten Kreis von Mietinteressenten erfahrungsgemäß nicht akzeptiert wird und die Weitervermietung dadurch wesentlich erschwert. Die betroffenen Flächen sind dann in einem neutralen, hellen und deckenden Farbton zurückzugeben. Eine bestimmte Farbe, insbesondere Weiß, wird nicht vorgeschrieben. Normale alters- und nutzungsbedingte Abnutzung begründet für sich keine solche Wiederherstellungspflicht.'),
            $this->paragraph('Soweit der Mieter nach diesem Vertrag oder Gesetz Maler- oder Tapezierarbeiten schuldet oder solche Arbeiten zur Beseitigung einer von ihm verursachten Farbgestaltung oder Beschädigung ausführt, müssen sie fachgerecht und handwerklich ordentlich ausgeführt sein. Eigenleistung ist zulässig; die Beauftragung eines Fachbetriebs wird nicht verlangt. Erforderlich sind insbesondere ein geeigneter und ausreichend vorbereiteter Untergrund, eine gleichmäßige und deckende Oberfläche sowie saubere Kanten und Anschlüsse. Das Arbeitsergebnis darf keine deutlich sichtbaren Läufer, Flecken, Streifen, Roll- oder Pinselansätze, Verschmierungen oder Farbspritzer aufweisen. Fußböden, Sockelleisten, Schalter, Steckdosen, Fenster- und Türrahmen, Beschläge sowie andere Bauteile, die nicht Gegenstand der geschuldeten Arbeiten sind, dürfen nicht mit Farbe verunreinigt werden. Tapeten sind ohne offene Nähte, Blasen oder grobe Beschädigungen anzubringen. Maßgeblich ist das handwerklich ordentliche Gesamtergebnis, nicht die Ausführung durch einen Fachbetrieb.'),
            $this->heading(2, '§ 16 Kleinreparaturen'),
            $this->paragraph('Der Mieter trägt die Kosten einer erforderlichen Kleinreparatur an Installationsgegenständen, die seinem häufigen und unmittelbaren Zugriff unterliegen, nur bis 100,00 € je Reparatur. Die jährliche Gesamtbelastung ist auf 6 % der jährlichen Nettokaltmiete, höchstens jedoch 400,00 €, begrenzt. Erfasst sind insbesondere Installationsgegenstände für Elektrizität, Wasser und Gas, Heiz- und Kocheinrichtungen sowie Fenster-, Tür- und Rollladenverschlüsse, soweit sie dem häufigen unmittelbaren Zugriff des Mieters unterliegen. Eine Pflicht des Mieters, Reparaturen selbst zu beauftragen oder auszuführen, wird nicht begründet.'),
            $this->heading(2, '§ 17 Tierhaltung'),
            $this->paragraph('Nicht störende Kleintiere dürfen im üblichen Umfang ohne gesonderte Zustimmung gehalten werden. Die Haltung von Hunden, Katzen und sonstigen nicht als Kleintier einzuordnenden Tieren bedarf der vorherigen Zustimmung des Vermieters. Über die Zustimmung wird nach Abwägung der Umstände des Einzelfalls entschieden; sie darf nicht ohne sachlichen Grund verweigert werden. Maßgeblich sind insbesondere Art, Größe und Anzahl der Tiere, die Wohnung und das Gebäude, konkrete Störungs- oder Gefährdungspotenziale sowie berechtigte Interessen der Vertragsparteien und anderer Bewohner.'),
            $this->paragraph('Eine Zustimmung bezieht sich nur auf das konkret bezeichnete Tier und die bei Erteilung bekannten Umstände. Sie ist keine allgemeine Tierhaltungserlaubnis und begründet keinen Anspruch auf die Haltung weiterer Tiere. Erlaubnisse in anderen Mietverhältnissen binden den Vermieter nicht; auch dort sind die jeweiligen tatsächlichen Umstände gesondert zu würdigen.'),
            $this->paragraph('Treten nach Erteilung der Zustimmung erhebliche und nicht nur vorübergehende Störungen, Schäden oder Gefährdungen auf, kann der Vermieter nach angemessener Abmahnung und erneuter Interessenabwägung erforderliche Auflagen erteilen oder die Zustimmung widerrufen, soweit dies im Einzelfall rechtlich zulässig und verhältnismäßig ist.'),
            $this->heading(2, '§ 18 Hausordnung und Gemeinschaftsbereiche'),
            $this->paragraph('Eine Hausordnung ist nur insoweit Vertragsbestandteil, wie sie diesem Vertrag beigefügt oder wirksam einbezogen wurde. Gemeinschaftliche Bereiche dürfen im Rahmen der in § 1 bezeichneten Nutzungsrechte, ihrer Zweckbestimmung und unter angemessener Rücksicht auf andere Berechtigte genutzt werden. Von dem Mieter verursachte Verunreinigungen oder zurückgelassene Gegenstände sind zeitnah zu beseitigen.'),
            $this->paragraph('Reinigungs-, Winterdienst- oder Gartenpflegepflichten treffen den Mieter nur, soweit sie wirksam und hinreichend bestimmt vereinbart oder in einer wirksam einbezogenen Hausordnung beziehungsweise einem hierzu gehörenden Plan zugewiesen sind. Ein solcher Plan darf die vereinbarten Pflichten turnusmäßig ordnen und sachgerecht konkretisieren, aber keine davon unabhängigen neuen Hauptpflichten begründen. Gesetzliche und örtliche Vorgaben gehen vor.'),
            $this->paragraph('Kommt der Mieter einer wirksam zugewiesenen Reinigungs- oder Ordnungspflicht schuldhaft nicht nach, kann der Vermieter ihn zur Abhilfe auffordern und bei wiederholten oder erheblichen Verstößen abmahnen. Nach erfolgloser angemessener Abhilfefrist darf der Vermieter eine notwendige Ersatzreinigung oder Gefahrenbeseitigung veranlassen und die erforderlichen Kosten vom verantwortlichen Mieter verlangen, soweit die gesetzlichen Voraussetzungen hierfür vorliegen.'),
            $this->paragraph('Bei wiederholtem oder erheblichem Fehlgebrauch eines Gemeinschaftsbereichs kann der Vermieter nach vorherigem Hinweis oder Abmahnung konkrete, sachlich erforderliche und verhältnismäßige Nutzungsregeln oder Beschränkungen anordnen, soweit dadurch unverzichtbare Zugänge und ausdrücklich eingeräumte Nutzungsrechte nicht entzogen werden; bei einer akuten Gefahr sind sofort erforderliche Sicherungsmaßnahmen zulässig. Eine Einzelfallgestattung für eine bestimmte Nutzung oder Person stellt keine allgemeine Freigabe für andere Nutzungen oder Nutzer dar.'),
            $this->heading(2, '§ 19 Zutritt zur Mietsache'),
            $this->paragraph('Der Vermieter oder von ihm beauftragte Personen dürfen die Mietsache bei einem konkreten berechtigten Anlass nach angemessener vorheriger Ankündigung und Abstimmung betreten. Ein solcher Anlass kann insbesondere bei der Prüfung oder Beseitigung von Mängeln und Schäden, zur Vorbereitung oder Durchführung erforderlicher Arbeiten, für notwendige technische Prüfungen oder Ablesungen sowie bei beabsichtigtem Verkauf oder nach Beendigung beziehungsweise Kündigung des Mietverhältnisses für Besichtigungen mit Mietinteressenten bestehen. Auf die berechtigten Belange des Mieters ist Rücksicht zu nehmen. Bei Gefahr im Verzug ist ein Zutritt ohne vorherige Ankündigung zulässig, soweit dies zur Abwehr der Gefahr erforderlich ist.'),
            $this->heading(2, '§ 20 Bauliche Veränderungen'),
            $this->paragraph('Bauliche Veränderungen, feste Einbauten oder Eingriffe in die Bausubstanz und Gebäudetechnik bedürfen vor Ausführung der Zustimmung des Vermieters, soweit kein gesetzlicher Anspruch besteht. Gesetzliche Ansprüche des Mieters, insbesondere nach § 554 BGB zur Barrierereduzierung, E-Mobilität, zum Einbruchsschutz und zu Steckersolargeräten, bleiben unberührt.'),
            $this->paragraph('Soweit rechtlich zulässig, kann eine Zustimmung von sachlich erforderlichen Vorgaben zur fachgerechten Planung und Ausführung, zu Genehmigungen, technischer Sicherheit, Versicherung, separater Verbrauchserfassung, einer angemessenen Sicherheit und einem späteren Rückbau abhängig gemacht werden. Rückbau, Wegnahmerecht und ein möglicher Aufwendungsersatz richten sich im Übrigen nach der konkreten Zustimmung, wirksamen Vereinbarungen und den gesetzlichen Vorschriften.'),
            $this->heading(2, '§ 21 Rückgabe bei Vertragsende'),
            $this->paragraph('Bei Beendigung des Mietverhältnisses ist die Mietsache geräumt, besenrein und mit sämtlichen überlassenen Schlüsseln zurückzugeben. Eigene Gegenstände und Einbauten sind zu entfernen, soweit keine Übernahme vereinbart oder ein Verbleib anderweitig geschuldet ist. Veränderungen oder Verschlechterungen durch vertragsgemäßen Gebrauch bleiben außer Betracht. Rückbau- oder Wiederherstellungspflichten bestehen nur, soweit sie gesetzlich oder wirksam vertraglich begründet sind.'),
            $this->paragraph('Für eine vom Mieter geschaffene ungewöhnliche Farbgestaltung sowie für Maler- oder Tapezierarbeiten, die der Mieter bei Rückgabe tatsächlich schuldet oder zur Beseitigung eines von ihm zu vertretenden Zustands ausführt, gelten ergänzend die Anforderungen des § 15. Auch dadurch wird keine vom tatsächlichen Zustand unabhängige Endrenovierungspflicht begründet.'),
            $this->paragraph('Der bei Rückgabe gemeinsam festgestellte Zustand, insbesondere Farb- und Tapetenzustand, erkennbare Ausführungsqualität von Malerarbeiten, Zählerstände, Schlüssel und gegebenenfalls noch offene Maßnahmen werden im Rückgabe- beziehungsweise Übergabeprotokoll dokumentiert.'),
            $this->heading(2, '§ 22 Mehrere Mieter und Erklärungen'),
            $this->paragraph('Mehrere Mieter haften für die Verpflichtungen aus diesem Mietverhältnis als Gesamtschuldner, soweit gesetzlich nichts anderes gilt. Erklärungen, die den Bestand oder die Beendigung des Mietverhältnisses betreffen, sind gegenüber allen hierfür rechtlich erforderlichen Vertragsparteien abzugeben. Eine darüber hinausgehende pauschale Empfangs- oder Abschlussvollmacht wird mit diesem Vertrag nicht erteilt.'),
            $this->heading(2, '§ 23 Anlagen und individuelle Vereinbarungen'),
            $this->paragraph('Anlagen sind nur Vertragsbestandteil, soweit sie tatsächlich beigefügt oder wirksam einbezogen wurden. Individuelle Vereinbarungen der Parteien gehen wirksamen vorformulierten Regelungen vor.'),
            $this->paragraph('Individuelle Vereinbarungen:'),
            ...$this->freeTextArea(6),
            $this->heading(2, '§ 24 Unterschriften'),
            $this->paragraph('Mit ihrer Unterschrift schließen die Parteien diesen Mietvertrag einschließlich der tatsächlich beigefügten und wirksam einbezogenen Anlagen.'),
            $this->signatureBlock(),
        ];
    }
}
