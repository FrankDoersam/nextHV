# nextHV · Framework- und Fachmodell-Handbuch

Dieses Dokument beschreibt den Basiscommit `a34d08f3907b8955160ae271797b88accc1b83f0` und dessen vorliegenden Folgecommit. Es ist die Anleitung zum Bauen weiterer CRUD-Fachmodule. Die bestehenden öffentlichen REUI-Komponenten bleiben die UI-Grundlage; Refine und Filament dienen als Architekturvorbilder, werden nicht zusätzlich als Laufzeit installiert.

## 1. Einstieg und Betriebsmodell

- Laravel 13 + `lomkit/laravel-rest-api` 3, Sanctum-Session, Scramble/OpenAPI.
- React 19, React Router 7, TanStack Query, TanStack Table 9, React Hook Form, Zod.
- REUI Base Nova, Base UI, Tailwind 4; gemeinsame Farben und Abstände in `resources/css/app.css` und zentralen Komponenten.
- PHP 8.3+, Composer 2, Node 22.12+; CI verwendet Node 24/PHP 8.3. SQLite für lokale Entwicklung und Tests.
- `setasign/tfpdf` erzeugt Unicode-PDFs; keine externe PDF-Website und kein HTML-Renderer erforderlich.

Installation und Admin-Anlage stehen im [README](../README.md). Für ein bestehendes Checkout nach diesem Update:

```bash
composer install
npm ci
php artisan migrate
npm run build
```

Demodaten:

```bash
php artisan db:seed --class=PropertySeeder
```

Der wiederholbare Seeder erzeugt auf leerer Datenbank 10 Objekte mit je 5 Einheiten, darunter Wohnungen und Garagen sowie Gewerbe oder Stellplätze. Dazu gehören fiktive Geschäftspartner, Mieterrollen, Verträge, historische Konditionen und verknüpfte Garagenverträge. Bestehende eigene Daten bleiben erhalten. Es gibt keinen fest eingebauten produktiven Login; `php artisan nexthv:admin deine.email@example.de` legt ihn mit verdeckter Passwortabfrage an.

**Bewusst verschoben:** Organisationsgrenzen und die spezielle Sollwert-Kennzeichnung. Bei `PERMISSIONS_ENABLED=false` wird der Permission-Adapter überhaupt nicht aufgerufen. Die Anmeldung ist weiterhin zwingend; angemeldete Benutzer teilen aktuell denselben Bestand. Der Adapter ist noch kein ausgearbeitetes Rollenmodell.

## 2. Architektur und Verantwortlichkeiten

| Ebene                 | Ort                                                          | Aufgabe                                                                                       |
| --------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Datenmodell           | `app/Models`, `database/migrations`                          | Tabellen, Fremdschlüssel, Indizes, Casts, explizite Relationen                                |
| Fachaktionen          | `app/Domain/Property/Actions`, `app/Domain/Contract/Actions` | Fachliche Änderungen, Klonen, Vertragsregeln, Kennzahlen, PDF-Erstellung                      |
| Integrität            | `app/Observers`                                              | Regeln auch bei Modelländerungen außerhalb eines einzelnen REST-Endpunkts                     |
| REST-Schema           | `app/Rest/Resources`                                         | Felder, Regeln, Relationen, Versionen, Actions, berechnete Werte                              |
| REST-Actions          | `app/Rest/Actions`                                           | Autorisierung, Einzel-/Bulk-Ziel, Bestätigung, Übergabe an Fachaktionen, Ergebnisvertrag      |
| Zusätzliche Endpunkte | `app/Http/Controllers`                                       | Login, private Dokumente, Clone-Defaults, Löschvorprüfung, PDF-Abruf                          |
| UI-Primitives         | `resources/js/components/ui`                                 | Offizielle Base-UI-/shadcn-Bausteine                                                          |
| REUI                  | `resources/js/components/reui`                               | Öffentliche REUI-Quellen, einschließlich DataGrid, Stepper, TimePicker, NumberField und Alert |
| App-Blöcke            | `resources/js/components/blocks`                             | AppShell, Cards, Listen, KPIs, Overlay, Layout, Auth, LazyTabs                                |
| Formularfelder        | `resources/js/components/fields`                             | BaseField, ResourceField, CurrencyField, MultiSelect, Picker                                  |
| CRUD-Laufzeit         | `resources/js/framework`                                     | Provider, Hooks, Form-Engine, Workbench, Actions, Navigation, Tabellen                        |
| Fachkonfiguration     | `resources/js/modules`                                       | Ressourcen, Felder, Spalten, Relationslisten, fachliche UI-Actions                            |
| Seiten                | `resources/js/pages`                                         | Zusammensetzung der Komponenten ohne eigene Styles                                            |

