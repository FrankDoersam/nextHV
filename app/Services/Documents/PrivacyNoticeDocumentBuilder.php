<?php

namespace App\Services\Documents;

/** Contract-specific transparency notice under Articles 13 and 14 GDPR. */
final class PrivacyNoticeDocumentBuilder
{
    use BuildsStructuredDocuments;

    /** @return array<int, array<string, mixed>> */
    public function build(): array
    {
        return [
            $this->heading(1, 'Datenschutzhinweise zum Mietverhältnis'),
            $this->paragraph('Informationen nach Art. 13 und 14 DSGVO · Vertrag {{ contract.number }} · Stand {{ today.date }}', [['type' => 'bold']]),
            $this->horizontalRule(),
            $this->factsTable([
                ['Verantwortlicher', '{{ organization.name }}'],
                ['Anschrift', '{{ organization.address }}'],
                ['Kontakt', '{{ organization.contact }}'],
                ['Datenschutzkontakt', '{{ organization.privacyContact }}'],
            ]),
            $this->heading(2, '1 Verantwortlicher und Datenschutzkontakt'),
            $this->paragraph('Verantwortlich für die Verarbeitung personenbezogener Daten im Zusammenhang mit diesem Mietverhältnis ist der oben bezeichnete Vermieter beziehungsweise die dort bezeichnete verantwortliche Stelle. Sofern ein Datenschutzbeauftragter bestellt ist, werden dessen Kontaktdaten gesondert bekannt gegeben.'),
            $this->heading(2, '2 Zwecke, Daten und Rechtsgrundlagen'),
            $this->paragraph('Verarbeitet werden die Daten, die für Anbahnung, Abschluss, Durchführung und Beendigung des Mietverhältnisses erforderlich sind. Dazu gehören insbesondere Stamm- und Kontaktdaten, Vertrags- und Objektdaten, Zahlungs- und Bankdaten, Verbrauchs- und Abrechnungsdaten sowie Kommunikations-, Vorgangs- und Dokumentationsdaten.'),
            $this->paragraph('Rechtsgrundlage ist insbesondere Art. 6 Abs. 1 lit. b DSGVO für die Anbahnung und Durchführung des Mietverhältnisses sowie für vorvertragliche Maßnahmen. Soweit gesetzliche Pflichten bestehen, erfolgt die Verarbeitung nach Art. 6 Abs. 1 lit. c DSGVO. Auf Art. 6 Abs. 1 lit. f DSGVO gestützte Verarbeitungen erfolgen nur bei einem berechtigten Interesse, insbesondere an einer ordnungsgemäßen Immobilienverwaltung, der Gebäudesicherheit sowie der Geltendmachung, Ausübung oder Verteidigung von Rechtsansprüchen. Eine Einwilligung wird nur für gesonderte Verarbeitungen verwendet, die tatsächlich eine Einwilligung erfordern.'),
            $this->paragraph('Besondere Kategorien personenbezogener Daten werden nur verarbeitet, wenn dies im Einzelfall erforderlich und zusätzlich eine Rechtsgrundlage nach Art. 9 DSGVO gegeben ist.'),
            $this->heading(2, '3 Empfänger und Auftragsverarbeiter'),
            $this->paragraph('Daten werden nur weitergegeben, soweit dies für die genannten Zwecke erforderlich oder rechtlich zulässig ist. Empfänger können insbesondere Haus- und Immobilienverwaltungen, Banken und Zahlungsdienstleister, Mess- und Versorgungsdienstleister, Handwerks- und Sachverständigenbetriebe, Versicherungen, IT- und Hosting-Dienstleister, Steuerberater, Rechtsanwälte und sonstige zur Verschwiegenheit verpflichtete Berater sowie zuständige Behörden und Gerichte sein.'),
            $this->paragraph('Dienstleister, die personenbezogene Daten ausschließlich im Auftrag verarbeiten, werden nach Art. 28 DSGVO eingebunden.'),
            $this->heading(2, '4 Übermittlungen in Drittländer'),
            $this->paragraph('Eine Übermittlung personenbezogener Daten außerhalb der Europäischen Union oder des Europäischen Wirtschaftsraums erfolgt nur, wenn sie für die eingesetzten Dienste tatsächlich erforderlich ist und die Voraussetzungen der Art. 44 ff. DSGVO erfüllt sind. Soweit eine solche Übermittlung stattfindet, werden die gesetzlich erforderlichen Informationen zu Empfängerland und Übermittlungsgrundlage bereitgestellt.'),
            $this->heading(2, '5 Speicherdauer'),
            $this->paragraph('Daten werden nur so lange gespeichert, wie sie für das Mietverhältnis und die jeweiligen Verarbeitungszwecke erforderlich sind. Danach erfolgt eine weitere Speicherung nur, soweit gesetzliche Aufbewahrungsfristen, berechtigte Dokumentationsinteressen oder die Geltendmachung, Ausübung oder Verteidigung von Rechtsansprüchen dies erfordern. Anschließend werden die Daten gelöscht oder, soweit erforderlich, in ihrer Verarbeitung eingeschränkt.'),
            $this->heading(2, '6 Bereitstellung und Datenquellen'),
            $this->paragraph('Die für Vertragsschluss und Vertragsdurchführung erforderlichen Angaben müssen bereitgestellt werden, soweit sie vertraglich oder gesetzlich notwendig sind. Ohne diese Daten kann ein Mietverhältnis gegebenenfalls nicht abgeschlossen oder ordnungsgemäß durchgeführt werden. Freiwillige Angaben werden als solche behandelt.'),
            $this->paragraph('Daten stammen in der Regel unmittelbar von den betroffenen Personen. Soweit Daten aus anderen Quellen stammen, beispielsweise von mitgeteilten Mitmietern, Bevollmächtigten, Messdienstleistern, Behörden oder öffentlich zugänglichen Registern, werden die zusätzlichen Informationspflichten nach Art. 14 DSGVO erfüllt, soweit keine gesetzliche Ausnahme greift.'),
            $this->heading(2, '7 Rechte der betroffenen Personen'),
            $this->paragraph('Im Rahmen der gesetzlichen Voraussetzungen bestehen insbesondere Rechte auf Auskunft nach Art. 15 DSGVO, Berichtigung nach Art. 16 DSGVO, Löschung nach Art. 17 DSGVO, Einschränkung der Verarbeitung nach Art. 18 DSGVO sowie Datenübertragbarkeit nach Art. 20 DSGVO.'),
            $this->paragraph('Soweit eine Verarbeitung auf Art. 6 Abs. 1 lit. f DSGVO beruht, kann aus Gründen, die sich aus der besonderen Situation der betroffenen Person ergeben, nach Art. 21 DSGVO Widerspruch eingelegt werden. Beruht eine Verarbeitung auf einer Einwilligung, kann diese jederzeit mit Wirkung für die Zukunft widerrufen werden.'),
            $this->heading(2, '8 Beschwerderecht'),
            $this->paragraph('Nach Art. 77 DSGVO besteht das Recht, sich bei einer Datenschutzaufsichtsbehörde zu beschweren. Dies kann insbesondere die für den Verantwortlichen zuständige Aufsichtsbehörde sein.'),
            $this->heading(2, '9 Automatisierte Entscheidungen und Zweckänderungen'),
            $this->paragraph('Eine ausschließlich automatisierte Entscheidung mit rechtlicher oder ähnlich erheblicher Wirkung im Sinne von Art. 22 DSGVO findet im Rahmen der üblichen Mietvertragsverwaltung nicht statt, sofern nicht vorab ausdrücklich anders informiert wird.'),
            $this->paragraph('Soll eine Weiterverarbeitung für einen anderen Zweck erfolgen, werden vor dieser Weiterverarbeitung die gesetzlich erforderlichen zusätzlichen Informationen bereitgestellt.'),
        ];
    }
}
