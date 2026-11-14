# nextHV

Hausverwaltung mit Laravel 13, Laravel REST API 3, React 19 und einer wiederverwendbaren CRUD-Oberfläche auf REUI / Base UI. Objekte und physische Einheiten sind von Geschäftspartnern, Verträgen und zeitlichen Konditionen getrennt.

Das vollständige Entwicklerhandbuch einschließlich der Funktionen aus Basis- und Folgecommit steht in [docs/framework.md](docs/framework.md). Dort sind auch Erweiterungsbeispiele, Action-Rückgaben, Direktlinks, Tabellen-Props und die priorisierte Weiterentwicklung dokumentiert.

Das [Framework-Konzept und der Refine-Vergleich](docs/framework-readiness.md) dokumentieren die Architektur, die Verbesserungen und die noch offenen Freigabekriterien. Der aktuelle Stand ist ein Entwicklungsframework; eine allgemeine Produktionsfreigabe, insbesondere für Mehrmandantenbetrieb, ist damit nicht zugesagt.

## Lokal starten

Voraussetzungen: PHP **8.3+**, Composer 2, Node **22.12+** (CI: Node 24/PHP 8.5), SQLite oder eine konfigurierte relationale Datenbank. Benötigte PHP-Erweiterungen: Laravel-Standard einschließlich PDO, passendem Datenbanktreiber, mbstring, fileinfo und OpenSSL.

```bash
composer install
cp .env.example .env
php artisan key:generate
# Bei SQLite einmalig die Datenbankdatei anlegen:
touch database/database.sqlite
php artisan migrate
npm ci
npm run build
php artisan db:seed --class=PropertySeeder
php artisan nexthv:admin deine.email@example.de
php artisan serve
```

`nexthv:admin` fragt das Passwort verdeckt ab; es gibt keinen fest eingebauten Benutzer. Danach `http://localhost:8000` öffnen. Für Frontend-Entwicklung zusätzlich `npm run dev` starten. `APP_KEY` nach dem ersten Einrichten beibehalten: Ausweisnummern und Dateien sind damit verschlüsselt.

**Seeder:**

```bash
php artisan db:seed --class=PropertySeeder
```

Auf einer leeren Datenbank entstehen **10 Objekte mit jeweils 5 Einheiten**: Wohnungen, je eine Garage und zusätzlich Gewerbe oder Stellplatz. Dazu kommen fiktive Geschäftspartner, Mietverträge, zwei Konditionsstände pro vermietetem Vertrag und verknüpfte Garagenverträge. Die Garage verwendet denselben Geschäftspartner wie die zugehörige Wohnung. Der Seeder ist wiederholbar und überschreibt vorhandene Datensätze nicht. Bei bestehenden eigenen Datensätzen wird natürlich nicht die gesamte Datenbank auf 10 Objekte reduziert.

## Fachmodell