Der Ablauf einer Änderung lautet: Formular → Datenprovider → REST-Resource → Fachaktion/Observer → Model → API-Antwort → Cache-Invalidierung → UI. Darstellung, API-Protokoll und Fachregeln haben jeweils einen eindeutigen Ort.

## 3. Fachmodell aus dem Basiscommit

| Modell              | Fachliche Verantwortung                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Property`          | Nummer, Name, Adresse, Nutzung, Verwaltungsart, Status, Baujahr, Grundstück, Energie, Ansprechpartner, Verwaltungsbeginn, nächster Prüftermin, Notizen |
| `Unit`              | Genau ein Objekt; objektspezifische Nummer, Typ, Etage, Fläche, Zimmer, Balkon, Barrierefreiheit, physischer Zustand                                   |
| `BusinessPartner`   | Person oder Firma, Namen, Kontakt, Adresse, Geburtsdatum, Notizen                                                                                      |
| `PartnerRole`       | Mehrere Rollen pro Partner: Mieter, Eigentümer, Dienstleister, Bürge usw.                                                                              |
| `Contract`          | Genau eine Einheit; Art, Status, Laufzeit, Unterzeichnung, Mindestlaufzeit, Kündigungsfrist/-periode, Fälligkeit, Kaution/-status, Notizen             |
| `ContractParty`     | Mehrere Geschäftspartner je Vertrag mit Rolle und Hauptansprechpartner                                                                                 |
| `RentCondition`     | Historische Beträge je Vertrag und eindeutigem Gültigkeitsbeginn; Grundmiete, Nebenkosten, Heizung, USt., Anlass                                       |
| `TerminationNotice` | Separate Kündigungsrelation: Art, erklärende Seite, erklärt/eingegangen, gewünschtes/bestätigtes Ende, Weg, Grund, Status, Notizen                     |
| `ContractLink`      | Verknüpft eigenständige Verträge, etwa Wohnung und Garage; Relation ist in beiden Richtungen sichtbar                                                  |
| `IdentityDocument`  | Separate Ausweisrelation zum Partner: Art, verschlüsselte Nummer, letzte vier Zeichen, Land, Ablauf-/Prüfdatum und private Datei                       |

Einheiten enthalten keine Mieternamen, Mietlaufzeiten oder Mietkonditionen. Derselbe Partner kann Wohnung und Garage mit separaten Verträgen mieten. Kündigung eines Vertrages beendet einen verknüpften Vertrag nicht automatisch.

Konditionen gelten ab ihrem Stichtag bis zum nächsten Stand. Neue Jahresbeträge werden als neuer Stand angelegt. Die Aktivierung verlangt Mieter und Anfangskondition und verhindert überlappende verbindliche Verträge derselben Einheit. Bereits gültige Konditionen aktivierter Verträge werden historisch geschützt. Ein Vertrag mit künftigem bestätigtem Ende zählt bis zu diesem Datum weiter zur Belegung.

Kündigungen werden zunächst erfasst; erst die bestätigte Backend-Action setzt das Vertragsende. Die erfassten Fristen sind Vertragsangaben. Eine rechtliche Bewertung oder automatische Berechnung gesetzlicher Kündigungsfristen ist nicht implementiert.

Ausweisnummern sind verschlüsselt und schreibbar, aber nicht über die API auslesbar; angezeigt werden nur die letzten vier Zeichen. Dateien werden privat und verschlüsselt gespeichert. PDF/JPEG/PNG bis 10 MB, authentifizierter Download ohne Cache. `APP_KEY` muss dauerhaft erhalten bleiben.

## 4. Ressourcen schnell ergänzen

1. Migration, Model, Relationen und gegebenenfalls Enum anlegen.
2. Fachregeln in eine Domain-Action; relevante Invarianten über Observer absichern.
3. REST-Resource, Controller und Policy erstellen; Route unter `api/v1` registrieren.
4. Frontend-Definition im passenden Fachordner anlegen und in `modules/registry.ts` aufnehmen.
5. Standardseiten verwenden; nur für fachliche Abweichungen eigene Blöcke ergänzen.
6. API-Verhalten und wichtige UI-Abläufe prüfen.

Beispiel einer UI-Definition, an vorhandenen Modellfeldern orientiert:

```ts
export const resource: ResourceDefinition = {
    name: "properties",
    label: "Objekte",
    singular: "Objekt",
    description: "Stammdaten und Einheiten verwalten.",
    icon: Building2,
    navigationGroup: "Stammdaten",
    titleField: "name",
    fields: [
        { name: "name", label: "Bezeichnung", required: true, maxLength: 160 },
        { name: "notes", label: "Notizen", kind: "textarea", maxLength: 10000 },
    ],
    columns: [
        { field: "name", label: "Objekt" },
        { field: "full_address", label: "Adresse", sortable: false },
    ],
    actions: [
        new EditAction(),
        new InspectPropertyAction(),
        new DeleteAction(),
    ],
    deletionCheck: true,
};
```

Die Registrierung erzeugt Menüeinträge, Listen-, Detail- und Formularansichten. `navigation: false` unterdrückt nur den Menüeintrag; eine Ressource bleibt für Relationslisten und Direktlinks verfügbar. `navigationGroup` erzeugt aufklappbare Bereiche, aktuell Stammdaten, Vermietung und Dokumente. Berechtigungsprüfungen laufen über den zentralen abschaltbaren Adapter.

## 5. Einheitliche Feldkomponenten

Jedes `ResourceField` verwendet `BaseField`: Label, Pflichtkennzeichnung, I-Icon mit Popover, Beschreibung, Sperrhinweis, Fehlerzuordnung und optionalen Zähler. IDs und `aria-describedby` verbinden Hinweise mit dem Eingabeelement. Text- und Zahlenfelder benutzen die vorhandenen Primitives; Select, Dialog, Popover und Fokussteuerung stammen aus Base UI.

| `kind`                      | Verhalten                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| `text`, `email`             | Kontrollierte Eingabe, Mindest-/Maximallänge, E-Mail-Prüfung                                             |
| `textarea`                  | Mehrzeilig, `rows`, Live-Zeichenzähler, `minLength`, `maxLength`                                         |
| `number`                    | Numerischer Formwert, `min`, `max`, `step`                                                               |
| `currency`                  | REUI NumberField mit deutscher Betragsdarstellung, `EUR`, numerischem Formwert und zwei Nachkommastellen |
| `select`                    | Einzelauswahl aus `options`                                                                              |
| `multiselect`               | Suchbare Mehrfachauswahl, Auswahlzähler, Leeren                                                          |
| `checkbox`                  | Einzelner boolescher Wert                                                                                |
| `checkbox-group`            | Mehrere Optionen als Checkboxliste, Array-Wert                                                           |
| `relation`                  | Serverseitige Suche mit Debouncing, vorhandene Auswahl laden, reduzierte Neuanlage, Auswahl übernehmen   |
| `date`, `month`, `time`     | Kalender-/Monats-/Zeitpicker                                                                             |
| `date-range`, `month-range` | Beginn/Ende, vollständige und chronologische Bereichsvalidierung                                         |

Gemeinsame Props: `required`, `nullable`, `default`, `description`, `help`, `placeholder`, `disabled`, `lockedReason`, `readonlyOnEdit`, `writeOnly`, `group`, `reduced`, `validate(value, values)`.

```ts
{
    name: "notes",
    label: "Notizen",
    kind: "textarea",
    minLength: 10,
    maxLength: 1000,
    rows: 5,
    help: "Hier die internen Hinweise zum Datensatz erfassen.",
    description: "10 bis 1000 Zeichen, sofern ausgefüllt.",
}
```

Optionale leere Felder bleiben erlaubt; `required` macht eine Mindestlänge auch für den leeren Wert verbindlich. Mehrfachauswahlen prüfen jede Option gegen die Definition. Das Backend muss das entsprechende Array-Feld ebenfalls ausdrücklich erlauben; ein UI-Prop erzeugt keine Datenbankspalte.

### CurrencyField

`1.234,50 €` wird im Feld angezeigt, `1234.5` im Formular und JSON geführt und als `DECIMAL(12,2)` gespeichert. Kein Cent-Multiplikator. Die REUI/Base-UI-Komponente übernimmt Parsing, Gruppierung und Darstellung, React Hook Form den numerischen Zustand. Leeren ergibt `null`; Nullbetrag `0` bleibt erhalten. Zod und das Backend prüfen den Wertebereich und maximal zwei Nachkommastellen.

Alle bestehenden Geldfelder, darunter Miete, Nebenkosten, Heizung und Kaution, verwenden diesen Baustein. `currency` und `locale` sind konfigurierbar. Die Komponentenseite demonstriert auch Counter, Hilfetext, Checkboxgruppe und Mehrfachauswahl.

### Datumsdarstellung

Tabellenspalten mit `kind: "date"` werden zentral als **dd.MM.yyyy** dargestellt. Dafür ist kein zusätzlicher Formatstring im Fachmodul nötig. Die Formatierung erfolgt jetzt auch bei einem anklickbaren Titelfeld wie `RentCondition.effective_from`. Das Backend erhält weiterhin ISO-Daten (`yyyy-MM-dd`).

## 6. Sheet, Dialog, Wizard und Direktlinks

- Formular-Sheets bis 48rem breit, auf kleineren Bildschirmen an den Viewport angepasst.
- Fester Header, optionaler Werkzeug-/Wizard-Bereich, eigener scrollbarer Inhalt und fester Footer.
- Dialoggrößen `compact`, `form`, `wide`; kompakt für Bestätigungen, breit für PDF-Vorschauen.
- Speichern rechts, Abbrechen daneben, Status/Schrittinformation links. Schließen, Escape und Abbrechen durchlaufen denselben Dirty-Check; laufendes Speichern blockiert Schließen.
- Wizard validiert den aktuellen Schritt vor Weiter, bewahrt Werte beim Zurückgehen und springt bei Fehlern in den betreffenden Schritt.
- Mehrere Serverfehler erscheinen gesammelt ohne identische Wiederholungen; konkrete Feldfehler bleiben am Feld sichtbar.
- Jede Neu-/Bearbeiten-Ansicht wird standardmäßig als `panels`-Descriptor in der URL abgebildet. Ein neu geladener Link lädt den Datensatz erneut über die API.
- In der URL stehen Ressource, Modus, ID, Darstellungsart und Relationskontext. Ungespeicherte Formularinhalte, Ausweisnummern und Callbacks werden nicht serialisiert.
- Browser-Zurück/Navigation fragt bei ungespeicherten Formularen nach. Für Reload/Tab-Schließen wird der native Browserhinweis verwendet.
- Bis zu acht verschachtelte Formulare. Eltern bleiben gemountet und rücken visuell zurück; Base UI übernimmt Fokus und Modalverhalten. Reduzierte Bewegung wird berücksichtigt.
- Sheet/Dialog lässt sich im Listing und in Relationslisten wählen und mit `presentation` pro Aufruf überschreiben.

```ts
workbench.openForm({
    resource: conditions,
    mode: "create",
    presentation: "sheet", // ebenso "dialog"
    context: { resource: "contracts", id: contract.id, field: "contract_id" },
    onSaved: () => refreshForm(),
});
```

Der Kontext wird anhand der Felddefinition und eines vorhandenen übergeordneten Datensatzes aufgelöst. `contract_id` wird vorausgefüllt und gesperrt. Auch nach neuem Laden bleibt die Zuordnung bestehen. Beim Speichern wird der Kontextwert erneut eingesetzt. Das ist Bedienlogik; Fremdschlüssel, Historien- und Änderungsregeln werden weiterhin serverseitig validiert.

Relationstabellen im Bearbeitungsformular verwenden denselben Ablauf für Konditionen, Kündigungen, Beteiligte und weitere registrierte Relationen. Nach erfolgreicher Untererfassung werden Cache und Elternformular aktualisiert. `keepDirtyValues` bewahrt ungespeicherte Änderungen. Der Formularheader bietet Aktualisieren, Direktlink kopieren und passende Datensatz-Actions.

## 7. Enterprise-Grid

`ResourceCollection` verwendet das offizielle REUI DataGrid mit TanStack Table 9. Der Quellcode des Grids wurde für diese Erweiterung nicht geforkt; die Fachlogik liegt im Wrapper.

| Prop                                  | Default / Bedeutung                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| `searchable`                          | `true`; Suchfeld, Clear-Button, 250-ms-Debouncing                                      |
| `pagination`                          | `true`; serverseitige Seiten mit 10/25/50/100 Zeilen                                   |
| `pagination={false}`                  | Begrenzte Liste bis 100 Zeilen, ausdrücklich angezeigte Begrenzung                     |
| `rowSelection`                        | `"multiple"`; auch `"single"`, `false` oder `(row) => boolean`                         |
| `doubleClickEdit`                     | `true`; Doppelklick auf normale Zellen öffnet Edit; Buttons/Links bleiben eigenständig |
| `syncWithLocation`                    | `true`; Zustand aus URL, auch bei Zurück/Vorwärts                                      |
| `urlKey`                              | Optionaler Präfix für unabhängige Tabellen auf derselben Seite                         |
| `resizable`, `pinnable`               | `true`; Spaltenbreite und Fixieren über REUI                                           |
| `compact`                             | Relationsliste mit begrenzter Höhe, kleinerer Standardseite und eigenem URL-Präfix     |
| `fixedFilters`, `defaults`, `context` | Serverseitige Relationsfilter, Vorbelegung und gesperrter Bezug                        |
| `onSaved`, `form`, `formResource`     | Rückkopplung an ein übergeordnetes Formular                                            |

```tsx
<ResourceCollection
    resource={units}
    rowSelection={(row) => row.status === "ready"}
    doubleClickEdit
    searchable
    pagination
    syncWithLocation
    urlKey="units."
