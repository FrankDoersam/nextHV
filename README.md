# nextHV

Hausverwaltung mit Laravel 13, Laravel REST API 3, React 19 und einer wiederverwendbaren CRUD-Oberfläche auf REUI / Base UI. Objekte und physische Einheiten sind von Geschäftspartnern, Verträgen und zeitlichen Konditionen getrennt.

## Lokal starten

Voraussetzungen: PHP **8.3+**, Composer 2, Node **22.12+** (CI: Node 24), SQLite oder eine konfigurierte relationale Datenbank. Benötigte PHP-Erweiterungen: Laravel-Standard einschließlich PDO, passendem Datenbanktreiber, mbstring, fileinfo und OpenSSL.

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

Geldwerte sind im Formular `Currency`-Felder und im JSON Zahlen in Euro, z. B. `1234.56`. Die Datenbank speichert `DECIMAL(12,2)`; es gibt keine Cent-Umrechnung. Maximal zwei Nachkommastellen, keine negativen Beträge. Dies ist noch keine Finanzbuchhaltung oder Zahlungsabstimmung.

### Vertragsablauf

1. Vertragsentwurf zur Einheit anlegen; Laufzeit, Mindestlaufzeit, Frist, Zahlung und Kaution erfassen.
2. Geschäftspartner als Mieter bzw. andere Vertragsbeteiligte zuordnen. Die passende Partnerrolle wird automatisch ergänzt.
3. Eine Kondition ab Vertragsbeginn erfassen. Weitere Stichtage können jährliche Änderungen abbilden.
4. **Vertrag aktivieren**. Die serverseitige Action verlangt Mieter und Anfangskondition und verhindert überlappende verbindliche Verträge derselben Einheit.
5. Spätere Beträge als neue Kondition erfassen. Bereits gültige Konditionen und Beteiligte aktivierter Verträge bleiben historisch erhalten. Vertragsnotizen und Kautionsstatus sind weiter bearbeitbar.
6. Kündigung separat erfassen. Erst **Kündigung bestätigen** setzt in einer Transaktion das bestätigte Vertragsende. Mindestlaufzeit und Kündigungsfrist sind dokumentierte Vertragsangaben; rechtliche Fristberechnung und Zulässigkeitsbewertung werden nicht automatisiert.

Eine Garage erhält einen eigenen Vertrag mit demselben Mieter; `ContractLink` verbindet ihn mit dem Wohnraummietvertrag. Verknüpfungen werden in beiden Richtungen angezeigt. Eine Wohnung zu kündigen beendet einen separaten Garagenvertrag nicht automatisch.

Beim Duplizieren werden nur Objekt-/Einheitenstammdaten kopiert. Verträge, Beteiligte, Kündigungen, Ausweise und Konditionen bleiben beim Original. Es werden deshalb auch keine Mietdaten direkt auf einer Einheit zurückgesetzt.

### Datenintegrität

- Fremdschlüssel, eindeutige Nummern und Konditionsstichtage, Transaktionen und Zeilensperren für Vertragsoperationen.
- Servervalidierung zusätzlich zur Formularvalidierung, inkl. Laufzeiten, Duplikaten und Hauptansprechpartnern.
- Optimistische Versionsprüfung bei CRUD-Updates: `updated_at` wird als `version` übertragen; bei Konflikt antwortet die API mit `409`.
- Löschen und verbindliche Actions verlangen den signierten Bestätigungstoken der API (`428` → Bestätigung → erneute Anfrage).
- Objekte mit Einheiten, Einheiten mit Vertragsgeschichte und aktivierte Verträge werden nicht einfach gelöscht. Stammdatentabellen verwenden Soft Deletes; es gibt in dieser Oberfläche noch keinen Papierkorb.
- Ausweisnummern sind schreibbar, aber nicht lesbar über die API. Nur die letzten vier Zeichen werden angezeigt. Dateien liegen verschlüsselt auf dem privaten Disk; Download nur authentifiziert, ohne Browsercache. Upload: PDF/JPEG/PNG bis 10 MB.

## Architektur