| Modell / Tabelle                            | Verantwortung                                                                                                                                                                                |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Property` / `properties`                   | Objektnummer, Name, Nutzung, Verwaltungsart, Adresse, Baujahr, Grundstück, Energie, Ansprechpartner, Verwaltungsbeginn, nächster Prüftermin, Notizen                                         |
| `Unit` / `units`                            | Genau ein Objekt; objektspezifisch eindeutige Nummer, Typ, Bezeichnung, Etage, Fläche, Zimmer, Balkon, Barrierefreiheit, physischer Zustand                                                  |
| `BusinessPartner` / `business_partners`     | Person oder Unternehmen; Stammdaten, Kontakt, Adresse und Notizen                                                                                                                            |
| `PartnerRole` / `partner_roles`             | Mehrere Rollen pro Geschäftspartner, z. B. Mieter, Eigentümer, Bürge, Dienstleister                                                                                                          |
| `Contract` / `contracts`                    | Genau eine Einheit; Vertragsart, Entwurf/aktiv/beendet, Unterzeichnung, Beginn/Ende, Mindestlaufzeit, Kündigungsfrist und Kündigungsperiode, Fälligkeit, Kaution und Kautionsstatus, Notizen |
| `ContractParty` / `contract_parties`        | Geschäftspartner ↔ Vertrag mit Rolle und einem Hauptansprechpartner pro Rolle; mehrere Mieter und mehrere Verträge pro Mieter möglich                                                        |
| `RentCondition` / `rent_conditions`         | Vertrag + eindeutiger Gültigkeitsbeginn; Grundmiete, Nebenkosten, Heizkosten, Umsatzsteuer, Anlass. Ein Stand gilt bis zum nächsten Stand                                                    |
| `IdentityDocument` / `identity_documents`   | Eigene Relation zum Geschäftspartner; Dokumentart, Bezeichnung, verschlüsselte Nummer, letzte vier Zeichen, Land, Ablauf- und Prüfdatum, private verschlüsselte Datei                        |
| `TerminationNotice` / `termination_notices` | Eigene Relation zum Vertrag; Art, erklärende Seite, Erklärungs-/Eingangsdatum, gewünschtes/bestätigtes Ende, Eingangsweg, Grund, Notizen, Status                                             |
| `ContractLink` / `contract_links`           | Zwei eigenständige Verträge: Zusatz-, Nachfolge- oder sonstiger Zusammenhang, mit Notiz                                                                                                      |

Eine Einheit enthält **keinen Mieternamen, Mietbeginn, Mietende oder Mietpreis**. Belegung und Einnahmen ergeben sich aus den Verträgen. `ready` und `maintenance` beschreiben nur den physischen Zustand. Ein beendeter Vertrag mit zukünftigem Enddatum zählt bis einschließlich dieses Datums weiterhin als laufend.

Geldwerte sind im Formular `Currency`-Felder mit formatierter Zahl und separat angezeigtem, nicht bearbeitbarem `EUR`-Suffix; im JSON bleiben sie Zahlen in Euro, z. B. `1234.56`. Die Datenbank speichert `DECIMAL(12,2)`; es gibt keine Cent-Umrechnung. Maximal zwei Nachkommastellen, keine negativen Beträge. Dies ist noch keine Finanzbuchhaltung oder Zahlungsabstimmung.

### Vertragsablauf

1. Vertragsentwurf zur Einheit erfassen; Laufzeit, Mindestlaufzeit, Frist, Zahlung und Kaution eintragen.
2. Im selben Formular mehrere Geschäftspartner als Mieter oder weitere Beteiligte hinzufügen. Die Felder stammen aus der vorhandenen Beteiligten-Resource; die passende Partnerrolle wird beim Speichern automatisch ergänzt.
3. Eine oder mehrere Konditionen ab Vertragsbeginn erfassen. **Speichern** legt Vertrag, Beteiligte und Konditionen mit einer nativen REST-Mutation atomar an. Es gibt im Standardablauf keine gespeicherten Zwischenschritte; ein Fehler rollt alle diese Änderungen zurück. Weitere Stichtage können jährliche Änderungen abbilden.
4. **Vertrag aktivieren**. Die serverseitige Action verlangt Mieter und Anfangskondition und verhindert überlappende verbindliche Verträge derselben Einheit.
5. Spätere Beträge als neue Kondition erfassen; bereits gültige Konditionen aktivierter Verträge bleiben historisch geschützt. Beteiligte sind auch bei aktiven und beendeten Verträgen bearbeitbar. Ein aktiver Vertrag muss mindestens einen Mieter behalten; Duplikat- und Hauptkontaktregeln gelten weiterhin. Eine zeitliche Beteiligtenhistorie ist nicht implementiert. Vertragsnotizen und Kautionsstatus bleiben bearbeitbar.
6. Kündigung separat erfassen. Erst **Kündigung bestätigen** setzt in einer Transaktion das bestätigte Vertragsende. Mindestlaufzeit und Kündigungsfrist sind dokumentierte Vertragsangaben; rechtliche Fristberechnung und Zulässigkeitsbewertung werden nicht automatisiert.

Eine Garage erhält einen eigenen Vertrag mit demselben Mieter; `ContractLink` verbindet ihn mit dem Wohnraummietvertrag. Verknüpfungen werden in beiden Richtungen angezeigt. Eine Wohnung zu kündigen beendet einen separaten Garagenvertrag nicht automatisch.

Beim Duplizieren werden nur Objekt-/Einheitenstammdaten kopiert. Verträge, Beteiligte, Kündigungen, Ausweise und Konditionen bleiben beim Original. Es werden deshalb auch keine Mietdaten direkt auf einer Einheit zurückgesetzt.

### Datenintegrität

- Fremdschlüssel, eindeutige Nummern und Konditionsstichtage, Transaktionen und Zeilensperren für Vertragsoperationen.
- Ein serverseitiges Regelwerk für Formulare und API, inkl. Laufzeiten, Duplikaten und Hauptansprechpartnern; Wizard-Schritte prüfen über Laravel Precognition vor dem Weitergehen.
- Optimistische Versionsprüfung bei CRUD-Updates: `updated_at` wird als `version` übertragen; bei Konflikt antwortet die API mit `409`.
- Löschen: einmal im Dialog bestätigen, ein DELETE ohne Vorprüfung/Token, Backend-Fehler direkt im selben Dialog. Verbindliche Fachaktionen wie Vertragsaktivierung behalten ihren signierten API-Handshake im Action-Adapter.
- Aktive Objekte sowie Objekte mit Einheiten (auch gelöschten), Einheiten mit Vertragsgeschichte und aktivierte Verträge werden nicht einfach gelöscht. Stammdatentabellen verwenden Soft Deletes; es gibt in dieser Oberfläche noch keinen Papierkorb.
- Ausweisnummern sind schreibbar, aber nicht lesbar über die API. Nur die letzten vier Zeichen werden angezeigt. Dateien liegen verschlüsselt auf dem privaten Disk; Download nur authentifiziert, ohne Browsercache. Upload: PDF/JPEG/PNG bis 10 MB.

## Architektur

| Verzeichnis                                                | Zuständigkeit                                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `app/Models`                                               | Explizite Eloquent-Modelle, Relationen, Casts                                               |
| `app/Domain/Property/Actions`                              | Klonen, Validierung und Portfolio-Kennzahlen                                                |
| `app/Domain/Contract/Actions`                              | Vertragsvalidierung, Aktivierung und Kündigungsbestätigung                                  |
| `app/Observers`                                            | Integritätsregeln für Modelländerungen                                                      |
| `app/Rest/Resources`, `app/Rest/Ui`, `config/ui.php`       | API-Felder, Regeln, Relationen, Versionierung; native Ressourcenmetadaten und Optionslabels |
| `app/Rest/Controllers`                                     | Dünne Controller pro Ressource                                                              |
| `app/Rest/Actions`                                         | REST-Actions mit Zielmenge, Bulk-Limit, Transaktion und Bestätigung                         |
| `app/Policies`, `app/Contracts`, `app/Support/Permissions` | Vorbereiteter, abschaltbarer Permission-Adapter                                             |
| `resources/js/components/ui`                               | Offizielle Base-UI-/shadcn-Primitives                                                       |
| `resources/js/components/reui`                             | Offizielle REUI DataGrid-, Stepper-, TimePicker-, NumberField- und Alert-Komponenten        |
| `resources/js/components/blocks`                           | Zentrale AppShell, AuthScreen, Cards, Lists, KPIs, Layout, LazyTabs, Sheet/Dialog           |
| `resources/js/components/fields`                           | Zentrale Currency-, Relations-, Datum-, Monat-, Zeitraum- und Zeitfelder                    |
| `resources/js/framework`                                   | Datenprovider, Auth, Actions, Form-Engine, Tabellen, Workbench, Permissions                 |
| `resources/js/modules`                                     | Fachlich getrennte Ressourcendefinitionen und Domain-Actions; `registry.ts` registriert sie |
| `resources/js/pages`                                       | Zusammensetzung vorhandener Komponenten; keine Seitenstyles                                 |
| `resources/css/app.css`                                    | Zentrale Farben, Typografie, Tokens und Navigation                                          |
| `database`                                                 | Migrationen, Factories und wiederholbare Demodaten                                          |

### CRUD-Konventionen

Eine `ResourceDefinition` beschreibt UI-Felder, Gruppen, Spalten, Views, Actions und Relationslisten. Aus dieser Registrierung entstehen Sidebar, Listen, Detailansichten und Formulare. Der authentifizierte native Details-Endpunkt der PHP-Resource liefert Enums, Relationsziele, Picker-Suchfilter, erlaubte Filteroperatoren und Eingabehinweise. `ResourceSchemaProvider` ergänzt die Registry vor dem ersten Formular; Optionen und Relationsziele werden nicht nochmals in TypeScript gepflegt. Fachmodule verwenden etwa `select("status", "Status")` und `relation("property_id", "Objekt")` aus `modules/fields.ts`. Darstellung, Layout und React-Renderer bleiben im Frontend.

- Tabellen: serverseitige Suche, Filter, Sortierung und Pagination, Query-Tabs mit optionalen Zählern und getrennt abschaltbare Filter/Gruppierung. Relationssuche, etwa nach einem Objekt, öffnet sich über **Filter → Objekt**. Direkte Toolbar-Filter bleiben eine optionale Framework-API; die aktuellen Module verwenden sie nicht. Spalten unterstützen Avatargruppen, Tags, Icon/Text, Unterzeilen und einen eigenen Exportwert. Die aktuellen Module erlauben als Bulk-Action ausschließlich Löschen.
- Tabellenlayout: ein nativer vertikaler Viewport mit fixiertem Kopf, dauerhaftem Footer und stabiler Höhe bei Auswahl oder Leerzustand. Bei schmalen Containern erscheinen alle sichtbaren Spalten als beschriftete Datensatzwerte; horizontales Scrollen entfällt. Gruppierung und Auswahl betreffen die geladene Seite.
- Formulare: React Hook Form und Laravel-Fachvalidierung, deutsche Feldfehler, horizontaler Header-Wizard, klappbare Gruppen, Dirty-Check und Reload bei Versionskonflikten. `createRelations` bindet wiederholbare Unterdatensätze aus bestehenden Resource-Feldern ein. Objekt- und Vertragswizard zeigen keine zusätzliche Zusammenfassung; die Zahlungskarte im Vertrags-Edit bleibt. Zod bleibt ausschließlich in der isolierten Komponentendemo.
- Suchbare Select-/Entity-Picker: `multiple`, `clearable`, Backend-Filter, anpassbare Titel/Subtexte und abschaltbare Neuanlage. Datumspicker erlauben freie Eingabe in `TT.MM.JJJJ` sowie Kalenderwahl; Format, Min-/Max-Grenzen und Bereichsreihenfolge werden am Control geprüft, die fachliche Gültigkeit weiterhin im Backend.
- Key-Value-Liste mit einzelnen versionsgeprüften Mutationen; Checkbox-Listen/-Karten und direkte boolesche Änderungen. Editieren aktualisiert standardmäßig nur die betroffene Cache-Zeile.
- PDF-Anzeige über den Browser in einer React-Komponente, ohne zusätzliche PDF-Frontendbibliotheken. Geschützter Abruf und Download bleiben erhalten.

- Relationspicker: Datenbanksuche mit Debouncing, Anzeigen bestehender Auswahl, reduzierte Neuanlage im verschachtelten Dialog und automatische Übernahme.
- Relationslisten im Bearbeitungsformular: Suche, Anlegen und Zeilenactions. Änderungen invalidieren die betroffenen Ansichten; Formular-Refresh erhält ungespeicherte Werte.
- Sheet/Dialog wird über `presentation` pro Workbench-Aufruf konfiguriert; `collection.viewMode` steuert, ob ein Datensatzlink eine Page, ein lesendes Sheet oder einen Dialog öffnet. Die echte View-Ansicht bietet Key-Value-Werte und abschnittsweises Bearbeiten im selben Panel. Es gibt keine Darstellungs-Umschaltbuttons in den Listen.
- `PageWrapper` hält Dashboard, Akten und Tabs auf derselben Inhaltsbreite. Gemeinsame REUI-Frames bilden Cards, Formulargruppen und Key-Value-Karten; Actions stehen in den zentralen Slots. `DynamicList` unterstützt Suche, eigene Zeilenrenderer, Empty-State und Actions. Der Login ist eine zentrierte Karte vor einem lokal ausgelieferten Wohngebäude-Bild, ohne zusätzliches Logo und äußeren Footer.
- Datum, Monat, Uhrzeit sowie Datum-/Monatsbereiche sind zentrale Komponenten. Die Komponentenseite zeigt sie interaktiv; sie erfindet keine zusätzlichen Datenbankfelder.

Eigene Actions sind Klassen mit `bulk`, `visible`, `fields` und `execute`. Der Kontext enthält die tatsächlichen `rows`, die Ressource und `instance` mit `reload`, `openForm`, `navigate`, optionalem Formular, `refreshForm` und Tabelleninstanz. Beispiel:

```ts
class MyAction extends ResourceAction {
    id = "my-action";
    label = "Meine Aktion";
    bulk = true;