/>
```

Weitere Funktionen: serverseitige Sortierung, registrierte Filter, Spaltenchooser in der Toolbar, Spaltenverschiebung über das REUI-Menü, Dichteumschalter, Refresh, Lade-/Fehlerzustände und explizite Bulk-Actions. Die Spaltenreihenfolge/-breite/-fixierung bleiben sitzungsbezogener Tabellenzustand; die URL persistiert Suche, Seite, Seitengröße, Sortierung, Filter, Gruppierung, Sichtbarkeit und Dichte.

Die Hauptliste füllt die nach Header, KPI-Bar, Abständen und Toolbar verfügbare Höhe. Zeilen scrollen intern; der Footer bleibt außerhalb der Scrollfläche, mit Seitenauswahl rechts. Relationslisten verwenden eine kompaktere maximale Höhe. Auf sehr niedrigen Viewports kann der Inhaltsbereich entsprechend klein werden.

Gruppierung bezieht sich auf die aktuell serverseitig geladene Seite und nennt ausdrücklich die Anzahl **auf dieser Seite**. Es wird nicht der gesamte Datenbestand in den Browser geladen. Zeilenauswahl wird bei Wechsel von Seite, Suche, Sortierung oder Filtern aufgehoben. Bulk-Actions erhalten nur die tatsächlich ausgewählten Zeilen der geladenen Seite.

Der CSV-Button exportiert die Auswahl oder die aktuelle Seite, jeweils die sichtbaren Spalten. Er ist kein unbeschränkter Gesamtexport. Trennzeichen `;`, UTF-8 mit BOM, Anführungszeichen-Escaping und Schutz gegen typische Tabellenformeln. Custom-Renderer werden nicht als HTML exportiert; exportiert wird der API-Feldwert.

## 8. Actions und Löschblockaden

Eine `ResourceAction` definiert `id`, `label`, `bulk`, `location`, `destructive`, `fields`, `visible`, optional `prepare` und `execute`. Der Kontext liefert:

- `rows`: tatsächliche ausgewählte Datensätze;
- `resource`: die Ressourcendefinition;
- `values`: validierte Action-Eingaben;
- `instance.reload`, `openForm`, `navigate`, `table`;
- optional `instance.form`, `formResource` und `refreshForm`.

`bulk = false` verbietet mehrere Zeilen auch im Ausführungsweg. Die Backend-Action setzt unabhängig davon `maxResources` und prüft Policies. Das Frontend ersetzt keine serverseitige Autorisierung.

### Löschregeln am Objekt

`CheckPropertyDeletion` liefert pro Objekt alle Gründe. Es blockiert:

1. Status `active`;
2. vorhandene Einheiten, einschließlich soft-gelöschter Einheiten.

Die Prüfung der Relationen verwendet eine gemeinsame `EXISTS`-Projektion statt jede Einheit zu laden. Der Vorprüfungsendpunkt lädt die angefragten IDs gesammelt; er führt keine einzelne Exists-Validierungsabfrage je ID aus. Die UI zeigt alle Blockaden und entfernt den destruktiven Submit. Es wird kein Teil der Auswahl gelöscht.

Auch ohne UI-Vorprüfung erzwingen `PropertyResource::destroyConfirmation` und `PropertyObserver` dieselben Regeln. Nach einem erhaltenen Bestätigungstoken wird der Status erneut geprüft. Für erlaubte Löschungen bleibt der signierte `428`-Bestätigungsablauf aktiv. Der Vorprüfungsendpunkt akzeptiert maximal 100 IDs.

### Clone-Defaults

`CloneDefaults` bestimmt Nummer und Bezeichnung im Backend. Die UI lädt diese Werte vor dem Öffnen der Action-Eingabe; ohne übergebene Werte erzeugt auch die Backend-Action ihre Defaults. Nummer und Bezeichnung können vor dem Klonen geändert werden.

`CloneProperty` kopiert Objektstammdaten, setzt das neue Objekt auf aktiv und entfernt den nächsten Prüftermin; optional werden Einheiten kopiert. `CloneUnit` kopiert die physischen Stammdaten und startet mit Zustand `ready`. Verträge, Partnerzuordnungen, Kündigungen, Ausweise und Konditionen werden nie mitkopiert. Die daraus folgende fehlende Vermietung ergibt sich aus fehlenden Verträgen.

## 9. Custom-Actions und typisierte Ergebnisse

Am Objekt sind zwei ausführbare Beispiele vorhanden:

| Frontend                | Backend                                        | Ergebnis                                                                |
| ----------------------- | ---------------------------------------------- | ----------------------------------------------------------------------- |
| `InspectPropertyAction` | `InspectProperty`                              | Zugriff auf Model, Einheitenzahl/-fläche und Stammdaten; Details-Dialog |
| `PropertyReportAction`  | `CreatePropertyReport` → `BuildPropertyReport` | Echter Unicode-PDF-Bericht, automatische Vorschau und Download          |

REST-Actions verwenden die bestehenden Lomkit-Antworten. Die Erweiterung liegt in `ActionResponse::data()` unter `ui`:

```php
public function handle(ActionFields $fields, Collection $models): void
{
    /** @var Property $property */
    $property = $models->first();
    $property->loadCount('units');
    $this->result = ['ui' => [
        'type' => 'details',
        'title' => 'Objekt-Check · '.$property->name,
        'items' => [
            ['label' => 'Einheiten', 'value' => $property->units_count],
        ],
    ]];
}

