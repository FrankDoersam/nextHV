<?php

namespace App\Services\Documents;

final class ContractDocumentDataRegistry
{
    /** @return array<int, array<string, mixed>> */
    public static function variables(): array
    {
        return [
            ...self::group('Organisation', [
                ['organization.name', 'Vermieter / Verwaltung', false, 'Name des Absenders bzw. Vermieters.'],
                ['organization.profileTypeLabel', 'Vermieterart', true, 'Privatperson, Einzelunternehmen oder Gesellschaft.'],
                ['organization.profileType', 'Vermieterart (Schlüssel)', true],
                ['organization.salutation', 'Anrede Vermieter', true],
                ['organization.title', 'Titel Vermieter', true],
                ['organization.firstName', 'Vorname Vermieter', true],
                ['organization.lastName', 'Nachname Vermieter', true],
                ['organization.registeredName', 'Offizielle Firmierung', true],
                ['organization.tradingName', 'Geschäftsbezeichnung', true],
                ['organization.legalForm', 'Rechtsform Vermieter', true],
                ['organization.registeredOffice', 'Sitz des Unternehmens', true, 'Gesondert gepflegter Satzungs-/Registersitz; nicht aus der Postanschrift abgeleitet.'],
                ['organization.taxNumber', 'Steuernummer Vermieter', true],
                ['organization.vatId', 'Umsatzsteuer-ID Vermieter', true],
                ['organization.economicId', 'Wirtschafts-ID Vermieter', true, 'Wirtschafts-Identifikationsnummer; ersetzt keine rechnungsspezifischen Steuerangaben.'],
                ['organization.registrationType', 'Registerart Vermieter', true],
                ['organization.registrationNumber', 'Registernummer Vermieter', true],
                ['organization.registrationCourt', 'Registergericht Vermieter', true],
                ['organization.registrationDescription', 'Vollständige Registerangaben', true],
                ['organization.legalFooter', 'Rechtliche Angaben im Dokumentfuß', true],
                ['organization.representedBy', 'Vertreten durch', true, 'Vertretungsberechtigte Personen mit ihren Funktionen.'],
                ['organization.supervisoryChair', 'Vorsitz des Aufsichtsrats', true],
                ['organization.generalPartnerDetails', 'Persönlich haftende Gesellschafter', true, 'Firmierung, Sitz, Register und Vertretung der persönlich haftenden Gesellschafter.'],
                ['organization.signatureName', 'Vermieter mit Vertretung', true, 'Name des Vermieters; bei Vertretung ergänzt um „vertreten durch …“.'],
                ['organization.address', 'Vermieteranschrift', false, 'Vollständige Absenderanschrift.'],
                ['organization.street', 'Straße Vermieter', true],
                ['organization.houseNumber', 'Hausnummer Vermieter', true],
                ['organization.postalCode', 'PLZ Vermieter', true],
                ['organization.city', 'Ort Vermieter', false],
                ['organization.email', 'E-Mail Vermieter', true],
                ['organization.phone', 'Telefon Vermieter', true],
                ['organization.fax', 'Fax Vermieter', true],
                ['organization.website', 'Website Vermieter', true],
                ['organization.creditorId', 'Gläubiger-ID', true],
                ['organization.footerText', 'Fußzeilentext', true],
                ['organization.contact', 'Kontakt Vermieter', true],
                ['organization.privacyContact', 'Datenschutzkontakt', true],
            ]),
            ...self::group('Vertrag', [
                ['contract.number', 'Vertragsnummer', false],
                ['contract.tenantNumber', 'Mieternummer / Vertragsreferenz', false],
                ['contract.type', 'Vertragsart (Schlüssel)', false],
                ['contract.typeLabel', 'Vertragsart', false],
                ['contract.status', 'Vertragsstatus (Schlüssel)', false],
                ['contract.statusLabel', 'Vertragsstatus', false],
                ['contract.termType', 'Laufzeitart (Schlüssel)', false],
                ['contract.termTypeLabel', 'Laufzeitart', false],
                ['contract.concludedOn', 'Vertragsdatum', true],
                ['contract.startsOn', 'Mietbeginn', false],
                ['contract.minimumMonths', 'Mindestlaufzeit Monate', true],
                ['contract.minimumUntil', 'Mindestlaufzeit bis', true],
                ['contract.fixedUntil', 'Befristet bis', true],
                ['contract.fixedReasonType', 'Befristungsgrund (Schlüssel)', true],
                ['contract.fixedReasonLabel', 'Befristungsgrund', true],
                ['contract.fixedReasonText', 'Befristungsbegründung', true],
                ['contract.rentAdjustmentModel', 'Mietanpassungsmodell (Schlüssel)', true],
                ['contract.rentAdjustmentLabel', 'Mietanpassungsmodell', true],
                ['contract.handoverOn', 'Übergabedatum', true],
                ['contract.returnedOn', 'Rückgabedatum', true],
                ['contract.confirmedEndOn', 'Bestätigtes Vertragsende', true],
                ['contract.hasPendingTermination', 'Kündigung offen', true],
                ['contract.isFixed', 'Befristeter Vertrag', true],
                ['contract.isActive', 'Vertrag aktiv', true],
            ]),
            ...self::group('Objekt', [
                ['property.number', 'Objektnummer', false],
                ['property.name', 'Objektbezeichnung', false],
                ['property.type', 'Objektart (Schlüssel)', true],
                ['property.typeLabel', 'Objektart', true],
                ['property.status', 'Objektstatus (Schlüssel)', true],
                ['property.statusLabel', 'Objektstatus', true],
                ['property.address', 'Objektstraße', false],
                ['property.postalCode', 'Objekt PLZ', false],
                ['property.city', 'Objektort', false],
                ['property.fullAddress', 'Objektanschrift', false],
                ['property.constructionYear', 'Baujahr', true],
                ['property.billingPeriod', 'Abrechnungszeitraum', true],
                ['property.billingMode', 'Abrechnungsmodus (Schlüssel)', true],
                ['property.billingModeLabel', 'Abrechnungsmodus', true],
                ['property.heatingType', 'Heizungsart (Schlüssel)', true],
                ['property.heatingTypeLabel', 'Heizungsart', true],
                ['property.heatingBillingType', 'Heizkostenabrechnung (Schlüssel)', true],
                ['property.heatingBillingTypeLabel', 'Heizkostenabrechnung', true],
                ['property.billingHeaderText', 'Abrechnung Kopftext', true],
                ['property.billingFooterText', 'Abrechnung Fußtext', true],
                ['property.sharedUseAreas', 'Gemeinschaftliche Mitbenutzung', true, 'Objektweit tatsächlich nutzbare Gemeinschaftsbereiche, z. B. Fahrradraum, Waschküche oder Garten.'],
                ['property.sharedUseAreasLabel', 'Gemeinschaftliche Mitbenutzung (Vertrag)', false, 'Vertragsfertige Beschreibung der am Objekt vereinbarten Gemeinschaftsbereiche.'],
            ]),
            ...self::group('Einheit', [
                ['unit.number', 'Einheitsnummer', false],
                ['unit.name', 'Einheitsbezeichnung', false],
                ['unit.label', 'Einheit', false],
                ['unit.type', 'Einheitsart (Schlüssel)', true],
                ['unit.typeLabel', 'Einheitsart', true],
                ['unit.status', 'Einheitsstatus (Schlüssel)', true],
                ['unit.statusLabel', 'Einheitsstatus', true],
                ['unit.condition', 'Zustand (Schlüssel)', true],
                ['unit.conditionLabel', 'Zustand', true],
                ['unit.floor', 'Etage (Zahl)', true],
                ['unit.floorLabel', 'Etage', true],
                ['unit.area', 'Abrechnungsfläche', true],
                ['unit.livingArea', 'Wohnfläche', true],
                ['unit.usableArea', 'Nutzfläche', true],
                ['unit.heatedArea', 'Beheizte Fläche', true],
                ['unit.billingArea', 'Abrechnungsfläche explizit', true],
                ['unit.balconyArea', 'Balkonfläche', true],
                ['unit.roomCount', 'Zimmer', true],
                ['unit.bedrooms', 'Schlafzimmer', true],
                ['unit.bathrooms', 'Bäder', true],
                ['unit.separateToilet', 'Separates WC', true],
                ['unit.roomSummary', 'Raumaufteilung', false, 'Kombiniert Zimmerzahl, Badanzahl und separates WC aus den gepflegten Einheitsdaten.'],
                ['unit.leaseAncillarySpaces', 'Nebenräume / Zubehör', true, 'Optional gepflegte Nebenräume und Zubehör der Einheit.'],
                ['unit.leaseAncillarySpacesLabel', 'Nebenräume / Zubehör (Vertrag)', true, 'Vertragsfertige Beschreibung der optional mitüberlassenen Nebenräume und des Zubehörs.'],
                ['unit.operatingCostBillable', 'Betriebskosten umlagefähig', true],
            ]),
            ...self::group('Vertragsparteien', [
                ['tenants.all', 'Alle Mieter', false],
                ['tenants.signatureNames', 'Mieter für Unterschrift', true, 'Vor- und Nachnamen aller Mieter, mit Semikolon getrennt.'],
                ['tenants.allWithIds', 'Alle Mieter mit Referenz', true],
                ['tenants.count', 'Anzahl Mieter', true],
                ['tenant.name', 'Hauptmieter', false],
                ['tenant.salutation', 'Anrede Hauptmieter', true],
                ['tenant.title', 'Titel Hauptmieter', true],
                ['tenant.firstName', 'Vorname Hauptmieter', true],
                ['tenant.lastName', 'Nachname Hauptmieter', true],
                ['tenant.birthDate', 'Geburtsdatum Hauptmieter', true],
                ['tenant.address', 'Anschrift Hauptmieter', true],
                ['tenant.street', 'Straße Hauptmieter', true],
                ['tenant.houseNumber', 'Hausnummer Hauptmieter', true],
                ['tenant.postalCode', 'PLZ Hauptmieter', true],
                ['tenant.city', 'Ort Hauptmieter', true],
                ['tenant.email', 'E-Mail Hauptmieter', true],
                ['tenant.phone', 'Telefon Hauptmieter', true],
                ['guarantors.all', 'Alle Bürgen', true],
                ['guarantors.count', 'Anzahl Bürgen', true],
            ]),
            ...self::group('Miete & Konditionen', [
                ['rent.base', 'Grundmiete', true],
                ['rent.operatingAdvance', 'Betriebskostenvorauszahlung', true],
                ['rent.heatingAdvance', 'Heizkostenvorauszahlung', true],
                ['rent.advance', 'Nebenkostenvorauszahlung gesamt', true],
                ['rent.garage', 'Garagenmiete', true],
                ['rent.parking', 'Stellplatzmiete', true],
                ['rent.other', 'Sonstige Miete', true],
                ['rent.cold', 'Kaltmiete gesamt', true],
                ['rent.total', 'Warmmiete gesamt', true],
                ['rent.paymentInterval', 'Zahlungsintervall (Schlüssel)', true],
                ['rent.paymentIntervalLabel', 'Zahlungsintervall', true],
                ['rent.validFrom', 'Kondition gültig ab', true],
                ['rent.validUntil', 'Kondition gültig bis', true],
                ['rent.changeReason', 'Änderungsgrund (Schlüssel)', true],
                ['rent.changeReasonLabel', 'Änderungsgrund', true],
                ['rent.note', 'Konditionsnotiz', true],
            ]),
            ...self::group('Kaution', [
                ['deposit.exists', 'Kaution vorhanden', true],
                ['deposit.amount', 'Kautionsbetrag', true],
                ['deposit.currency', 'Kautionswährung', true],
                ['deposit.dueFrom', 'Kaution fällig ab', true],
                ['deposit.installmentCount', 'Kautionsraten Anzahl', true],
                ['deposit.installmentAmount', 'Kautionsrate', true],
                ['deposit.status', 'Kautionsstatus (Schlüssel)', true],
                ['deposit.statusLabel', 'Kautionsstatus', true],
                ['deposit.custodyType', 'Verwahrungsart (Schlüssel)', true],
                ['deposit.custodyTypeLabel', 'Verwahrungsart', true],
                ['deposit.reference', 'Kautionsreferenz', true],
                ['deposit.interestRelevant', 'Kaution verzinslich', true],
                ['deposit.interestAmount', 'Kautionszinsen', true],
                ['deposit.plannedRefundOn', 'Geplante Kautionsrückzahlung', true],
                ['deposit.refundedOn', 'Kaution zurückgezahlt am', true],
                ['deposit.refundedAmount', 'Zurückgezahlte Kaution', true],
                ['deposit.retainedAmount', 'Einbehaltene Kaution', true],
                ['deposit.retentionReason', 'Grund Kautionseinbehalt', true],
            ]),
            ...self::group('Bankverbindung', [
                ['bank.accountHolder', 'Kontoinhaber Mietkonto', true],
                ['bank.iban', 'IBAN Mietkonto', true],
                ['bank.bic', 'BIC Mietkonto', true],
                ['bank.name', 'Bank Mietkonto', true],
                ['bank.purposeLabel', 'Zweck Mietkonto', true],
                ['refundBank.accountHolder', 'Kontoinhaber Gutschriftkonto', true],
                ['refundBank.iban', 'IBAN Gutschriftkonto', true],
                ['refundBank.bic', 'BIC Gutschriftkonto', true],
                ['refundBank.name', 'Bank Gutschriftkonto', true],
            ]),
            ...self::group('Kündigung & Ende', [
                ['termination.exists', 'Kündigung vorhanden', true],
                ['termination.type', 'Kündigungsart (Schlüssel)', true],
                ['termination.typeLabel', 'Kündigungsart', true],
                ['termination.initiatedBy', 'Kündigende Seite (Schlüssel)', true],
                ['termination.initiatedByLabel', 'Kündigende Seite', true],
                ['termination.receivedOn', 'Kündigung eingegangen am', true],
                ['termination.requestedEndOn', 'Gewünschtes Vertragsende', true],
                ['termination.systemDeterminedEndOn', 'Systemseitiges Vertragsende', true],
                ['termination.confirmedEndOn', 'Bestätigtes Vertragsende', true],
                ['termination.reasonType', 'Kündigungsgrund (Schlüssel)', true],
                ['termination.reasonLabel', 'Kündigungsgrund', true],
                ['termination.reasonText', 'Kündigungsbegründung', true],
                ['termination.note', 'Kündigungsnotiz', true],
            ]),
            ...self::group('Dokument', [
                ['today.date', 'Aktuelles Datum', false],
                ['today.isoDate', 'Aktuelles Datum ISO', false],
                ['today.year', 'Aktuelles Jahr', false],
                ['today.month', 'Aktueller Monat', false],
            ]),
        ];
    }

