<?php

namespace App\Services\Documents;

/** Canonical editor-first lease for garages, carports and parking spaces. */
final class GarageLeaseDocumentBuilder
{
    use BuildsStructuredDocuments;

    /** @return array<int, array<string, mixed>> */
    public function build(): array
    {
        return [
            $this->heading(1, 'Mietvertrag über Garage / Stellplatz'),
            $this->paragraph('Vertrag {{ contract.number }}', [['type' => 'bold']]),
            $this->horizontalRule(),
            $this->partyTable('Vermieter', "{{ organization.signatureName }}\n{{ organization.address }}", 'Mieter', '{{ tenants.all }}'),
            $this->paragraph('Zwischen den vorstehend bezeichneten Parteien wird folgender Mietvertrag geschlossen.'),
            $this->heading(2, '§ 1 Mietobjekt'),
            $this->factsTable([
                ['Art', '{{ unit.typeLabel }}'],
                ['Anschrift', '{{ property.fullAddress }}'],
                ['Einheit / Nummer', '{{ unit.label }}'],
            ]),
            $this->paragraph('Vermietet wird ausschließlich das vorstehend bezeichnete Mietobjekt einschließlich der hierfür bestimmungsgemäß vorgesehenen Zufahrt und Zugangsmöglichkeiten. Weitere Flächen oder Einrichtungen sind nur mitvermietet, wenn dies ausdrücklich vereinbart ist.'),
            $this->heading(2, '§ 2 Nutzung'),
            $this->paragraph('Das Mietobjekt darf entsprechend seiner Art zum Abstellen von Fahrzeugen und für damit typischerweise verbundene Zwecke genutzt werden. Eine Nutzung als Wohn-, Aufenthalts-, Werkstatt-, Verkaufs- oder dauerhafte Lagerfläche ist ohne vorherige Zustimmung des Vermieters nicht gestattet, soweit sie über den vertragsgemäßen Gebrauch hinausgeht. Fahrzeugwäsche, umfangreiche Reparaturarbeiten oder Arbeiten mit erhöhter Brand-, Umwelt- oder Verschmutzungsgefahr sind nur zulässig, wenn das Mietobjekt hierfür bestimmt ist oder der Vermieter zuvor zugestimmt hat.'),
            $this->paragraph('Eine dauerhafte vollständige Gebrauchsüberlassung oder Untervermietung an Dritte bedarf der Zustimmung des Vermieters. Die gelegentliche Nutzung durch Haushaltsangehörige oder Besucher mit einem zulässigen Fahrzeug bleibt hiervon unberührt, solange dadurch keine eigenständige Gebrauchsüberlassung begründet wird.'),
            $this->paragraph('Öffentlich-rechtliche Vorgaben, insbesondere Brand-, Sicherheits- und Garagenvorschriften, sind einzuhalten. Gefährliche, explosionsgefährliche oder leicht entzündliche Stoffe dürfen nur in dem Umfang eingebracht werden, der nach den anwendbaren Vorschriften und dem üblichen Fahrzeugbetrieb zulässig ist.'),
            $this->heading(2, '§ 3 Mietzeit, Mindestbindung und Kündigung'),
            $this->factsTable([
                ['Vertragsbeginn', '{{ contract.startsOn }}'],
                ['Laufzeit', '{{ contract.termTypeLabel }}'],
                ['Mindestlaufzeit / Kündigungsverzicht', '{{ contract.minimumMonths }} Monate'],
                ['Befristet bis', '{{ contract.fixedUntil }}'],
            ]),
            $this->paragraph('Bei einer ausgewiesenen Mindestlaufzeit von mehr als 0 Monaten vereinbaren die Parteien bei einem rechtlich selbstständigen Garagen- oder Stellplatzmietverhältnis für diesen Zeitraum einen wechselseitigen Ausschluss der ordentlichen Kündigung. Die ordentliche Kündigung darf bereits so rechtzeitig erklärt werden, dass sie zum Ablauf der vereinbarten Mindestbindung wirksam wird. Das Recht zur außerordentlichen Kündigung aus wichtigem Grund und zwingende Sonderkündigungsrechte bleiben unberührt. Nach Ablauf der Mindestbindung richtet sich die ordentliche Kündigung eines rechtlich selbstständigen Mietverhältnisses, soweit keine andere wirksame Frist vereinbart ist, insbesondere nach § 580a BGB.'),
            $this->paragraph('Ist dieser Garagen- oder Stellplatzvertrag in der Vertragsakte mit einem Wohnraummietvertrag als Hauptvertrag verknüpft, entscheidet die technische Verknüpfung allein noch nicht über die zivilrechtliche Einheit beider Verträge. Bilden beide Vereinbarungen nach Parteien, Abschlussumständen und Vertragszweck rechtlich ein einheitliches Wohnraummietverhältnis, gehen für Mindestbindung, ordentliche Kündigung und zwingende Schutzvorschriften die Regeln des Wohnraummietverhältnisses vor; eine isolierte ordentliche Beendigung nur der Garage oder des Stellplatzes ist dann nur zulässig, soweit sie rechtlich eröffnet ist. Bleibt der Garagen- oder Stellplatzvertrag rechtlich selbstständig, gelten die Regelungen dieses Vertrags.'),
            $this->heading(2, '§ 4 Miete'),
            $this->factsTable([
                ['Grundmiete monatlich', '{{ rent.base }}'],
                ['Nebenkosten / Vorauszahlung', '{{ rent.advance }}'],
                ['Gesamtmiete monatlich', '{{ rent.total }}', true],
            ]),
            $this->paragraph('Änderungen der Miete bedürfen einer wirksamen Vereinbarung oder einer sonstigen gesetzlichen Grundlage.'),
            $this->heading(2, '§ 5 Zahlung und Fälligkeit'),
            $this->paragraph('Die monatliche Gesamtmiete ist im Voraus, spätestens bis zum dritten Werktag eines Kalendermonats, zu zahlen. Für die Rechtzeitigkeit gelten die gesetzlichen Bestimmungen.'),
            $this->factsTable([
                ['Kontoinhaber', '{{ bank.accountHolder }}'],
                ['IBAN', '{{ bank.iban }}'],
                ['Verwendungszweck', 'Vertrag {{ contract.number }}'],
            ]),
            $this->paragraph('Änderungen der Bankverbindung teilt der Vermieter in Textform mit.'),
            $this->heading(2, '§ 6 Betriebskosten'),
            $this->paragraph('Nebenkosten werden nur geschuldet, soweit sie ausdrücklich vereinbart und dem Mietobjekt zuordenbar sind. Sind Vorauszahlungen vereinbart, wird über sie in angemessenen Abständen nach dem vereinbarten Abrechnungsmaßstab abgerechnet.'),
            $this->heading(2, '§ 7 Mietsicherheit'),
            $this->factsTable([
                ['Vereinbarte Mietsicherheit', '{{ deposit.amount }}'],
                ['Fällig ab', '{{ deposit.dueFrom }}'],
                ['Vorgesehene Raten', '{{ deposit.installmentCount }}'],
                ['Ratenbetrag', '{{ deposit.installmentAmount }}'],
            ]),
            $this->paragraph('Bei einem rechtlich selbstständigen Garagen- oder Stellplatzmietverhältnis ist eine vereinbarte Mietsicherheit ab dem ausgewiesenen Fälligkeitszeitpunkt nach der vereinbarten Ratenplanung zu leisten. Ist Garage oder Stellplatz dagegen rechtlich Bestandteil eines einheitlichen Wohnraummietverhältnisses, gehen die zwingenden Vorgaben des § 551 BGB vor: Eine Geldkaution darf dann die gesetzliche Höchstgrenze nicht überschreiten und der Mieter bleibt zur Zahlung in drei gleichen monatlichen Teilzahlungen berechtigt, wobei die erste Teilzahlung zu Beginn des Mietverhältnisses und die weiteren mit den unmittelbar folgenden Mietzahlungen fällig werden. Eine für den Mieter günstigere Zahlungsvereinbarung bleibt unberührt.'),
            $this->heading(2, '§ 8 Schlüssel, Transponder und Fernbedienungen'),
            $this->paragraph('Art und Anzahl der übergebenen Schlüssel, Transponder oder Fernbedienungen werden bei Übergabe dokumentiert. Verlust oder Funktionsstörungen sind dem Vermieter unverzüglich mitzuteilen. Ersatzkosten richten sich nach den gesetzlichen Schadensersatzvoraussetzungen und den tatsächlich erforderlichen Maßnahmen.'),
            $this->heading(2, '§ 9 Obhut, Reinigung, Mängel und Schäden'),
            $this->paragraph('Der Mieter behandelt das Mietobjekt, Bodenflächen, Tore und vorhandene technische Einrichtungen pfleglich. Mängel, Schäden oder Gefahren, die eine Maßnahme zum Schutz des Mietobjekts erfordern, sind dem Vermieter unverzüglich anzuzeigen. Der Vermieter bleibt für die Erhaltung des Mietobjekts im vertragsgemäßen Zustand verantwortlich; der Mieter haftet für schuldhaft verursachte Schäden.'),
            $this->paragraph('Der Mieter hält die ihm ausschließlich überlassene Garage, Box oder Stellplatzfläche in einem angemessen sauberen Zustand. Von seinem Fahrzeug oder seiner Nutzung eingetragener grober Schmutz, Laub, Splitt und Streusalzreste sind regelmäßig und insbesondere nach der Winterperiode zu entfernen, soweit dies mit üblicher Reinigung gefahrlos möglich ist. Normale Abnutzung und die Instandhaltung der Bausubstanz bleiben hiervon unberührt.'),
            $this->paragraph('Austretendes Öl, Kraftstoff, Kühlmittel oder andere Betriebsstoffe sind unverzüglich fachgerecht aufzunehmen beziehungsweise deren Ausbreitung zu verhindern und dem Vermieter anzuzeigen, wenn eine Beeinträchtigung des Bauwerks, des Bodens oder der Umwelt zu erwarten ist. Kosten einer erforderlichen Fachreinigung oder Schadensbeseitigung trägt der Mieter nur nach den gesetzlichen Verantwortlichkeits- und Schadensersatzvoraussetzungen.'),
            $this->heading(2, '§ 10 Bauliche Veränderungen und Ladeeinrichtungen'),
            $this->paragraph('Bauliche Veränderungen, feste Einbauten oder Eingriffe in elektrische Anlagen bedürfen vor Ausführung der Zustimmung des Vermieters, soweit kein gesetzlicher Anspruch besteht. Gesetzliche Ansprüche auf Erlaubnis einer Ladeeinrichtung für elektrisch betriebene Fahrzeuge nach § 554 BGB in Verbindung mit § 578 BGB bleiben unberührt.'),
            $this->paragraph('Das Laden von Fahrzeugen ist nur an einer dafür technisch vorgesehenen und zulässigen Ladeeinrichtung gestattet. Provisorische Leitungsführungen über Fahr-, Geh- oder Gemeinschaftsflächen sowie die dauerhafte Nutzung nicht hierfür vorgesehener Steckdosen sind aus Sicherheitsgründen unzulässig. Ausführung, Genehmigungen, Kosten, Verbrauchserfassung, Betrieb, technische Sicherheit, eine gegebenenfalls erforderliche Sicherheitsleistung und ein späterer Rückbau richten sich nach der konkreten Zustimmung und den gesetzlichen Vorschriften.'),
            $this->heading(2, '§ 11 Verkehr und Sicherheit'),
            $this->paragraph('Zufahrten, Tore, Fahrgassen, Rettungswege und gekennzeichnete Sicherheitsbereiche sind freizuhalten. Das Fahrzeug ist so abzustellen, dass andere berechtigte Nutzer nicht unzumutbar behindert und vorhandene Einrichtungen nicht beschädigt werden. Von der eigenen Nutzung verursachte Verunreinigungen auf gemeinsam genutzten Zufahrten oder Flächen sind zeitnah zu beseitigen, soweit dies gefahrlos möglich ist.'),
            $this->heading(2, '§ 12 Rückgabe'),
            $this->paragraph('Bei Beendigung des Mietverhältnisses ist das Mietobjekt vollständig geräumt, besenrein und in vertragsgemäßem Zustand einschließlich sämtlicher überlassener Schlüssel, Transponder und Fernbedienungen zurückzugeben. Vom Mieter verursachte grobe Verschmutzungen sowie mit üblicher Reinigung entfernbare Splitt- und Streusalzreste sind zu beseitigen. Normale Abnutzung durch vertragsgemäßen Gebrauch bleibt außer Betracht.'),
            $this->heading(2, '§ 13 Verhältnis zu einem Wohnraummietverhältnis'),
            $this->paragraph('Ist Garage oder Stellplatz nach der Vereinbarung und den Umständen rechtlich Bestandteil eines einheitlichen Wohnraummietverhältnisses, gehen die dafür geltenden zwingenden wohnraummietrechtlichen Vorschriften vor. Eine in s4v2 gepflegte Hauptvertragsverknüpfung dokumentiert die organisatorische Zuordnung, ersetzt aber nicht die rechtliche Würdigung des Einzelfalls. Bei einem rechtlich selbstständigen Mietverhältnis gelten die allgemeinen Vorschriften über die Miete; soweit keine abweichende wirksame Kündigungsfrist vereinbart ist, richtet sich die ordentliche Kündigung insbesondere nach § 580a BGB.'),
            $this->heading(2, '§ 14 Individuelle Vereinbarungen'),
            $this->paragraph('Individuelle Vereinbarungen der Parteien gehen wirksamen vorformulierten Regelungen vor.'),
            ...$this->freeTextArea(5),
            $this->heading(2, '§ 15 Unterschriften'),
            $this->paragraph('Mit ihrer Unterschrift schließen die Parteien diesen Mietvertrag einschließlich der tatsächlich beigefügten und wirksam einbezogenen Anlagen.'),
            $this->signatureBlock(),
        ];
    }
}