| Verzeichnis                                                | Zuständigkeit                                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `app/Models`                                               | Explizite Eloquent-Modelle, Relationen, Casts                                               |
| `app/Domain/Property/Actions`                              | Klonen, Validierung und Portfolio-Kennzahlen                                                |
| `app/Domain/Contract/Actions`                              | Vertragsvalidierung, Aktivierung und Kündigungsbestätigung                                  |
| `app/Observers`                                            | Integritätsregeln für Modelländerungen                                                      |
| `app/Rest/Resources`                                       | Explizite API-Felder, Validierung, erlaubte Relationen, Versionierung                       |
| `app/Rest/Controllers`                                     | Dünne Controller pro Ressource                                                              |
| `app/Rest/Actions`                                         | REST-Actions mit Zielmenge, Bulk-Limit, Transaktion und Bestätigung                         |
| `app/Policies`, `app/Contracts`, `app/Support/Permissions` | Vorbereiteter, abschaltbarer Permission-Adapter                                             |
| `resources/js/components/ui`                               | Offizielle Base-UI-/shadcn-Primitives                                                       |
| `resources/js/components/reui`                             | Offizielle REUI DataGrid-, Stepper- und TimePicker-Komponenten                              |
| `resources/js/components/blocks`                           | Zentrale AppShell, AuthScreen, Cards, Lists, KPIs, Layout, LazyTabs, Sheet/Dialog           |
| `resources/js/components/fields`                           | Zentrale Currency-, Relations-, Datum-, Monat-, Zeitraum- und Zeitfelder                    |
| `resources/js/framework`                                   | Datenprovider, Auth, Actions, Form-Engine, Tabellen, Workbench, Permissions                 |
| `resources/js/modules`                                     | Fachlich getrennte Ressourcendefinitionen und Domain-Actions; `registry.ts` registriert sie |
| `resources/js/pages`                                       | Zusammensetzung vorhandener Komponenten; keine Seitenstyles                                 |
| `resources/css/app.css`                                    | Zentrale Farben, Typografie, Tokens und Navigation                                          |
| `database`                                                 | Migrationen, Factories und wiederholbare Demodaten                                          |

### CRUD-Konventionen

Eine `ResourceDefinition` beschreibt Felder, Gruppen, Spalten, Suchfilter, Gruppierung, Actions und Relationen. Aus dieser Registrierung entstehen Sidebar, Listen, Detailansichten und Formulare. Fachmodule importieren gemeinsame Feldbausteine aus `modules/fields.ts`.

- Tabellen: serverseitige Suche, Filter, Sortierung und Pagination, auswählbare Spalten, Zeilenauswahl und explizit freigegebene Bulk-Actions. Gruppierung betrifft die aktuell geladene Seite und ist entsprechend beschriftet; sie lädt nicht unbemerkt den gesamten Bestand.
- Formulare: React Hook Form + Zod, serverseitige Fehler an Feldern, Wizard mit Schrittkontrolle und Zurück-Navigation, Warnung bei ungespeicherten Änderungen, Reload bei Versionskonflikten.
- Relationspicker: Datenbanksuche mit Debouncing, Anzeigen bestehender Auswahl, reduzierte Neuanlage im verschachtelten Dialog und automatische Übernahme.
- Relationslisten im Bearbeitungsformular: Suche, Anlegen und Zeilenactions. Änderungen invalidieren die betroffenen Ansichten; Formular-Refresh erhält ungespeicherte Werte.
- Sheet/Dialog ist über die Workbench wählbar und kann pro Aufruf überschrieben werden. Cards besitzen einen Action-Slot oben rechts. `DynamicList` unterstützt Suchprop, eigene Zeilenrenderer, Empty-State und Actions.
- Datum, Monat, Uhrzeit sowie Datum-/Monatsbereiche sind zentrale Komponenten. Die Komponentenseite zeigt sie interaktiv; sie erfindet keine zusätzlichen Datenbankfelder.

Eigene Actions sind Klassen mit `bulk`, `visible`, `fields` und `execute`. Der Kontext enthält die tatsächlichen `rows`, die Ressource und `instance` mit `reload`, `openForm`, `navigate`, optionalem Formular, `refreshForm` und Tabelleninstanz. Beispiel:

```ts
class MyAction extends ResourceAction {
    id = "my-action";
    label = "Meine Aktion";
    bulk = true;

    async execute(
        { rows, resource, instance, values }: ActionContext,
        confirmation?: string,
    ) {
        await dataProvider.action(
            resource.name,
            this.id,
            rows,
            values,
            confirmation,
        );
        instance.form?.setValue("notes", "Aktion ausgeführt", {
            shouldDirty: true,
        });
        await instance.refreshForm?.();
    }
}
```

Die Workbench führt nach erfolgreicher Action den Reload aus. Bei `428` werden Eingaben und ausgewählte Zeilen für die Bestätigung beibehalten. `bulk = false` verhindert die Ausführung mit mehreren Zeilen auch auf Framework-Ebene. Das Backend legt separat `maxResources` fest.

Für eine neue Ressource: Migration und Model mit Relationen erstellen, fachliche Regeln/Actions ergänzen, REST-Resource + Controller + Policy registrieren, Frontend-Definition im Fachmodul anlegen und in `registry.ts` aufnehmen. Nur bei abweichendem fachlichem Verhalten ist eine eigene Seite nötig.