public function respond(ActionFields $fields, int $impacted): ?ActionResponse
{
    return ActionResponse::data($this->result);
}
```

| `ui.type`    | Vertrag / UI-Verhalten                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `details`    | `title`, optional `message`, `items: {label, value}[]`; DetailList im Dialog                                                               |
| `document`   | `title`, `url`, `mime: "application/pdf"`, `name`; geschütztes Laden, PDF-Vorschau und Download                                            |
| `form-patch` | `values`, optional `message`; bekannte beschreibbare Felder des aktiven `formResource` werden mit Validierung und Dirty-Markierung gesetzt |

Zusätzlich werden native Lomkit-`message`- und `danger`-Ergebnisse behandelt. Weitere native Ergebnisarten wie Redirects benötigen einen ausdrücklich ergänzten Dispatcher; sie werden nicht ungeprüft als Navigation ausgeführt.

Beispiel einer Action, die ein geöffnetes Formular ergänzt:

```php
return ActionResponse::data(['ui' => [
    'type' => 'form-patch',
    'values' => ['notes' => 'Ergebnis der fachlichen Prüfung'],
    'message' => 'Notiz ergänzt. Mit Speichern übernehmen.',
]]);
```

Das ist eine Formularänderung, keine heimliche Speicherung. Ohne Formular meldet der Dispatcher einen Fehler. `formResource` muss bei einem fremden Elternformular explizit mitgegeben werden; `ResourceEditor` erledigt dies für seine Relationslisten.

Für PDF-Ergebnisse erzeugt das Backend eine zehn Minuten gültige relative signierte URL, gebunden an den aktuellen Benutzer. Der Abruf prüft erneut Authentifizierung, Policy, Signatur und Benutzer-ID. Die Antwort ist `application/pdf`, `private, no-store` und `nosniff`. Das Frontend akzeptiert nur dieselbe Origin unter `/api/`, prüft den MIME-Typ, lädt mit Sitzung und gibt erzeugte Blob-URLs nach dem Schließen frei. Benutzer ohne eingebettete PDF-Unterstützung können die Datei herunterladen.

## 10. Zusammengesetzte und berechnete API-Felder

Die Beispiele sind echte API-Felder, keine nur im Browser zusammengebauten Werte:

```php
Text::make('full_address')
    ->virtual()
    ->readonly()
    ->requires(['street', 'house_number', 'postal_code', 'city'])
    ->resolveUsing(fn (Property $property) =>
        $property->street.' '.$property->house_number.', '.
        $property->postal_code.' '.$property->city
    );