    /** @return array<int, array<string, mixed>> */
    public static function relations(): array
    {
        return [
            self::relation('partyItems', 'Vertragsparteien', 'Vertragsdaten', 'Alle am Vertrag beteiligten Parteien mit Rolle, Anschrift und Kontakt.', [
                ['roleLabel', 'Rolle'], ['name', 'Name'], ['address', 'Anschrift'], ['email', 'E-Mail'],
            ]),
            self::relation('tenantItems', 'Mieter', 'Vertragsdaten', 'Alle zum maßgeblichen Vertragszeitpunkt aktiven Mieter.', [
                ['name', 'Name'], ['address', 'Anschrift'], ['email', 'E-Mail'], ['phone', 'Telefon'],
            ]),
            self::relation('guarantorItems', 'Bürgen', 'Vertragsdaten', 'Alle Bürgschaftsparteien des Vertrages.', [
                ['name', 'Name'], ['address', 'Anschrift'], ['validFrom', 'Gültig ab'], ['validUntil', 'Gültig bis'],
            ]),
            self::relation('rentConditions', 'Mietkonditionen', 'Finanzen', 'Vollständige Konditionshistorie des Vertrages.', [
                ['validFrom', 'Gültig ab'], ['base', 'Grundmiete'], ['advance', 'Nebenkosten'], ['total', 'Warmmiete'], ['changeReasonLabel', 'Grund'],
            ]),
            self::relation('depositInstallments', 'Kautionsraten', 'Finanzen', 'Fälligkeiten und Status der vereinbarten Kautionsraten.', [
                ['number', 'Rate'], ['amount', 'Betrag'], ['dueDate', 'Fällig am'], ['status', 'Status'],
            ]),
            self::relation('facilities', 'Einrichtungen', 'Einheit', 'Einrichtungen der Einheit mit Bezeichnung und nächster Frist.', [
                ['label', 'Bezeichnung'], ['typeLabel', 'Art'], ['location', 'Ort'], ['dueOn', 'Frist'],
            ]),
            self::relation('meters', 'Zähler', 'Einheit', 'Zähler der Einheit mit Nummer, Typ, Einbauort, letztem bekannten Stand und einem freien Feld für die Ablesung beim Übergabe- oder Rückgabetermin.', [
                ['number', 'Zählernummer'], ['typeLabel', 'Typ'], ['location', 'Einbauort'], ['handoverReading', 'Neuer Stand / Einheit'],
                ['latestReading', 'Letzter Stand'], ['latestReadingDate', 'Stand vom'], ['calibrationUntil', 'Eichfrist'],
            ]),
            self::relation('keys', 'Schlüsselbestand', 'Einheit', 'Schlüsselbestand mit Bestand sowie freien Feldern für die tatsächliche Übergabe oder Rückgabe und Bemerkungen.', [
                ['label', 'Bezeichnung'], ['typeLabel', 'Typ'], ['quantityTotal', 'Bestand'], ['openForContract', 'Offen'],
                ['handoverQuantity', 'Übergeben / zurück'], ['handoverNote', 'Bemerkung'],
            ]),
            self::relation('keyTransfers', 'Schlüsselbewegungen', 'Vertrag', 'Ausgaben und Rückgaben von Schlüsseln im Vertragsverlauf.', [
                ['date', 'Datum'], ['directionLabel', 'Bewegung'], ['keyLabel', 'Schlüssel'], ['partyName', 'Person'], ['quantity', 'Anzahl'],
            ]),
            self::relation('terminations', 'Kündigung / Beendigung', 'Vertrag', 'Kündigungs- oder Beendigungsdaten des Vertrages.', [
                ['typeLabel', 'Art'], ['initiatedByLabel', 'Initiator'], ['receivedOn', 'Eingang'], ['confirmedEndOn', 'Ende'], ['reasonLabel', 'Grund'],
            ]),
            self::relation('directAllocations', 'Direktleistungen', 'Finanzen', 'Direkt dem Vertrag zugeordnete Leistungen und Beträge.', [
                ['serviceDate', 'Datum'], ['title', 'Leistung'], ['referenceNumber', 'Referenz'], ['amount', 'Betrag'],
            ]),
        ];
    }