### Erweiterter CRUD-Kern

Die deklarativen Lösch- und Statusfilter, relationale Klonprofile, strukturierte
Action-Rückgaben (Nachricht, Objekt, Navigation) und berechnete Felder sind in
[docs/advanced-crud.md](docs/advanced-crud.md) beschrieben.
[docs/crud-framework.md](docs/crud-framework.md) erläutert die Grundabstraktion;
[docs/crud-roadmap.md](docs/crud-roadmap.md) sammelt die priorisierten
Erweiterungen für Core und UI.

## Objektübersicht

Im Vordergrund stehen monatliche Grundmiete, daraus auf zwölf Monate hochgerechneter Betrag, Belegung, Nebenkosten/Heizung und durchschnittliche laufende Mietdauer. Berechnet wird aus den zum heutigen Tag gültigen Vertragskonditionen; zukünftige Konditionen zählen noch nicht. Die Jahreshochrechnung ist ausdrücklich als Hochrechnung beschrieben und kein Zahlungseingang.

Darunter: schnell erreichbare Einheiten, Auslastung, nächster Prüftermin, Verantwortlicher und kompakte Gebäudedaten. Einheiten und Verträge besitzen eigene Tabs. Relationszählungen können über `countRelation` angezeigt werden, ohne vorher die Zeilen zu laden. Tab-Inhalte werden erst beim Aktivieren eingebunden. **Zähler, detaillierte Prüfungen, Projekte und Zahlungen sind vorbereitete Erweiterungspunkte**, keine implementierten Fachmodule. Der aktuelle Prüftermin gehört zu den Objektstammdaten.

## API und Authentifizierung

Laravel REST API 3 von Lomkit ist installiert, keine handgeschriebene Nachbildung des Pakets. Authentifizierung erfolgt über Laravel-Session und Sanctum mit CSRF-Schutz; Frontend und API laufen unter derselben Origin. Login ist rate-limitiert. OpenAPI/Swagger-Dokumentation unter `/docs/api` ist authentifiziert geschützt.

| Operation            | Endpunkt                                                  |
| -------------------- | --------------------------------------------------------- |
| Session              | `GET /auth/user`, `POST /auth/login`, `POST /auth/logout` |
| Liste / Detailfilter | `POST /api/v1/{resource}/search`                          |
| Erstellen / Ändern   | `POST /api/v1/{resource}/mutate`                          |
| Löschen              | `DELETE /api/v1/{resource}`                               |
| Action               | `POST /api/v1/{resource}/actions/{action}`                |
| Kennzahlen           | `POST /api/v1/properties/metrics/overview`                |
| Private Ausweisdatei | `POST` / `GET /api/v1/identity-documents/{id}/file`       |

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

PHP-Featuretests prüfen Auth, API-Verträge, Seeder, Klonen, Bestätigung, Versionskonflikte, Währungsvalidierung, Belegung, Konditionshistorie, Vertragsgrenzen, Kündigungen, Verknüpfungen, Ausweisschutz und den deaktivierten Permission-Adapter. React-Komponententests prüfen u. a. Wizard, Fehler, Zurück-Navigation, Discard, echte REUI-Tabelle, Suche, Bulk-Auswahl und LazyTabs.

Die GitHub-Action führt diese Prüfungen aus und anschließend einen Playwright-Durchlauf gegen eine **separate** SQLite-Datenbank. Dieser Browserlauf konnte in der Erstellungsumgebung wegen einer Sandbox-Beschränkung nicht lokal ausgeführt werden. Build, PHP- und React-Komponententests wurden lokal ausgeführt.

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
```

`tests/e2e/seed.php` verweigert andere Umgebungen und Datenbanknamen. Sein Zugang ist ausschließlich für diese isolierte Testdatenbank. Für reale Daten den normalen Admin-Befehl verwenden.

## Grundlagen und UI-Quellen

- [Laravel REST API 3 – Ausgangsartikel](https://laravel-news.com/laravel-rest-api-3), [Paket und Dokumentation](https://github.com/Lomkit/laravel-rest-api)
- [Refine Data Provider](https://refine.dev/docs/data/data-provider/): Ressourcen, Provider, Query-Hooks und konsistente Mutationsabläufe
- [REUI](https://reui.io/docs): Base-Nova-Komponenten, DataGrid, Stepper und TimePicker
- [shadcn/ui](https://ui.shadcn.com/docs): Base-Nova-Primitives und Registry-Konvention

Die Registry-URLs der übernommenen Komponenten stehen in `docs/ui-sources.json`. Kostenpflichtige SaaS-Blocks wurden nicht kopiert; die App-Blocks sind eigene Kompositionen auf den öffentlichen Komponenten.