    async execute({ rows, resource, instance, values }: ActionContext) {
        await dataProvider.action(resource.name, this.id, rows, values);
        instance.form?.setValue("notes", "Aktion ausgeführt", {
            shouldDirty: true,
        });
        await instance.refreshForm?.();
    }
}
```

Die Workbench führt nach erfolgreicher Action den Reload aus. Nach einer ausdrücklichen Bestätigung im Action-Dialog vervollständigt das Framework den `428`-Token-Ablauf automatisch mit denselben Eingaben und Zeilen. Eine zweite Rückfrage entfällt; Fehler bleiben im Dialog. `bulk = false` verhindert die Ausführung mit mehreren Zeilen auch auf Framework-Ebene. Das Backend legt separat `maxResources` fest.

Für eine neue Ressource: Migration und Model mit Relationen erstellen, fachliche Regeln/Actions ergänzen, REST-Resource + Controller + Policy registrieren, Frontend-Definition im Fachmodul anlegen und in `registry.ts` aufnehmen. Nur bei abweichendem fachlichem Verhalten ist eine eigene Seite nötig.

## Objektübersicht

Im Vordergrund stehen monatliche Grundmiete, daraus auf zwölf Monate hochgerechneter Betrag, Belegung, Nebenkosten/Heizung und durchschnittliche laufende Mietdauer. Berechnet wird aus den zum heutigen Tag gültigen Vertragskonditionen; zukünftige Konditionen zählen noch nicht. Die Jahreshochrechnung ist ausdrücklich als Hochrechnung beschrieben und kein Zahlungseingang.

Darunter: schnell erreichbare Einheiten, Auslastung, nächster Prüftermin, Verantwortlicher und kompakte Gebäudedaten. Einheiten und Verträge besitzen eigene Tabs. Relationszählungen können über `countRelation` angezeigt werden, ohne vorher die Zeilen zu laden. Tab-Inhalte werden erst beim Aktivieren eingebunden. **Zähler, detaillierte Prüfungen, Projekte und Zahlungen sind vorbereitete Erweiterungspunkte**, keine implementierten Fachmodule. Der aktuelle Prüftermin gehört zu den Objektstammdaten.

## API und Authentifizierung

Laravel REST API 3 von Lomkit ist installiert, keine handgeschriebene Nachbildung des Pakets. Authentifizierung erfolgt über Laravel-Session und Sanctum mit CSRF-Schutz; Frontend und API laufen unter derselben Origin. Login ist rate-limitiert. OpenAPI/Swagger-Dokumentation unter `/docs/api` ist authentifiziert geschützt.

| Operation              | Endpunkt                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| Session                | `GET /auth/user`, `POST /auth/login`, `POST /auth/logout`                                          |
| Ressourcenbeschreibung | `GET /api/v1/{resource}?with=fields.capabilities,fields.filter,fields.rules,fields.meta,relations` |
| Liste / Detailfilter   | `POST /api/v1/{resource}/search`                                                                   |
| Erstellen / Ändern     | `POST /api/v1/{resource}/mutate`                                                                   |
| Löschen                | `DELETE /api/v1/{resource}`                                                                        |
| Action                 | `POST /api/v1/{resource}/actions/{action}`                                                         |
| Kennzahlen             | `POST /api/v1/properties/metrics/overview`                                                         |
| Private Ausweisdatei   | `POST` / `GET /api/v1/identity-documents/{id}/file`                                                |

Ressourcen: `properties`, `units`, `business-partners`, `partner-roles`, `contracts`, `contract-parties`, `rent-conditions`, `identity-documents`, `termination-notices`, `contract-links`.

```json
{
    "search": {
        "text": { "value": "Linden" },
        "filters": [{ "field": "city", "value": "Berlin" }],
        "sorts": [{ "field": "name", "direction": "asc" }],
        "aggregates": [{ "relation": "units", "type": "count" }],
        "page": 1,
        "limit": 25
    }
}
```

Der Datenprovider kapselt die Lomkit-Protokolle für Search, Mutation, Actions, Fehler und Bestätigung. Refine-inspiriert sind Ressourcenregistrierung, Provider, Hooks, Cache-Invalidierung und Action-Kontext; Refine selbst wird nicht als zweite Laufzeit eingebaut. UI-Verhalten und Zugänglichkeit basieren auf REUI, Base UI, TanStack Table und vorhandenen Formbibliotheken.

**Bewusst verschoben:** Organisationsgrenzen und das Berechtigungsmodell. `PERMISSIONS_ENABLED=false` überspringt den Adapter vollständig; das ist durch Tests abgesichert. Die Anmeldung bleibt erforderlich. Alle angemeldeten Benutzer teilen aktuell denselben Verwaltungsbestand. Vor Aktivierung den `AllowAllAdapter` durch die tatsächliche Berechtigungsimplementierung ersetzen und passende Ressourcengrenzen ergänzen. Die gesonderte Sollwert-Kennzeichnung ist ebenfalls verschoben.

## Prüfungen

```bash
php artisan test --compact
php artisan rest:check
composer validate --strict
npm test
npm run build
```

PHP-Featuretests prüfen Auth, API-Verträge, Seeder, Klonen, Bestätigung, Versionskonflikte, Währungsvalidierung, atomare Vertragsanlage mit Unterdatensätzen und Rollback, lokalisierte Feldfehler, Belegung, Konditionshistorie, Vertragsgrenzen, Kündigungen, Verknüpfungen, Ausweisschutz und den deaktivierten Permission-Adapter. React-Komponententests prüfen u. a. Wizard, Fehler, Zurück-Navigation, Discard, echte REUI-Tabelle, Suche, Bulk-Auswahl und LazyTabs.

Die GitHub-Action führt diese Prüfungen und einen Playwright-Durchlauf gegen eine **separate** SQLite-Datenbank aus. Die Ergebnisse des jeweiligen Jobs und seine Browserdiagnostik sind maßgeblich; ein fehlgeschlagener Browserstart ersetzt keine visuelle Prüfung.

Browserprüfung lokal, nur mit einer eigens dafür angelegten Testdatenbank:

```bash
export APP_ENV=testing
export DB_DATABASE="$PWD/database/e2e.sqlite"
touch "$DB_DATABASE"
php artisan migrate --force
php artisan db:seed --class=PropertySeeder --force
php tests/e2e/seed.php
npm run build
npx playwright install chromium
npm run test:e2e
npm run screenshots
```

`tests/e2e/seed.php` verweigert andere Umgebungen und Datenbanknamen. Sein Zugang ist ausschließlich für diese isolierte Testdatenbank. Für reale Daten den normalen Admin-Befehl verwenden.

Der separate Workflow **Workspace screenshots** erzeugt bei Push auf `main` oder manuell echte PNG-Aufnahmen der in `tests/e2e/screenshots.spec.ts` definierten Ansichten, darunter Dashboard, Vertragsliste, Vertragsakte, Anlage und Bearbeitung. Artefakt: `workspace-screenshots`, Aufbewahrung 14 Tage. Ein vorhandenes Artefakt allein belegt keinen erfolgreichen Gesamtlauf; bereits erstellte Bilder werden auch bei späteren Testfehlern veröffentlicht. Details und sämtliche Framework-Props: [docs/framework.md](docs/framework.md).

## Grundlagen und UI-Quellen

- [Laravel REST API 3 – Ausgangsartikel](https://laravel-news.com/laravel-rest-api-3), [Paket und Dokumentation](https://github.com/Lomkit/laravel-rest-api)
- [Refine Data Provider](https://refine.dev/docs/data/data-provider/): Ressourcen, Provider, Query-Hooks und konsistente Mutationsabläufe
- [REUI](https://reui.io/docs): Base-Nova-Komponenten, DataGrid, Stepper und TimePicker
- [shadcn/ui](https://ui.shadcn.com/docs): Base-Nova-Primitives und Registry-Konvention

Die Registry-URLs der übernommenen Komponenten stehen in `docs/ui-sources.json`. Kostenpflichtige SaaS-Blocks wurden nicht kopiert; die App-Blocks sind eigene Kompositionen auf den öffentlichen Komponenten.