    /** @return array<int, string> */
    public static function relationSources(): array
    {
        return array_values(array_map(static fn (array $relation): string => (string) $relation['source'], self::relations()));
    }

    /** @return array<int, string> */
    public static function optionalPaths(): array
    {
        return array_values(array_map(
            static fn (array $variable): string => (string) $variable['path'],
            array_filter(self::variables(), static fn (array $variable): bool => (bool) ($variable['optional'] ?? false)),
        ));
    }

    public static function label(string $path): string
    {
        foreach (self::variables() as $variable) {
            if (($variable['path'] ?? null) === $path) return (string) $variable['label'];
        }
        return $path;
    }

    /** @return array<string, mixed> */
    public static function catalog(): array
    {
        return [
            'version' => 5,
            'type' => 'contract-document-data',
            'label' => 'Vertragsdaten',
            'labelPlural' => 'Vertragsdaten',
            'fields' => [],
            'relationships' => [],
            'variables' => self::variables(),
            'relations' => self::relations(),
            'capabilities' => [
                'variables' => true,
                'relationTables' => true,
                'signatureBlocks' => true,
                'flowDocuments' => true,
            ],
        ];
    }

    /** @return array<string, mixed> */
    public function sampleContext(): array
    {
        $tenantA = [
            'id' => 'sample-party-1', 'role' => 'tenant', 'roleLabel' => 'Mieter',
            'partnerId' => 'sample-partner-1', 'partnerNumber' => 'BP-MUSTER001', 'partnerKind' => 'person',
            'name' => 'Erika Beispiel', 'salutation' => 'Frau', 'title' => '', 'firstName' => 'Erika', 'lastName' => 'Beispiel',
            'birthDate' => '14.03.1988', 'registeredName' => '', 'legalForm' => '', 'vatId' => '', 'taxNumber' => '',
            'registrationNumber' => '', 'registrationCourt' => '', 'address' => 'Berliner Straße 17, 60311 Frankfurt am Main',
            'street' => 'Berliner Straße', 'houseNumber' => '17', 'postalCode' => '60311', 'city' => 'Frankfurt am Main',
            'state' => 'Hessen', 'countryCode' => 'DE', 'email' => 'erika.beispiel@example.de', 'phone' => '+49 170 1234567',
            'validFrom' => '01.09.2025', 'validUntil' => '', 'display' => "Erika Beispiel\nBerliner Straße 17, 60311 Frankfurt am Main",
        ];
        $tenantB = [
            ...$tenantA,
            'id' => 'sample-party-2', 'partnerId' => 'sample-partner-2', 'partnerNumber' => 'BP-MUSTER002',
            'name' => 'Max Beispiel', 'salutation' => 'Herr', 'firstName' => 'Max', 'lastName' => 'Beispiel',
            'birthDate' => '19.11.1986', 'email' => 'max.beispiel@example.de',
            'display' => "Max Beispiel\nBerliner Straße 17, 60311 Frankfurt am Main",
        ];
        $guarantor = [
            ...$tenantA,
            'id' => 'sample-party-3', 'role' => 'guarantor', 'roleLabel' => 'Bürge',
            'partnerId' => 'sample-partner-3', 'partnerNumber' => 'BP-MUSTER003',
            'name' => 'Martha Beispiel', 'salutation' => 'Frau', 'firstName' => 'Martha', 'lastName' => 'Beispiel',
            'address' => 'Mainzer Landstraße 100, 60327 Frankfurt am Main', 'street' => 'Mainzer Landstraße',
            'houseNumber' => '100', 'postalCode' => '60327', 'email' => 'martha.beispiel@example.de',
            'display' => "Martha Beispiel\nMainzer Landstraße 100, 60327 Frankfurt am Main",
        ];

        return [
            'organization' => [
                'name' => 'Muster Hausverwaltung GmbH', 'representedBy' => 'Maria Muster',
                'signatureName' => 'Muster Hausverwaltung GmbH, vertreten durch Maria Muster',
                'address' => 'Kaiserstraße 24, 60311 Frankfurt am Main', 'street' => 'Kaiserstraße',
                'houseNumber' => '24', 'postalCode' => '60311', 'city' => 'Frankfurt am Main',
                'email' => 'verwaltung@mustergmbh.de', 'phone' => '+49 69 123456-0',
                'website' => 'www.mustergmbh.de', 'creditorId' => 'DE98ZZZ09999999999',
                'footerText' => 'Muster Hausverwaltung GmbH · Frankfurt am Main',
                'contact' => '+49 69 123456-0 / verwaltung@mustergmbh.de',
                'privacyContact' => "Muster Hausverwaltung GmbH\nKaiserstraße 24, 60311 Frankfurt am Main\n+49 69 123456-0 / verwaltung@mustergmbh.de",
            ],
            'contract' => [
                'id' => 'sample-contract', 'number' => 'MV-2025-000017', 'tenantNumber' => 'MV-2025-000017',
                'type' => 'residential_lease', 'typeLabel' => 'Wohnraummietvertrag', 'status' => 'active', 'statusLabel' => 'Aktiv',
                'termType' => 'indefinite', 'termTypeLabel' => 'Unbefristet', 'concludedOn' => '15.08.2025',
                'startsOn' => '01.09.2025', 'minimumMonths' => 12, 'minimumUntil' => '31.08.2026',
                'fixedUntil' => '', 'fixedReasonType' => '', 'fixedReasonLabel' => '', 'fixedReasonText' => '',
                'rentAdjustmentModel' => 'none', 'rentAdjustmentLabel' => 'Keine automatische Anpassung',
                'handoverOn' => '01.09.2025', 'returnedOn' => '', 'confirmedEndOn' => '',
                'hasPendingTermination' => false, 'isFixed' => false, 'isActive' => true,
            ],
            'property' => [
                'id' => 'sample-property', 'number' => 'BMHS17', 'name' => 'Berliner Musterhaus 17',
                'type' => 'multi_family', 'typeLabel' => 'Mehrfamilienhaus', 'status' => 'active', 'statusLabel' => 'Aktiv',
                'address' => 'Berliner Straße 17', 'postalCode' => '60311', 'city' => 'Frankfurt am Main',
                'fullAddress' => 'Berliner Straße 17, 60311 Frankfurt am Main', 'constructionYear' => 1998,
                'billingPeriod' => '01.01. – 31.12.', 'billingMode' => 'operating_and_heating',
                'billingModeLabel' => 'Betriebs- und Heizkosten', 'heatingType' => 'central', 'heatingTypeLabel' => 'Zentralheizung',
                'heatingBillingType' => 'internal', 'heatingBillingTypeLabel' => 'Intern',
                'billingHeaderText' => 'Betriebskostenabrechnung', 'billingFooterText' => 'Vielen Dank.',
                'sharedUseAreas' => 'Fahrradraum im Erdgeschoss; Waschküche im Untergeschoss; gemeinschaftlicher Garten',
                'sharedUseAreasLabel' => 'Fahrradraum im Erdgeschoss; Waschküche im Untergeschoss; gemeinschaftlicher Garten',
            ],
            'unit' => [
                'id' => 'sample-unit', 'number' => 'W7', 'name' => 'Wohnung 7', 'label' => 'W7 · Wohnung 7 · 2. Etage',
                'type' => 'apartment', 'typeLabel' => 'Wohnung', 'status' => 'active', 'statusLabel' => 'Aktiv',
                'condition' => 'well_maintained', 'conditionLabel' => 'Gepflegt', 'floor' => 2, 'floorLabel' => '2. Etage',
                'area' => '78,50 m²', 'livingArea' => '78,50 m²', 'usableArea' => '82,00 m²', 'heatedArea' => '78,50 m²',
                'billingArea' => '78,50 m²', 'balconyArea' => '6,20 m²', 'roomCount' => '3,0',
                'bedrooms' => 2, 'bathrooms' => 1, 'separateToilet' => true,
                'roomSummary' => '3,0 Zimmer · 1 Bad · separates WC',
                'leaseAncillarySpaces' => 'Kellerabteil Nr. 7',
                'leaseAncillarySpacesLabel' => 'Kellerabteil Nr. 7',
                'operatingCostBillable' => true,
            ],
            'partyItems' => [$tenantA, $tenantB, $guarantor],
            'tenantItems' => [$tenantA, $tenantB],
            'guarantorItems' => [$guarantor],
            'tenant' => $tenantA,
            'tenants' => [
                'all' => "Erika Beispiel\n\nMax Beispiel", 'allWithIds' => "Erika Beispiel (BP-MUSTER001)\nMax Beispiel (BP-MUSTER002)",
                'signatureNames' => 'Erika Beispiel; Max Beispiel', 'count' => 2,
            ],
            'guarantors' => ['all' => 'Martha Beispiel', 'count' => 1],
            'rent' => [
                'base' => '850,00 €', 'operatingAdvance' => '180,00 €', 'heatingAdvance' => '120,00 €',
                'advance' => '300,00 €', 'garage' => '0,00 €', 'parking' => '0,00 €', 'other' => '0,00 €',
                'cold' => '850,00 €', 'total' => '1.150,00 €', 'paymentInterval' => 'monthly', 'paymentIntervalLabel' => 'Monatlich',
                'validFrom' => '01.09.2025', 'validUntil' => '', 'changeReason' => 'contract_start', 'changeReasonLabel' => 'Vertragsbeginn', 'note' => '',
            ],
            'rentConditions' => [[
                'validFrom' => '01.09.2025', 'validUntil' => '', 'base' => '850,00 €', 'operatingAdvance' => '180,00 €',
                'heatingAdvance' => '120,00 €', 'advance' => '300,00 €', 'garage' => '0,00 €', 'parking' => '0,00 €',
                'other' => '0,00 €', 'cold' => '850,00 €', 'total' => '1.150,00 €', 'paymentIntervalLabel' => 'Monatlich',
                'changeReasonLabel' => 'Vertragsbeginn', 'note' => '',
            ]],
            'deposit' => [
                'exists' => true, 'amount' => '2.550,00 €', 'currency' => 'EUR', 'dueFrom' => '01.09.2025',
                'installmentCount' => 3, 'installmentAmount' => '850,00 €', 'status' => 'paid', 'statusLabel' => 'Bezahlt',
                'custodyType' => 'deposit_account', 'custodyTypeLabel' => 'Mietkautionskonto', 'reference' => 'KAUTION-MV-2025-000017',
                'notes' => '', 'interestRelevant' => true, 'interestAmount' => '18,40 €', 'plannedRefundOn' => '',
                'refundedOn' => '', 'refundedAmount' => '0,00 €', 'retainedAmount' => '0,00 €', 'retentionReason' => '',
            ],
            'depositInstallments' => [
                ['number' => 1, 'amount' => '850,00 €', 'dueDate' => '01.09.2025', 'status' => 'paid', 'notes' => ''],
                ['number' => 2, 'amount' => '850,00 €', 'dueDate' => '01.10.2025', 'status' => 'paid', 'notes' => ''],
                ['number' => 3, 'amount' => '850,00 €', 'dueDate' => '01.11.2025', 'status' => 'paid', 'notes' => ''],
            ],
            'bank' => [
                'accountHolder' => 'Muster Hausverwaltung GmbH', 'iban' => 'DE00 0000 0000 0000 0000 00',
                'bic' => 'MUSTERXX', 'name' => 'Musterbank', 'purpose' => 'rent', 'purposeLabel' => 'Mietkonto',
            ],
            'refundBank' => [
                'accountHolder' => 'Erika Beispiel', 'iban' => 'DE11 1111 1111 1111 1111 11',
                'bic' => 'BEISPIELX', 'name' => 'Beispielbank', 'purpose' => 'refund', 'purposeLabel' => 'Gutschriftkonto',
            ],
            'termination' => [
                'exists' => false, 'type' => '', 'typeLabel' => '', 'initiatedBy' => '', 'initiatedByLabel' => '',
                'receivedOn' => '', 'requestedEndOn' => '', 'systemDeterminedEndOn' => '', 'confirmedEndOn' => '',
                'reasonType' => '', 'reasonLabel' => '', 'reasonText' => '', 'note' => '',
            ],
            'terminations' => [],
            'meters' => [[
                'number' => 'STROM-4711', 'type' => 'electricity', 'typeLabel' => 'Strom', 'status' => 'active', 'statusLabel' => 'Aktiv',
                'unit' => 'kWh', 'manufacturer' => 'Muster Meter', 'model' => 'E100', 'location' => 'Flur', 'installationDate' => '12.02.2022',
                'calibrationUntil' => '31.12.2030', 'billingRelevant' => true, 'latestReading' => '12.345,000 kWh', 'latestReadingDate' => '31.12.2025',
                'handoverReading' => '________________ kWh',
            ]],
            'keys' => [[
                'label' => 'Wohnungsschlüssel', 'type' => 'system', 'typeLabel' => 'Systemschlüssel', 'quantityTotal' => 3,
                'issuedForContract' => 2, 'returnedForContract' => 0, 'openForContract' => 2, 'handoverQuantity' => '', 'handoverNote' => '',
            ]],
            'keyTransfers' => [[
                'date' => '01.09.2025', 'direction' => 'issued', 'directionLabel' => 'Ausgabe', 'keyLabel' => 'Wohnungsschlüssel',
                'keyTypeLabel' => 'Systemschlüssel', 'partyName' => 'Erika Beispiel', 'quantity' => 2, 'isTemporary' => false, 'dueBackOn' => '', 'notes' => '',
            ]],
            'facilities' => [[
                'label' => 'Rauchwarnmelder Schlafzimmer', 'type' => 'smoke_detector', 'typeLabel' => 'Rauchwarnmelder',
                'manufacturer' => 'Muster Safety', 'model' => 'S10', 'serialNumber' => 'RW-10001', 'location' => 'Schlafzimmer',
                'status' => 'active', 'statusLabel' => 'Aktiv', 'installedOn' => '15.04.2024', 'expiresOn' => '15.04.2034',
                'nextServiceOn' => '15.04.2027', 'dueOn' => '15.04.2027',
            ]],
            'directAllocations' => [[
                'serviceDate' => '10.01.2026', 'title' => 'Sonderleistung', 'referenceNumber' => 'DL-1001', 'amount' => '45,00 €', 'notes' => '',
            ]],
            'today' => ['date' => now()->format('d.m.Y'), 'isoDate' => now()->format('Y-m-d'), 'year' => now()->format('Y'), 'month' => now()->format('m')],
        ];
    }

    /** @param array<int, array{0:string,1:string,2?:bool,3?:string}> $items */
    private static function group(string $group, array $items): array
    {
        return array_map(static fn (array $item): array => [
            'path' => $item[0],
            'label' => $item[1],
            'group' => $group,
            'optional' => (bool) ($item[2] ?? false),
            'description' => $item[3] ?? null,
            'keywords' => array_values(array_filter([$group, $item[1], $item[0]])),
        ], $items);
    }

    /** @param array<int, array{0:string,1:string}> $columns */
    private static function relation(string $source, string $label, string $group, string $description, array $columns): array
    {
        return [
            'id' => $source,
            'source' => $source,
            'label' => $label,
            'group' => $group,
            'description' => $description,
            'columns' => array_map(static fn (array $column): array => ['key' => $column[0], 'label' => $column[1]], $columns),
        ];
    }
}