```

- `Property.full_address`: Straße/Hausnummer und PLZ/Ort; in der Objekttabelle.
- `BusinessPartner.full_name`: Vorname + Nachname bzw. Firmenname, mit Fallback auf Anzeigename; in der Partnertabelle.
- `RentCondition.monthly_total`: `(Grundmiete + Nebenkosten + Heizung) × (1 + USt. / 100)`, auf zwei Stellen gerundet; als **Monatlich brutto** in der Konditionstabelle.

`requires()` stellt die notwendigen Quellspalten bereit; `virtual()` verhindert den Zugriff auf eine nicht vorhandene Datenbankspalte; `readonly()` verhindert Manipulation durch Mutationen. Frontendspalten verwenden `sortable: false`, solange keine explizite serverseitige Sortierabbildung definiert ist. Für relationale Kennzahlen bewusst Aggregationen/Subqueries verwenden, keine zusätzlichen Relationsabfragen je Tabellenzeile.

## 11. Objektseiten und wiederverwendbare Blöcke

Die Objektliste besitzt dieselbe kompakte KPI-Bar wie die Detailseite: monatliche Grundmiete und Jahreshochrechnung, Belegung, Nebenkosten/Heizung sowie durchschnittliche Mietdauer laufender Verträge. Die Werte gelten für das Portfolio; Listenfilter ändern diese KPI-Bar derzeit nicht. Die Detailseite filtert die Berechnung auf das Objekt. Die Zahlen beruhen auf heute gültigen Vertragskonditionen, nicht auf verbuchten Zahlungseingängen.

Die Detailseite priorisiert Einheiten, Belegung, nächste Prüfung und Verantwortliche. Grunddaten bleiben kompakt. Relations-Tabs werden erst beim Öffnen geladen; `countRelation` kann vorher nur die Anzahl anzeigen. Zähler, Prüfungsfachmodul, Projekte und Zahlungen sind beschriftete Erweiterungspunkte, keine fertigen Fachmodule.

`SectionCard` bietet `actions` oben rechts und optional `grow` für die verfügbare Höhe. `DynamicList` bietet `search`, `searchText`, `renderItem`, `getKey`, Empty-State und Actions. `DetailList`, `ListRow`, `MetricGrid`, `Occupancy`, `LazyTabs`, `Stack`, `Split`, `Inline` und `CollectionPage` bilden weitere Seiten ohne lokale Stylingregeln.

## 12. API, Fehler und Konsistenz

| Endpunkt                                        | Zweck                                                      |
| ----------------------------------------------- | ---------------------------------------------------------- |
| `POST /api/v1/{resource}/search`                | Suche, Filter, Sortierung, Includes, Aggregate, Pagination |
| `POST /api/v1/{resource}/mutate`                | Create/Update mit expliziten Attributen                    |
| `DELETE /api/v1/{resource}`                     | Löschen mit signierter Bestätigung                         |
| `POST /api/v1/{resource}/actions/{action}`      | Einzel-/Bulk-Action                                        |
| `POST /api/v1/properties/metrics/overview`      | Portfolio-/Objekt-KPIs                                     |
| `POST /api/v1/properties/deletion-check`        | `{resources: [1,2]}` → Blockaden pro Objekt                |
| `GET /api/v1/properties/{id}/clone-defaults`    | Objekt-Klonvorbelegung                                     |
| `GET /api/v1/units/{id}/clone-defaults`         | Einheiten-Klonvorbelegung                                  |
| `GET /api/v1/properties/{id}/report?...`        | Signierter PDF-Abruf                                       |
| `POST/GET /api/v1/identity-documents/{id}/file` | Private Ausweisdatei                                       |

Session-Endpunkte: `/auth/user`, `/auth/login`, `/auth/logout`; Sanctum-CSRF, Same-Origin-Credentials und Login-Rate-Limit. `/docs/api` ist authentifiziert geschützt.

Updates übertragen `updated_at` als `version`. Bei `409` kann das Formular aktualisiert werden; lokale Dirty-Werte bleiben erhalten und müssen geprüft werden. `422` wird in Feldfehler und Fehlerliste übersetzt. `428` hält Action-Eingaben und Auswahl für die explizite Bestätigung fest. Nach Mutationen werden Ressourcen- und Kennzahlenqueries invalidiert.

## 13. Was aus Refine, Filament und Plugins sinnvoll ist

Bereits übernommen: deklarative Ressourcen, zentraler Provider, Query-Invalidierung, URL-Synchronisation, verschachtelte Actions, Modellkontext, Replikation mit Backend-Defaults, einheitliche Bestätigung, Standardformulare und wiederverwendbare Relationstabellen.

Die folgenden Punkte sind **priorisierte nächste Ausbaustufen**, keine Behauptung über bereits implementierte Funktionen:

| Priorität | Funktion                                              | Konkreter Nutzen für die Hausverwaltung                                                                                   |
| --------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1         | Audit-Timeline mit Feld-Diff, Akteur und Ereignis     | Nachvollziehen, wer Konditionen, Kaution oder Kündigungen geändert hat; sensible Felder ausnehmen                         |
| 1         | Persönliche und geteilte gespeicherte Ansichten       | „Leerstand“, „Kündigungen offen“, „Prüfung überfällig“ mit Filtern, Spalten und Sortierung; URL-Zustand ist die Grundlage |
| 1         | Import mit Spaltenzuordnung, Vorschau und Fehlerdatei | Stammdatenübernahme mit sichtbaren Validierungsfehlern und expliziter Freigabe                                            |
| 2         | Queue-basierte Gesamtexporte/Berichte mit Fortschritt | Große Bestände ohne Browser-/HTTP-Timeout; Wiederaufnahme nach Reload                                                     |
| 2         | Papierkorb/Wiederherstellen mit Relationsprüfung      | Kontrollierte Rücknahme zulässiger Soft Deletes statt pauschalem Undo fachlicher Vorgänge                                 |
| 2         | Aufgaben, Fälligkeiten und Benachrichtigungszentrum   | Kündigungen, fehlende Unterlagen und Prüftermine im Arbeitsvorrat                                                         |
| 3         | Globale Suche / Command-Palette                       | Objekt, Einheit, Partner und Vertrag über Nummer oder Namen schnell öffnen                                                |
| 3         | Realtime-Konflikthinweise                             | Änderungen anderer Bearbeiter früh anzeigen; bestehende Versionskontrolle bleibt maßgeblich                               |

Anregungen: Filament Saved Filter für benannte Ansichten, Logger/Activitylog für nachvollziehbare Änderungen, Filament Import/Export für Queue-Verarbeitung und Fehlerrückmeldungen. Diese Filament-UI-Plugins werden nicht in React eingebaut; relevante Konzepte bzw. passende Laravel-Bibliotheken lassen sich hinter den vorhandenen Schnittstellen ergänzen. Ein generisches „Undo“ für Vertragsaktivierung oder bestätigte Kündigung wäre fachlich zu ungenau und braucht eigene Gegenaktionen.

## 14. Prüfung und bekannte Grenzen

```bash
php artisan test --compact
php artisan rest:check
composer validate --strict
npm test
npm run build
```

Featuretests decken unter anderem Auth, Seeder, Verträge, Historie, Dokumentenschutz, Versionskonflikte, Bestätigung, deaktivierte Permissions sowie neu Löschblockaden, konstante Vorprüfungsabfragen, Klondefaults, virtuelle schreibgeschützte Felder und den PDF-Abruf ab. React-Tests prüfen Wizard/Dirty-State, echte REUI-Tabellen, URL-Zustand, Deep-Link-Hydrierung, Browser-Zurück, geschachtelte gesperrte Relationsformulare, Currency-Parsing, Mehrfachauswahl, Datumsformat und mehrteilige Alerts.

Die bestehende Playwright-Suite wurde für die neue Oberfläche erweitert. Ein echter Browserlauf ist in der lokalen Erstellungsumgebung durch die Browser-Sandbox blockiert; visuelle Abnahme, PDF-Einbettung und responsive Details müssen zusätzlich im Zielbrowser geprüft werden. Die Komponententests ersetzen keine pixelgenaue Browserabnahme.

Keine vollständige Buchhaltung, Zahlungsabstimmung, Mandantentrennung, ausgebautes Rollenmodell, automatische rechtliche Fristbewertung oder persistierte gemeinsame Tabellenansichten. REUI unterstützt weitere Grid-Modi wie Virtualisierung, Tree Rows und Inline Editing; sie sind nicht automatisch Bestandteil des hier freigegebenen CRUD-Wrappers. Gerade Inline-Mutationen brauchen dieselben Vertrags- und Versionsregeln wie die Formulare.

## 15. Quellen und UI-Herkunft

- [Laravel REST API 3 – Ausgangsartikel](https://laravel-news.com/laravel-rest-api-3), [Lomkit-Dokumentation](https://github.com/Lomkit/laravel-rest-api)
- [REUI DataGrid](https://reui.io/docs/components/base/data-grid), [NumberField](https://reui.io/docs/components/base/number-field), [Alert](https://reui.io/docs/components/base/alert)
- [Base UI NumberField](https://base-ui.com/react/components/number-field)
- [Refine useTable / URL-Synchronisation](https://refine.dev/core/docs/data/hooks/use-table/)
- [Filament verschachtelte Modals](https://filamentphp.com/docs/5.x/actions/modals), [Replicate](https://filamentphp.com/docs/5.x/actions/replicate)
- [Filament Import](https://filamentphp.com/docs/5.x/actions/import), [Action-Übersicht](https://filamentphp.com/docs/5.x/actions/overview)
- [Saved Filter](https://filamentphp.com/plugins/jeffersongoncalves-saved-filter), [Logger](https://filamentphp.com/plugins/daniel-green-logger), [Realtime-Fortschritt](https://filamentphp.com/plugins/hibira-realtime)
- [Registry-Nachweise der übernommenen Komponenten](ui-sources.json)

Öffentliche REUI-/shadcn-Quellen werden über die Registry-Nachweise dokumentiert. Kostenpflichtige SaaS-Blöcke wurden nicht kopiert. App-Layouts, Fachdefinitionen und Wrapper sind eigene Kompositionen auf diesen Komponenten.
