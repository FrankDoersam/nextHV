# nextHV · Framework- und Fachmodell-Handbuch

Dieses Dokument beschreibt den aktuellen Framework-Stand einschließlich Formular-Flows, Vertragsakte, direkter Feldmutationen und Screenshot-Workflow. Es ist die Anleitung zum Bauen weiterer CRUD-Fachmodule. Die bestehenden öffentlichen REUI-Komponenten bleiben die UI-Grundlage; Refine und Filament dienen als Architekturvorbilder, werden nicht zusätzlich als Laufzeit installiert.

## 1. Einstieg und Betriebsmodell

- Laravel 13 + `lomkit/laravel-rest-api` 3, Sanctum-Session, Scramble/OpenAPI.
- React 19, React Router 7, TanStack Query, TanStack Table 9, React Hook Form; REST-Formulare verwenden ausschließlich Laravel-Servervalidierung. Zod bleibt nur für die isolierte Komponenten-Demo und deren Tests.
- REUI Base Nova, Base UI, Tailwind 4; gemeinsame Farben und Abstände in `resources/css/app.css` und zentralen Komponenten.
- PHP 8.3+, Composer 2, Node 22.12+; CI verwendet Node 24/PHP 8.5. SQLite für lokale Entwicklung und Tests.
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

| Ebene                 | Ort                                                          | Aufgabe                                                                                         |
| --------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Datenmodell           | `app/Models`, `database/migrations`                          | Tabellen, Fremdschlüssel, Indizes, Casts, explizite Relationen                                  |
| Fachaktionen          | `app/Domain/Property/Actions`, `app/Domain/Contract/Actions` | Fachliche Änderungen, Klonen, Vertragsregeln, Kennzahlen, PDF-Erstellung                        |
| Integrität            | `app/Observers`                                              | Regeln auch bei Modelländerungen außerhalb eines einzelnen REST-Endpunkts                       |
| REST-Schema           | `app/Rest/Resources`                                         | Felder, Regeln, Relationen, Versionen, Actions, berechnete Werte                                |
| REST-Actions          | `app/Rest/Actions`                                           | Autorisierung, Einzel-/Bulk-Ziel, Bestätigung, Übergabe an Fachaktionen, Ergebnisvertrag        |
| Zusätzliche Endpunkte | `app/Http/Controllers`                                       | Login, private Dokumente, Clone-Defaults, Löschvorprüfung, PDF-Abruf                            |
| UI-Primitives         | `resources/js/components/ui`                                 | Offizielle Base-UI-/shadcn-Bausteine                                                            |
| REUI                  | `resources/js/components/reui`                               | Öffentliche REUI-Quellen, einschließlich DataGrid, Stepper, TimePicker, NumberField und Alert   |
| App-Blöcke            | `resources/js/components/blocks`                             | AppShell, Cards, Listen, KPIs, Overlay, Layout, Auth, LazyTabs                                  |
| Formularfelder        | `resources/js/components/fields`                             | BaseField, ResourceField, CurrencyField, ChoicePicker, EntityPicker, CheckboxList, Datumspicker |
| CRUD-Laufzeit         | `resources/js/framework`                                     | Provider, Hooks, Form-Engine, Workbench, Actions, Navigation, Tabellen                          |
| Fachkonfiguration     | `resources/js/modules`                                       | Ressourcen, Felder, Spalten, Relationslisten, fachliche UI-Actions                              |
| Seiten                | `resources/js/pages`                                         | Zusammensetzung der Komponenten ohne eigene Styles                                              |

Der Ablauf einer Änderung lautet: Formular → Datenprovider → REST-Resource → Fachaktion/Observer → Model → projizierte API-Antwort → betroffene Cache-Zeile und Detail → UI. Darstellung, API-Protokoll und Fachregeln haben jeweils einen eindeutigen Ort.

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

| `kind`                             | Verhalten                                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `text`, `email`                    | Kontrollierte Eingabe, Mindest-/Maximallänge, E-Mail-Prüfung                                             |
| `textarea`                         | Mehrzeilig, `rows`, Live-Zeichenzähler, `minLength`, `maxLength`                                         |
| `number`                           | Numerischer Formwert, `min`, `max`, `step`                                                               |
| `currency`                         | REUI NumberField mit deutscher Betragsdarstellung, `EUR`, numerischem Formwert und zwei Nachkommastellen |
| `select`                           | Suchbare Einzel-/Mehrfachauswahl (`multiple`) aus `options`                                              |
| `multiselect`                      | Suchbare Mehrfachauswahl, einzeilige Titel, optionales Leeren                                            |
| `checkbox`                         | Einzelner boolescher Wert                                                                                |
| `checkbox-group`, `checkbox-cards` | Dynamische Listen/Karten, Suche, Select-all, deaktivierte Optionen, Auswahlgrenze und Array-Wert         |
| `relation`                         | Serverseitige Suche/Filter, Einzel-/Mehrfachauswahl, Titel/Subtext, abschaltbare Neuanlage               |
| `date`, `month`, `time`            | Kalender-/Monats-/Zeitpicker                                                                             |
| `date-range`, `month-range`        | Beginn/Ende, vollständige und chronologische Bereichsvalidierung                                         |

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

`1.234,50 €` wird im Feld angezeigt, `1234.5` im Formular und JSON geführt und als `DECIMAL(12,2)` gespeichert. Kein Cent-Multiplikator. Die REUI/Base-UI-Komponente übernimmt Parsing, Gruppierung und Darstellung, React Hook Form den numerischen Zustand. Leeren ergibt `null`; Nullbetrag `0` bleibt erhalten. Laravel prüft beim Speichern den Wertebereich und maximal zwei Nachkommastellen. Die Eingabekomponente übernimmt ausschließlich Zahlenformat und Bediengrenzen.

Alle bestehenden Geldfelder, darunter Miete, Nebenkosten, Heizung und Kaution, verwenden diesen Baustein. `currency` und `locale` sind konfigurierbar. Die Komponentenseite demonstriert auch Counter, Hilfetext, Checkboxgruppe und Mehrfachauswahl.

### Datumsdarstellung

Tabellenspalten mit `kind: "date"` werden zentral als **dd.MM.yyyy** dargestellt. Dafür ist kein zusätzlicher Formatstring im Fachmodul nötig. Die Formatierung erfolgt jetzt auch bei einem anklickbaren Titelfeld wie `RentCondition.effective_from`. Das Backend erhält weiterhin ISO-Daten (`yyyy-MM-dd`).

## 6. Sheet, Dialog, Wizard und Direktlinks

- Formular-Sheets bis 48rem breit, auf kleineren Bildschirmen an den Viewport angepasst.
- Fester Header, optionaler Werkzeug-/Wizard-Bereich, eigener scrollbarer Inhalt und fester Footer.
- Dialoggrößen `compact`, `form`, `wide`; kompakt für Bestätigungen, breit für PDF-Vorschauen.
- Speichern rechts, Abbrechen daneben; Statushinweise links nur bei normalen Formularen. Im Wizard steht kein zusätzlicher Schritttext im Footer. Schließen, Escape und Abbrechen durchlaufen denselben Dirty-Check; laufendes Speichern blockiert Schließen.
- Wizard validiert den aktuellen Schritt mit Laravel Precognition vor Weiter, bewahrt Werte beim Zurückgehen und springt bei Fehlern in den betreffenden Schritt.
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

Weitere Funktionen: serverseitige Sortierung, registrierte Filter, Spaltenauswahl und Spaltenverschiebung über das REUI-Kopfmenü, Refresh, Lade-/Fehlerzustände und explizite Bulk-Actions. Die Spaltenreihenfolge/-breite/-fixierung bleiben sitzungsbezogener Tabellenzustand; die URL persistiert Suche, Seite, Seitengröße, Sortierung, Filter, Gruppierung, Sichtbarkeit und Dichte.

Die Hauptliste füllt die nach Header, KPI-Bar, Abständen und Toolbar verfügbare Höhe. Zeilen scrollen intern; der Footer bleibt außerhalb der Scrollfläche, mit Seitenauswahl rechts. Relationslisten verwenden eine kompaktere maximale Höhe. Auf sehr niedrigen Viewports kann der Inhaltsbereich entsprechend klein werden.

Gruppierung bezieht sich auf die aktuell serverseitig geladene Seite und nennt ausdrücklich die Anzahl **auf dieser Seite**. Es wird nicht der gesamte Datenbestand in den Browser geladen. Zeilenauswahl wird bei Wechsel von Seite, Suche, Sortierung oder Filtern aufgehoben. Bulk-Actions erhalten nur die tatsächlich ausgewählten Zeilen der geladenen Seite.

Der CSV-Button exportiert die Auswahl oder die aktuelle Seite, jeweils die sichtbaren Spalten. Er ist kein unbeschränkter Gesamtexport. Trennzeichen `;`, UTF-8 mit BOM, Anführungszeichen-Escaping und Schutz gegen typische Tabellenformeln. Custom-Renderer werden nicht als HTML exportiert; exportiert wird der API-Feldwert.

## 8. Actions und Löschblockaden

Eine `ResourceAction` definiert `id`, `label`, optional `icon`, `description`, `group`, `children`, `placements`, `bulk`, `destructive`, `fields`/`fieldsFor`, `visible`, `enabled`, `prepare` und `execute`. `location` bleibt als kompatible ältere Kurzform erhalten; die vollständige API steht in Abschnitt 27. Der Kontext liefert:

- `rows`: tatsächliche ausgewählte Datensätze;
- `resource`: die Ressourcendefinition;
- `values`: Action-Eingaben; verbindliche Prüfung erfolgt durch den Server beim Ausführen;
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

| `ui.type`    | Vertrag / UI-Verhalten                                                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `details`    | `title`, optional `message`, `items: {label, value}[]`; DetailList im Dialog                                                                                                                      |
| `document`   | `title`, `url`, `mime: "application/pdf"`, `name`; geschütztes Laden, PDF-Vorschau und Download                                                                                                   |
| `form-patch` | `values`, optional `message`; bekannte beschreibbare Felder des aktiven `formResource` werden mit Dirty-Markierung gesetzt; Servervalidierung erfolgt beim nächsten Schrittwechsel bzw. Speichern |

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

Für PDF-Ergebnisse erzeugt das Backend eine zehn Minuten gültige relative signierte URL, gebunden an den aktuellen Benutzer. Der Abruf prüft erneut Authentifizierung, Policy, Signatur und Benutzer-ID. Die Antwort ist `application/pdf`, `private, no-store` und `nosniff`. Das Frontend akzeptiert nur dieselbe Origin unter `/api/`, prüft den MIME-Typ, lädt mit Sitzung und gibt erzeugte Blob-URLs nach dem Schließen frei. Die Darstellung übernimmt der browsernative PDF-Viewer innerhalb einer React-Komponente; Öffnen in neuem Tab und Download sind zusätzlich möglich.

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

Die bestehende Playwright-Suite wurde für die neue Oberfläche erweitert. Ein echter Browserlauf ist in der lokalen Erstellungsumgebung durch die Browser-Sandbox blockiert; visuelle Abnahme, browsernative PDF-Einbettung und responsive Details müssen zusätzlich im Zielbrowser geprüft werden. Die Komponententests ersetzen keine pixelgenaue Browserabnahme.

Keine vollständige Buchhaltung, Zahlungsabstimmung, Mandantentrennung, ausgebautes Rollenmodell, automatische rechtliche Fristbewertung oder persistierte gemeinsame Tabellenansichten. REUI unterstützt weitere Grid-Modi wie Tree Rows und Inline Editing; diese sind nicht automatisch Bestandteil des hier freigegebenen CRUD-Wrappers. Zeilenvirtualisierung gehört seit dem in Abschnitt 18 beschriebenen Ausbau dazu. Gerade Inline-Mutationen brauchen dieselben Vertrags- und Versionsregeln wie die Formulare.

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

## 16. Deklarative Formularabläufe und Relationsfähigkeiten

Dieser Ausbau folgt auf `c8311c8`. Ein gesperrter Vertragsbezug gehört zur Framework-Konfiguration. Seiten, Edit-Karten und geschachtelte Dialoge benutzen dieselbe `RelationDefinition` und denselben `RelationCollection`-Renderer.

```tsx
const relation: RelationDefinition = {
    resource: "rent-conditions",
    label: "Konditionen",
    field: "contract_id",
    countRelation: "conditions",
    collection: {
        pagination: false,
        rowSelection: false,
        detailLink: false,
        searchable: true,
    },
    editorCollection: {
        searchable: false,
        filterable: false,
        groupable: false,
        columnChooser: false,
        exportable: false,
        refreshable: false,
    },
    createForm: { binding: "locked", presentation: "sheet" },
    editForm: { binding: "locked", presentation: "dialog" },
};

<RelationCollection
    relation={relation}
    parent={{ resource: "contracts", id: contract.id }}
    surface="editor"
    onSaved={refreshParent}
/>;

// Derselbe Einstieg funktioniert aus einer Karte, Toolbar oder Fachaktion:
workbench.openRelation(relation, { resource: "contracts", id: contract.id });
```

`collection` gilt für alle Oberflächen; `editorCollection` überschreibt einzelne Optionen im Editor. `createForm` und `editForm` bestimmen unabhängig Darstellung, reduzierte Felder und Wizard. Ohne feste Darstellung gilt die zentrale Sheet-/Dialog-Auswahl. `binding: "locked"` ist der Standard: Vorbelegung, sichtbarer Sperrhinweis und erzwungener Bezug beim Speichern. `prefill` trägt den Bezug editierbar ein; `none` übernimmt keinen Bezug. Die zugrunde liegende Liste bleibt weiterhin auf den übergeordneten Datensatz gefiltert. Fachlich unveränderbare Backend-Felder bleiben auch bei `prefill` unveränderbar.

Bei einem Edit-Direktlink lädt das Framework den Datensatz und prüft, ob sein Fremdschlüssel zum angegebenen Elternbezug passt. Diese Prüfung ist eine Konsistenzprüfung der UI; Backend-Validierung, Authentifizierung und vorhandene Versionskontrolle gelten weiterhin. Sie ersetzt keine Berechtigungs- oder Organisationsprüfung.

### Fähigkeiten einer Collection

| Option                                                             | Verhalten                                                                                                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `searchable`, `filterable`, `groupable`                            | Suche, Mehrfachfilter, Gruppierung jeweils aktivieren; deaktivierte Funktionen wenden auch entsprechende URL-Werte nicht an                       |
| `pagination`                                                       | Seitennavigation ein-/ausblenden; ohne Paging höchstens 100 Einträge, Gesamtzahl und Grenze bleiben sichtbar                                      |
| `rowSelection`                                                     | `false`, `single`, `multiple` oder Prädikat pro Datensatz                                                                                         |
| `actions`                                                          | Alle registrierten Actions, `false` für keine oder eine Allowlist wie `["edit", "inspect"]`; gilt für Zeilen, Auswahl und Doppelklick-Bearbeitung |
| `create`, `detailLink`, `doubleClickEdit`                          | Hinzufügen, Titel-Link und Doppelklick unabhängig schalten                                                                                        |
| `columnChooser`, `exportable`, `refreshable`, `presentationToggle` | Spaltenmenü im Tabellenkopf und übrige Werkzeuge unabhängig konfigurieren                                                                         |
| `toolbar`                                                          | Gesamte Werkzeugleiste ein-/ausblenden; Fähigkeiten bleiben separat konfigurierbar                                                                |
| `resizable`, `pinnable`                                            | Spaltenbreiten und Fixierung steuern                                                                                                              |
| `virtualized`                                                      | `"auto"` ab 50 geladenen Zeilen, `true` oder `false`; gruppierte Seiten verwenden ihre einzelnen Gruppen-Tabellen                                 |
| `syncWithLocation`, `urlKey`                                       | URL-Synchronisation und isolierter Namensraum für mehrere Tabellen                                                                                |

CSV exportiert die aktuelle Seite bzw. Auswahl, nicht stillschweigend den gesamten Datenbestand. Paging aus bedeutet bewusst keinen unbegrenzten Download. Für umfangreiche Historien kann dieselbe Relation Paging aktivieren.

### Mehrere gespeicherte Schritte als Flow

`framework/forms/flow.ts` definiert das Ablaufmodell; Fachdefinitionen liegen im jeweiligen Modul und werden in `modules/flows.ts` registriert. `modules/contracts/contract-flow.ts` demonstriert einen echten Ablauf:

1. Vertragsentwurf speichern; optional die aktuelle Einheit als gesperrten Elternbezug übernehmen.
2. Einen Geschäftspartner als Vertragsbeteiligten zuordnen.
3. Erste Kondition anlegen; anschließend die Vertragsdetailseite öffnen.

Der Vertrag bleibt Entwurf. Die vorhandene Aktivierungs-Action prüft die fachlichen Voraussetzungen separat. Ein vorhandener Geschäftspartner kann im Relation-Picker gesucht werden; seine Schnellerfassung ist ebenfalls ein verschachteltes Formular.

```tsx
const flow: FormFlowDefinition = {
    id: "new-contract",
    label: "Neuen Mietvertrag vorbereiten",
    steps: [
        { id: "contract", label: "Vertrag", resource: "contracts" },
        {
            id: "condition",
            label: "Erste Kondition",
            resource: "rent-conditions",
            binding: {
                field: "contract_id",
                source: "contract",
                resource: "contracts",
                mode: "locked",
            },
        },
    ],
    completion: { navigateTo: "contract" },
};

workbench.openFlow("new-contract", {
    parent: { resource: "units", id: unit.id },
    presentation: "sheet",
});
// In einer Fachaktion auch über context.instance.openFlow?.(...).
```

`source` referenziert einen gespeicherten Schritt oder `parent`. Darstellung, Wizard und reduzierte Erfassung sind pro Schritt konfigurierbar. `ResourceDefinition.createFlow` startet den Flow beim Anlegen aus einer Collection; `RelationDefinition.createForm.flow` kann ihn relationsspezifisch überschreiben oder mit `false` für eine einfache Erfassung deaktivieren.

- Vorwärts validiert und speichert den aktuellen Schritt. Fehler halten den Ablauf an.
- Zurück öffnet den bereits gespeicherten Datensatz zum Bearbeiten; es entsteht kein zweiter Vertragsentwurf. Ungespeicherte Änderungen erfordern eine Verwerfentscheidung.
- Der URL-Zustand enthält nur Flow-ID, Schritt, Ressourcennamen und gespeicherte IDs. Eingaben, Notizen und Ausweisdaten werden nicht serialisiert. Ungültige oder übersprungene Schritte werden abgewiesen.
- Nach Browser-Reload werden Bezüge und Datensätze neu geladen. Ein verlassenes Formular verwirft seinen Hydrierungscache; das Zurückkehren verwendet den aktuellen Stand.
- Oberste Flows können nach Abschluss zu einem gespeicherten Datensatz navigieren. Geschachtelte Flows schließen sich und kehren zum Elternformular zurück. Ressourcen- und KPI-Queries werden invalidiert.
- Ein Flow ist **keine Transaktion über mehrere HTTP-Aufrufe**: gespeicherte Zwischenschritte bleiben beim Abbruch erhalten. Die Oberfläche weist darauf hin. Automatische Kompensation, beliebige Verzweigungen, Freigabestufen und persistierte serverseitige Workflow-Instanzen sind nicht implementiert.

## 17. Vertragsakte, Dashboard und gemeinsame Gestaltung

`/contracts/:id` rendert eine eigene `contract-detail-page.tsx`. Die Seite komponiert Komponenten ohne lokale Styles. Die Übersicht enthält aktuelle monatliche Kondition, Kaution, Vertragsbeginn, Kündigungsfrist, Laufzeit, Beteiligte, nächste Aktionen und Notizen. Die aktuelle Kondition wird serverseitig nach Vertrag und `effective_from <= heute` gefiltert und absteigend sortiert; zukünftige Konditionen verfälschen die Übersicht nicht. Die Datumsgrenze verwendet Europe/Berlin.

Beteiligte, Konditionen, Kündigungen sowie aus- und eingehende Vertragsverknüpfungen besitzen eigene Tabs. `LazyTabs` synchronisiert den aktiven Tab mit der URL und mountet nur den aktiven Inhalt. Die Übersicht lädt eine begrenzte Kontaktzusammenfassung und die aktuelle Kondition; vollständige Relationslisten laden erst beim Tabwechsel. Tab-Counts stammen aus den API-Aggregaten. `openRelation` übernimmt den Vertragsbezug auch bei den Schnellaktionen der Übersicht.

Die Gestaltung orientiert sich an der bereitgestellten Referenz: warme neutrale Flächen, schwarze Hauptaktionen, kompakte gruppierte Navigation, ruhige Typografie, dünne Trennlinien und weiße Inhalte in REUI-Frames. Zentrale Farbwerte liegen in `resources/css/app.css`. `WorkspaceCard`, `WorkspaceColumns`, `PersonAvatar`, `PeopleGroup`, `BarChart` und die Dashboard-Blöcke sind wiederverwendbare Komponenten. `Avatar`, `AvatarGroup` und `Frame` stammen aus den dokumentierten öffentlichen Base-Nova-Registries. Avatar-Gruppen unterstützen Bilder, Initialen, Größen und einen Überlaufzähler.

Das Dashboard enthält bewusst gekennzeichnete **Beispieldaten** für Finanzen, Termine, Aufgaben und Mini-Kennzahlen. Zeitraum, Miete/Eingänge, Widget-Auswahl und Aufgaben-Checkboxen bedienen die lokale Vorschau; es werden keine fiktiven Zahlungsvorgänge gespeichert. Der Tab „Bestand“ lädt echte Kennzahlen und Objekte. Die Command-Palette (`Ctrl/⌘ K`) sucht in den registrierten, sichtbaren Bereichen; eine globale Datensatzsuche ist weiterhin ein eigener zukünftiger Ausbau.

## 18. PDF-Viewer und Grid-Performance

### PDF

Die React-Komponente `PdfViewer` nutzt den eingebauten PDF-Viewer des Browsers über ein `<object>`. **Keine zusätzliche PDF-Abhängigkeit:** `react-pdf`, `pdfjs-dist` und `vite-plugin-static-copy` wurden entfernt. Damit entfallen Renderer, Worker, CMaps, WASM und Fonts im Frontend-Build. Der bestehende Backend-Generator `setasign/tfpdf` bleibt für Objektberichte erforderlich.

```tsx
const PdfViewer = lazy(() => import("@/components/blocks/pdf-viewer"));
<Suspense fallback={<Loading />}>
    <PdfViewer url="/api/v1/…" name="Objektbericht.pdf" title="Objektbericht" />
</Suspense>;
```

Die React-Hülle bietet eine helle Fläche, Ladezustand, wiederholbare Fehler, Dateiname, „Öffnen“ und Download. **Zoom, Druck, Suche und Seitennavigation hängen vom PDF-Viewer des jeweiligen Browsers ab**; die Anwendung verspricht keine eigenen Canvas-Bedienelemente mehr. Unterstützt der Browser keine Einbettung, gibt es einen Download-Fallback. Action-Ergebnisse und hinterlegte PDF-Ausweise verwenden dieselbe Komponente.

Der Abruf bleibt authentifiziert auf derselben Origin unter `/api/`, prüft den PDF-MIME-Typ und verwendet ein AbortSignal. Blob-URLs werden beim Dokumentwechsel/Schließen freigegeben. Kein externer PDF-Dienst erhält Dokumente. Die Komponente wird erst beim Öffnen geladen.

### Grid

- Öffentliche REUI-DataGrid-Primitives einschließlich Spaltenfilter und virtueller Tabelle; keine kopierten kostenpflichtigen Pro-Blöcke.
- Suche mit Debounce; abgelöste HTTP-Anfragen werden über TanStack Query und `AbortSignal` abgebrochen.
- Bereits geladene Zeilen bleiben bei Paging/Filterwechsel sichtbar. Die Ansicht zeigt einen Ladeindikator und deaktiviert veraltete Auswahl-/Zeilenaktionen bis zur neuen Antwort. Initiales Laden verwendet REUI-Skeletons.
- Mehrfachfilter mit durchsuchbaren Optionen und ausgewählten Werten; serverseitiger `in`-Filter. Frühere skalare Filter-URLs bleiben lesbar und werden normalisiert.
- Zeilenfenster ab 50 Datensätzen, konfigurierbar. Die API-Seitengröße bleibt auf 100 beschränkt. Stabile leere Daten und über Referenzen aktualisierte Action-Instanzen verhindern unnötigen Neuaufbau bzw. veraltete Formularbezüge.
- Fixierter Tabellenkopf, eigene Scrollfläche und Pagination im Footer. Sortierung, Filter, Suche, Paging, Gruppierung und Sichtbarkeit bleiben URL-basiert; Spaltenbreite und Fixierung sind weiterhin Sitzungszustand.
- Form-Layer und Action-Dialoge werden zusätzlich bei Bedarf geladen; die PDF-Einbettung bleibt ein eigenes Lazy-Modul.

Ergänzte Regressionstests prüfen gespeicherte Flow-Schritte und Zurückbearbeitung ohne Duplikate, URL-Bereinigung, abgeschaltete Relationsfunktionen, Mehrfachfilter, PDF-Bedienung und Aufräumen sowie die serverseitige Auswahl der gültigen Kondition. Die Playwright-Suite wurde auf browsernative PDF-Einbettung und die neue Vertragsakte angepasst; ein erfolgreicher Browserlauf wird damit nicht behauptet.

Zusätzliche Primärquellen: [REUI Frame](https://reui.io/docs/components/base/frame), [REUI DataGrid-Beispiele](https://reui.io/components/data-grid), [Base-Nova Avatar](https://ui.shadcn.com/docs/components/base/avatar), [Base UI Combobox](https://base-ui.com/react/components/combobox), [REUI Checkbox](https://reui.io/components/checkbox).

## 19. Suchbare Auswahlfelder und Datumsgrenzen

`ChoicePicker` kapselt die bereits installierte Base-UI-Combobox und die Base-Nova-InputGroup. `RelationPicker` in `entity-picker.tsx` ergänzt nur den Datenprovider und die Neuanlage. Keine zweite Select-/Suchbibliothek wurde installiert. `MultiSelect` bleibt ein Kompatibilitätswrapper.

| Prop                              | Vertrag                                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `multiple`                        | Einzelwert oder Array; auch bei `kind: "select"` und `kind: "relation"`                                  |
| `clearable`                       | Löschsymbol/-aktion sichtbar; die Formularpflicht bleibt separat durch `required` definiert              |
| `creatable`                       | Nur Entity-Picker: reduzierte Neuanlage aktivieren/deaktivieren; prüft zusätzlich den Permission-Adapter |
| `filters`                         | Lomkit-Filter im Backend-Suchrequest; AND mit Suchtext, keine rein lokale Filterung                      |
| `displayText(row)` / `labelField` | Titel der Entity; Standard ist `resource.titleField`                                                     |
| `secondaryText(row)`              | Zusatztext ausschließlich im geöffneten Dropdown; standardmäßig eine abweichende Nummer                  |
| `maxSelected`                     | Auswahlgrenze; Entity-Picker höchstens 100, passend zum API-Seitenlimit                                  |
| `options`                         | Statische Werte mit `value`, `label`, optional `description`, `icon`, `badge`, `disabled`                |
| `placeholder`, `disabled`         | Platzhalter und vollständige Eingabesicherung                                                            |

```ts
{
    name: "contract_ids", label: "Verträge", kind: "relation",
    resource: "contracts", multiple: true, clearable: true, creatable: false,
    maxSelected: 10,
    filters: [{ field: "status", value: "active" }],
    displayText: (row) => String(row.code),
    secondaryText: (row) => `${row.starts_on ?? "—"} · ${row.status}`,
}
```

Das Beispiel ist eine **Felddefinition für einen passenden Array-Endpunkt**. Die vorhandenen skalaren `contract_id`-/`unit_id`-Fremdschlüssel bleiben skalar. Mehrfachauswahl erzeugt keine m:n-Persistierung und darf dort nicht einfach eingeschaltet werden. Der Backend-Endpunkt muss Array und Relation explizit unterstützen/validieren. Suchfilter sind Auswahlhilfe, keine Autorisierung oder serverseitige Mutationsregel. Organisationsgrenzen und aktivierte Permission-Adapter bleiben wie vereinbart einem späteren Ausbau vorbehalten.

Tab fokussiert das Suchfeld; Tippen startet direkt die Suche, ohne einen weiteren Klick. Nach dem Schließen stehen ausschließlich Titel im Eingabefeld. Mehrfachwerte werden als einzeilige, abgeschnittene Liste dargestellt; das Feld wächst nicht. Beim Wiederöffnen bleiben die tatsächlichen Werte selektiert. Der Löschbereich reserviert bei `clearable: true` dauerhaft seinen Platz. Mehrfach-Entities werden über **einen gebündelten ID-Filter** geladen, nicht über eine Anfrage je Auswahl. Suchergebnisse werden mit Debounce und AbortSignal geladen. Eine Neuanlage wird vor Übernahme gegen denselben Backend-Filter geprüft.

```ts
{ name: "starts_on", label: "Beginn", kind: "date", required: true,
  clearable: false, minDate: "2026-01-01", maxDate: "2027-12-31" }
{ name: "period", label: "Zeitraum", kind: "date-range", clearable: true,
  minDate: "2026-01-01", maxDate: "2026-12-31" }
```

`minDate`/`maxDate` sind inklusive ISO-Grenzen, begrenzen die Kalenderbedienung; dieselben fachlichen Grenzen müssen in der REST-Resource als Laravel-Regeln definiert sein. Monatspicker verwenden `YYYY-MM` bzw. den Monatsanteil einer ISO-Datumsgrenze. Bei Bereichen begrenzen Beginn/Ende einander. Die isolierte Komponenten-Demo prüft zudem vollständige Bereiche. Eine persistierte Fachressource muss vollständige/optionale Bereiche in ihren Serverregeln abbilden. Anzeige bleibt `dd.MM.yyyy`, Übertragung ISO. `clearable: false` unterdrückt Leeren und Abwahl desselben Kalendertags; es verhindert keine programmgesteuerten Defaults.

## 20. Key-Value-Liste und geschäftliche Checkbox-Komponenten

`EditableKeyValueList` ist ein eigener Framework-Block auf den vorhandenen REUI/Base-Nova-Primitives. Layout, Feldrenderer und Mutation liegen zentral, nicht in Pages. Standardmäßig ist jede Property nur lesbar. Erst `editable` erlaubt die Bearbeitung, zusätzlich zu `disabled`, `readonlyOnEdit` und dem vorhandenen `edit`-Permission-Adapter.

```tsx
<EditableKeyValueList
    resource={contracts}
    record={record}
    properties={[
        { name: "deposit_status", editable: true },
        { name: "payment_day", editable: (row) => row.status === "draft" },
        { name: "notes", editable: true },
    ]}
/>
```

Ein Klick öffnet genau ein Feld mit dem üblichen `BaseField` und Laravel-Fehlerrückgaben, ohne zusätzlichen Client-Resolver. Speichern sendet nur diese Property plus `updated_at` als Versionsprüfung. Abbrechen/Escape verwirft den lokalen Entwurf. Bei `422` bleibt die Eingabe bestehen, bei `409` kann der aktuelle Stand geladen werden; kein stilles Überschreiben. Schreibgeschützte Ausweisnummern werden niemals angezeigt. `render(value, record)` erlaubt eigene Lesedarstellung. Die **Vertragsakte / Übersicht / Vertragsverwaltung** demonstriert diese Komponente mit echten Mutationen.

`CheckboxList` unterstützt dynamische Optionen mit Titel, Beschreibung, Icon, Badge, gesperrten Einträgen, `layout: "list" | "cards"`, `searchable`, `selectAll` und `maxSelected`. „Alle sichtbaren“ betrifft nur die gefilterten und aktivierten Optionen; andere und gesperrte Auswahlen bleiben erhalten. Teil-Auswahl wird indeterminiert dargestellt. `kind: "checkbox-group"` und `kind: "checkbox-cards"` verwenden denselben Renderer. Für große Datenbestände ist der Entity-Picker geeigneter als Hunderte Checkboxen.

`BooleanPropertyList` verbindet mehrere vorhandene boolesche Model-Properties mit Checkbox-Karten und speichert die geänderten Properties unmittelbar, versionsgeprüft und ohne optimistische Erfolgsmeldung. Beispiel: **Einheit / Übersicht / Ausstattung direkt ändern** (`has_balcony`, `barrier_free`). Während einer Speicherung sind weitere Klicks gesperrt; Fehler lassen den bestätigten Serverstand bestehen. Das ist keine neue JSON-Ausstattungsspalte.

Sinnvolle Business-Bausteine sind damit abgedeckt: boolesche Einzelwerte, kleine Auswahlgruppen, erklärende Auswahlkarten, große durchsuchbare Relationslisten und einzelne Änderungen in einer Key-Value-Liste. Prüf-/Freigabe-Workflows mit eigener Fachlogik gehören weiterhin in Actions. Die Komponentenseite zeigt die Varianten interaktiv.

## 21. Standardmutation: nur die betroffene Tabellenzeile

Alle Edit-Sheets, Dialoge und direkten Feldänderungen verwenden `useSaveRecord`. Der Datenprovider fordert über Lomkits `response.includes`/`response.aggregates` die vollständige Projektion der **gespeicherten Zeile** an. Dazu gehören Beziehungen, Counts und berechnete API-Werte.

Nach erfolgreichem Speichern werden laufende Requests derselben Ressource abgebrochen und `patchRecord` ersetzt ausschließlich diese ID in vorhandenen Listen, Detail- und Panel-Caches. Unveränderte Zeilen behalten ihre Objektreferenz; Auswahl, Scrollposition und aktuelle Seite bleiben bestehen. Kein pauschaler Reload aller Ressourcentabellen. Fehler verändern keinen Cache.

Bei Änderung eines sortierten/gefilterten Werts bleibt die Zeile bis zum nächsten bewussten Aktualisieren, Seitenwechsel oder erneuten Aufruf an ihrer bisherigen Position. Die betroffenen Listen sind als veraltet markiert und werden dann serverseitig neu geordnet/gefiltert. Das verhindert ein überraschendes Verschwinden während der Bearbeitung. Erstellen invalidiert die Listen **der betroffenen Ressource**, weil sich deren Anzahl und Seitengrenzen ändern. Die generische Bulk-Bearbeitung übernimmt ebenfalls projizierte Zeilen in den Cache. Löschen und Fachaktionen ohne Zeilenprojektion behalten ihre explizite Reload-Strategie.

Bereits im Cache vorhandene Fremdschlüssel-Eltern werden gezielt als einzelne Datensätze nachgeladen und gepatcht, z. B. der Vertrag nach einer neuen Kondition. Ein fehlgeschlagener optionaler Elternrefresh macht eine bereits erfolgreiche Speicherung nicht rückgängig; der Cache wird dann als veraltet markiert. Im geöffneten Elternformular ergänzt `onSaved` den bestehenden Refresh mit `keepDirtyValues`. Kennzahlen werden als veraltet markiert und bei erneutem Aufruf oder explizitem Refresh neu geladen.

## 22. GitHub Action für echte Screenshots

`.github/workflows/screenshots.yml` läuft bei Push auf `main` oder manuell über **Actions → Workspace screenshots → Run workflow**. Eine isolierte SQLite-Datenbank wird migriert, mit `PropertySeeder` befüllt und mit dem ausschließlich für Tests vorgesehenen Benutzer versehen. Keine Produktionszugänge oder echten Mieterunterlagen sind erforderlich.

`npm run screenshots` startet Playwright mit Chromium, 1440 × 1000 Viewport, deutscher Locale, Europe/Berlin, hellem Modus und reduzierter Bewegung. Es wartet auf die tatsächlichen Ansichten, Schriftarten und Ladezustände und erstellt:

1. `01-dashboard.png`
2. `02-vertraege-tabelle.png` (Suche nach `MV-001`)
3. `03-vertrag-detail.png`
4. `04-vertrag-anlegen.png`
5. `05-vertrag-bearbeiten.png` (Detailseite → Bearbeiten, mit geladenen Formularwerten)
6. `06-grid-filter.png`
7. `07-bulk-auswahl.png` (schwebende Auswahlleiste)
8. `08-bulk-bearbeiten.png` (explizite Feldauswahl)
9. `09-feldaktionen.png` (Objektformular mit Untermenü im Textfeld)

Die Suite prüft außerdem, dass der aktive Tab-Inhalt unterhalb der Tab-Leiste die verfügbare Breite nutzt, kein horizontaler Seitenüberlauf entsteht und die Vertragsansicht samt Edit-Sheet bei 390 px funktioniert. Der Zeitraum muss vor dem ersten Öffnen „Dieser Monat“ anzeigen.

Das Artefakt **workspace-screenshots** enthält die PNG-Dateien und bleibt 14 Tage verfügbar. Bereits erstellte Aufnahmen werden auch bei einem späteren Testfehler veröffentlicht. Bei einem Browser-/App-Fehler wird zusätzlich `screenshot-diagnostics` mit Trace und Fehlerausgabe für 7 Tage hochgeladen. Fehler beim Start eines GitHub-Runners können dagegen keine Artefakte erzeugen.

Lokal nach der im README beschriebenen Testdatenbank-Vorbereitung: `npm run screenshots`. Ein vorhandener Browser kann optional mit `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/pfad/zu/chromium` verwendet werden. Der normale CI-Workflow testet weiterhin Anwendung/API und den vollständigen Browserablauf; die Screenshot-Suite ist separat.

Regressionstests decken Tastatursuche, Mehrfachauswahl/Vorauswahl, Backend-Filter, abgesicherte Datumsgrenzen, explizite Nullwerte, Checkbox-Auswahl, einzelne Cache-Zeilen, Inline-Validierung/Fehler und die projizierte Mutation über die echte Laravel-API ab. Ein fehlgeschlagener Browserstart ist keine erfolgreiche visuelle Abnahme.

## 23. Zentrales Layout und visuelle Korrekturen

Die Auswertung der echten CI-Aufnahmen zeigte vier gemeinsame Ursachen: falsche Orientierungsselektoren in `Tabs`, fehlende übersetzte Initialwerte im Zeitraum-Select, eine überladene Tabellen-Toolbar sowie uneinheitliche Wizard-Komposition. Die Korrekturen liegen in Komponenten, nicht in Seitenstyles.

| Bereich             | Standard und Erweiterungspunkt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Theme / AppShell    | Kühle neutrale Flächen, weiße Inhaltskarten, Blau für aktive Navigation, Aktionen und Diagramm-Hervorhebung. Farben einschließlich Sidebar zentral in `resources/css/app.css`. Kompakte einzeilige Marke ohne weiße Logokarte; Suche in Sidebar und per Strg/⌘ K. Kein zusätzlicher Suchbutton rechts im Header.                                                                                                                                                                                              |
| Tabs / LazyTabs     | Das `orientation`-Prop wird an Base UI weitergegeben. Selektoren verwenden dessen tatsächliches `data-orientation`. Horizontale Tabs stehen über dem Inhalt; vertikale Tabs daneben. Die Tab-Leiste darf innerhalb ihrer eigenen Breite scrollen; Panels bleiben `min-width: 0`. Aktiver Unterstrich, Zähler und Tastaturfokus zentral. URL und verzögertes Laden unverändert.                                                                                                                                |
| Karten / Kennzahlen | `WorkspaceCard` übernimmt lesbare Kopf- und Fußzeilen sowie umbrechende Actions. `WorkspaceColumns` besitzt begrenzte Grid-Spalten und `min-width: 0`. Ein einzelner sichtbarer Baustein belegt die volle Breite.                                                                                                                                                                                                                                                                                             |
| Dashboard           | Der Zeitraum verwendet denselben durchsuchbaren `ChoicePicker` im Menümodus wie Gruppierung und Filter. Bereits vor dem Öffnen erscheinen übersetzte Labels. Monats-/Quartalsauswahl passt Betrag, Titel und Balkenauswahl an. Die Demo-Kennzeichnung bleibt sichtbar.                                                                                                                                                                                                                                        |
| Balkendiagramm      | Gemeinsame gerundete Skala, dezente Hilfslinien, Planlinie und Blau-Hervorhebung. Mini-Diagramme zeigen ersten und letzten Monat außerhalb der schmalen Balkenspalten, ohne abgeschnittene Monatslabels. Tastaturfokus liefert dieselben Werte wie Hover.                                                                                                                                                                                                                                                     |
| Tabellen-Toolbar    | Gemeinsame, bei Platzmangel umbrechende Zeile: Suche → Filter hinzufügen / aktive Filter-Chips → kompakte Gruppierung; rechts Ressourcen-Actions → Export → Aktualisieren → Anlegen. Keine separaten Buttons „Spalten“ oder „Zeilendichte“. `columnChooser` steuert das Spalten-Untermenü in den Tabellenköpfen. `densityToggle` entfällt; die bestehende `dense`-URL-Einstellung bleibt lesbar. Auswahl und Zeilenaktionen haben feste, nicht skalierbare Spaltenbreiten; Badge-Spalten bekommen mehr Platz. |
| Overlay / FieldGrid | Sheet, Dialog, Header, scrollender Inhalt und Footer teilen dieselben Abstände. Standard-Sheets bis 52 rem. Das Feldraster richtet sich per Container Query nach seiner eigenen Breite; breite Felder belegen `col-span-full` und erzeugen bei schmalen Formularen keine zusätzliche Spalte.                                                                                                                                                                                                                  |
| WizardProgress      | Eine gemeinsame Komposition auf REUI-Stepper für Formulargruppen und gespeicherte Multi-Entity-Flows. Eine über die gesamte Breite gleichmäßig aufgeteilte Schrittnavigation mit Nummer bzw. Haken, weißem aktiven Segment, blauem Akzent und mobiler Kurzansicht. Nur bereits erreichbare Formulargruppen sind anklickbar. Persistierte Flows behalten ihre vorhandene Zurück-/Speicherlogik; der Fortschritt springt nicht über notwendige Mutationen hinweg.                                               |

API-Projektionen verwenden bei Includes und Aggregaten snake_case: `business_partner`, `related_contract`, `incoming_links_count`. Eloquent-Relationsnamen in Suchanfragen bleiben camelCase. Die Vertragsansichten verwenden die tatsächlichen Antwortschlüssel, damit Kontakte, Verknüpfungen und Zähler sichtbar werden.

Orientierung an den öffentlichen [REUI-Data-Grid-Kompositionen](https://reui.io/components/data-grid/c-data-grid-34) und [REUI-Stepper-Primitives](https://reui.io/docs/components/base/stepper); keine zusätzlichen Pakete oder kostenpflichtigen Blöcke.

## 24. Filter-Builder und einheitliche Auswahl

Die öffentlichen [REUI-Filters](https://reui.io/docs/components/base/filters) und [Wizard-Kompositionen](https://reui.io/blocks/application/wizard/wizard-1) dienen als Interaktionsvorbild. Die Umsetzung besteht aus den bereits installierten REUI-/Base-UI-Primitives. Es wird kein lizenzpflichtiger Pro-Block eingebunden und kein neues Paket benötigt.

`ResourceFilters` wird automatisch aus `resource.filters` aufgebaut. „Filter“ öffnet eine durchsuchbare Feldauswahl. Pro Feld entsteht ein Chip mit Feldname, **ist / ist nicht**, durchsuchbarer Mehrfachauswahl und Entfernen. „Zurücksetzen“ entfernt sämtliche Filter. Unvollständige Chips sind nur lokale Entwürfe und erzeugen keinen Serverfilter. Nach Auswahl des ersten Werts bleibt das Menü offen, auch während die URL asynchron aktualisiert wird. Ein Feld kann nur einmal vorkommen; mehrere Werte werden innerhalb dieses Feldes als Menge behandelt, verschiedene Felder per AND kombiniert.

```ts
filters: [
    {
        field: "status",
        label: "Status",
        options: opts(["draft", "active", "ended"]),
    },
    {
        field: "type",
        label: "Vertragsart",
        options: opts(["residential", "garage"]),
    },
];
```

Die Felder und Werte müssen zum tatsächlichen REST-Resource passen. Das Beispiel beschreibt die Konfiguration; es erweitert nicht automatisch das Backend-Enum. Der aktuelle Builder unterstützt diskrete Optionsfelder. Datums-, Betragsbereiche und verschachtelte OR-Gruppen bleiben bewusst separate Erweiterungen, statt einen unvollständigen generischen Query-Editor vorzutäuschen.

```json
{ "status": { "operator": "not in", "values": ["draft", "ended"] } }
```

So wird `filters` URL-kodiert gespeichert. `sanitizeGridFilters` akzeptiert nur registrierte Felder, bekannte Werte und die beiden unterstützten Operatoren; Duplikate und leere Regeln werden entfernt. Alte Links mit `{"status":"active"}` oder `{"status":["active"]}` bleiben gültig. `compileGridFilters` übersetzt in Lomkit-Filter mit `operator: "in" | "not in"` und `value: string[]`. Die Datenbank filtert den gesamten Bestand; der Browser filtert nicht nur die aktuell geladene Seite. Filteränderungen setzen die Seite auf 1 und heben Zeilenauswahl auf. `filterable={false}` deaktiviert die UI und URL-Filter, erhält aber die fest vorgegebenen Relationsfilter.

`ChoicePicker` besitzt jetzt drei Präsentationen mit derselben Auswahl-, Such- und Tastaturlogik:

| `presentation`    | Verwendung                                                                      |
| ----------------- | ------------------------------------------------------------------------------- |
| `input` (Default) | Formularfelder und asynchrone Entity-Picker; Tippen sucht direkt im Feld        |
| `menu`            | Gruppierung, Dashboard-Zeitraum und Filterauswahl; Button mit Suchfeld im Popup |
| `chip`            | Kompakte Operator-/Wertauswahl innerhalb eines Filter-Chips                     |

`triggerIcon` ist optional. Single/Multiple, Clearable, Disabled, Preselection, Optionsuche und Beschriftungen bleiben dieselben Props. Tab + Tippen öffnet auch Toolbar-Menüs direkt mit der Suche. Escape schließt ohne gespeicherte Auswahl zu löschen. Geschlossen erscheinen nur Titel; lange Mehrfachauswahlen werden innerhalb einer begrenzten Breite abgeschnitten und um die Anzahl ergänzt. Styles liegen ausschließlich in der gemeinsamen Komponente.

Das Theme verwendet Blau für Primäraktionen, Fokus, aktive Navigation und Diagramm-Akzente; neutrale Grau-/Weißflächen für Sidebar und Inhalt. Erfolgszustände sind blau, Warnungen amber, Fehler rot. Die zentrale Token-Datei gilt auch für Login und Overlays. Der Objektbericht behält seine eigenständige Berichtsvorlage.

## 25. Architekturprüfung der Domain-Klassen

Maßstab: Eine Domain-Action bleibt bestehen, wenn sie eine benannte fachliche Operation, Transaktion oder wiederverwendete Invariante kapselt. Reine HTTP-Autorisierung, Feldnamenübersetzung und Antwortformatierung gehören an die REST-Grenze. Eine Klasse pro CRUD-Methode ohne zusätzliche Fachlichkeit ist hier nicht nötig; diese Aufgaben übernimmt Lomkit bereits.

| Klasse                  | Entscheidung und Begründung                                                                                                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ActivateContract`      | Behalten. Aktivierung verlangt Entwurf, Mieter und Anfangskondition; Transaktion und gesperrter Vertrag bilden eine fachliche Zustandsänderung.                                                                             |
| `ConfirmTermination`    | Behalten. Kündigung und Vertrag werden gemeinsam geändert; nachgelagerte Konditionen blockieren den Abschluss. Das ist keine generische Statusänderung.                                                                     |
| `ValidateContract`      | Behalten. Mindestlaufzeit, Enddatum und Überschneidungen gehören zur Vermietungsdomäne. Gemeinsamer Aufruf über den Observer sichert verschiedene Schreibwege.                                                              |
| `ValidateUnit`          | Behalten und als einzige fachliche Prüfung nutzen. Aktives Objekt, Nummer im Objekt und Verschiebesperre bei Vertragshistorie gelten auch beim Klonen. Die doppelte Nummernprüfung in der REST-Clone-Action wurde entfernt. |
| `CloneProperty`         | Behalten. Transaktion, Prüftermin-Reset und optionales Kopieren physischer Einheiten sind fachliche Kopierregeln. `CloneUnit` wird explizit per Konstruktor injiziert.                                                      |
| `CloneUnit`             | Behalten. Physische Stammdaten kopieren, Zustand `ready`, keine Verträge oder Mieterdaten übernehmen. Derselbe Ablauf wird separat und beim Objekt-Klon verwendet.                                                          |
| `CloneDefaults`         | Behalten. Nummer, Kopiebezeichnung und `with_units` sind gemeinsame Produktvorgaben für Vorbelegung und Ausführung. Ein Modell-agnostischer Generator wäre derzeit nur zusätzliche Indirektion.                             |
| `CheckPropertyDeletion` | Behalten. Die beiden Regeln sind fachlich; Vorschau und Ausführung verwenden dieselbe Prüfung. `withExists` liefert die Vorprüfung gesammelt, ohne Einheiten zu laden.                                                      |
| `CalculateOverview`     | Behalten. Stichtag, laufende Verträge und wirksame Konditionen definieren Kennzahlen. Metric und PDF nutzen dieselbe Berechnung.                                                                                            |
| `BuildPropertyReport`   | Behalten. Ein konkreter fachlicher Bericht, kein zweites CRUD-System. Ein generisches PDF-Templating-Framework wäre erst bei mehreren wiederholten Berichtlayouts sinnvoll.                                                 |

Die fünf Property-Enums (`PropertyStatus`, `PropertyType`, `UnitStatus`, `UnitType`, `ManagementType`) bleiben ebenfalls: Sie begrenzen fachliche Werte und werden von Eloquent/REST wiederverwendet. Vertragszustände sind derzeit noch Strings. Ein späteres `ContractStatus`-Enum und die Ableitung der Frontend-Optionen aus API-Metadaten würden diese doppelte Werteliste verringern; ein neues Enum-Framework ist dafür nicht erforderlich.

### Bereits ins Framework gezogen: `App\Rest\Actions\CloneAction`

Die gemeinsame Basis übernimmt URI/Bezeichnung, Resource-Ziel, standardmäßig maximal einen Datensatz, `view` je Model sowie `viewAny`/`create`, Ausführung und die Antwort `data.result.data.ids`. Domain-Validierungsfehler werden am REST-Rand von z. B. `code` nach `fields.code` übersetzt; das Formular kann denselben Fehler direkt am Eingabefeld anzeigen.

Konkrete REST-Actions deklarieren weiterhin `fields()` und implementieren `cloneModel(Model $source, ActionFields $fields): Model`. Dort werden Backend-Defaults geladen und die jeweilige Domain-Action aufgerufen. So teilen Objekt und Einheit den Ablauf, ohne ihre Kopierregeln in ein allgemeines `replicate()`-Framework zu verschieben. Transaktionen des REST-Pakets und die fachliche Objekt-Transaktion bleiben erhalten.

### Nächste sinnvolle Erweiterungen – nicht als implementiert zu verstehen

- **Deklarative Löschregeln:** Sobald weitere Ressourcen dieselbe Kombination aus Status- und Relationsblockaden benötigen, kann ein `DeletionGuard` mit gebündelter `withExists`-Projektion Vorschau und Ausführung vereinheitlichen. Gegenwärtig ist die Objektregel der einzige vollständige Anwendungsfall; eine neue Rules-/Registry-Hierarchie würde mehr Code als Nutzen erzeugen.
- **Zustandsübergänge:** Wiederholte Transition-Metadaten (Label, Quellstatus, Permission, Bestätigung) lassen sich später zentral deklarieren. Fachliche Vorbedingungen und atomare Änderungen verbleiben in `ActivateContract`/`ConfirmTermination`.
- **Berichte:** Den bestehenden typisierten `document`-Return wiederverwenden. Erst bei mehreren Berichten gemeinsame PDF-Kopf-/Fußzeilen extrahieren; keine eigene Report-Engine im Voraus.
- **Performance:** `CalculateOverview` lädt derzeit Vertragsbeginn-Daten für die durchschnittliche Mietdauer. Bei großen Portfolios eine datenbankspezifische Aggregation oder inkrementelle Projektion mit Messung einführen. Kopieren großer Objekte kann als Job mit Fortschritts-Return erfolgen; für die aktuellen kleinen Objekte bleibt es synchron.
- **Nebenläufigkeit:** Für produktive Mehrbenutzerschreibzugriffe müssen Überschneidung und Lösch-/Anlage-Rennen zusätzlich unter der produktiven Datenbank mit parallelen Transaktionen geprüft werden. SQLite-Tests belegen keine PostgreSQL-/MySQL-Sperrsemantik. Keine Behauptung einer vollständigen Concurrency-Garantie aus dem aktuellen Testlauf.

Die Energieklasse am Objekt ist optional wie im Backend. Sie trägt deshalb kein `required` mehr; zuvor verhinderte diese widersprüchliche Felddefinition das Speichern eines ansonsten gültigen Wizards ohne Energieklasse.

Wizard-Weiter und Speichern haben getrennte React-Keys. Der Weiter-Klick unterbindet die native Default-Aktion vor der asynchronen Schrittvalidierung. So kann derselbe DOM-Button beim letzten Übergang nicht zu einem Submit-Button werden und unbeabsichtigt speichern. Ein Form-Submit vor dem letzten Schritt führt nur die Schrittvalidierung aus; erst der letzte Schritt darf persistieren. Unit- und Browserregression prüfen, dass vor dem ausdrücklichen Speichern keine persistierende Mutation erfolgt; Precognition-Anfragen an denselben Endpunkt werden separat behandelt.

## 26. Ein Server-Regelwerk für REST-Formulare

`ResourceEditor`, `ActionDialog` und `EditableKeyValueList` haben keinen Zod-Resolver mehr. Pflichtfelder, Eindeutigkeit, Wertebereiche und fachliche Regeln werden vom Server geprüft. `required`, `minDate`, `maxLength` usw. in einer Felddefinition beschreiben Darstellung und Bedienung; sie sind keine zweite Sicherheits- oder Geschäftsvalidierung. `schemaFor` ist nur noch eine optionale lokale Demo-Hilfe, nicht Teil des REST-Schreibwegs. Formular-Defaults liegen separat in `initial-values.ts`, damit normale CRUD-Formulare den Demo-Validator nicht laden.

Der installierte REST-v3-FormRequest unterstützt Laravel Precognition bereits. Deshalb wird **kein eigenes Validate-Endpoint, kein zusätzlicher Controller und kein neues npm-Paket** eingeführt. Die vorhandenen REST-Routen verwenden `HandlePrecognitiveRequests` hinter Authentifizierung und Rate-Limit:

```http
POST /api/v1/properties/mutate
Precognition: true
Precognition-Validate-Only: mutate.0.attributes.code,mutate.0.attributes.name
```

- `dataProvider.validate(resource, values, row?, only?)` verwendet denselben `mutationPayload` wie `save` und `saveMany`.
- Gültige Vorschau: HTTP 204, ohne Controller-Ausführung, Observer oder Speicherung. Fehler: HTTP 422 mit den regulären Feldpfaden.
- „Weiter“ wartet auf die aktuelle Serverprüfung; bei Fehlern bleibt der Schritt geöffnet und fokussiert das erste betroffene Feld. Netzwerkfehler erlauben kein unvalidiertes Weiterspringen.
- „Speichern“ führt die reguläre vollständige Mutation aus. Domain-Regeln in Observern, Versionskonflikte, Transaktionssperren und externe Zustandsänderungen werden erst dabei abschließend geprüft. Eine erfolgreiche Vorschau ist keine Reservierung und keine Garantie für eine spätere Speicherung.
- Gespeicherte Multi-Entity-Flows validieren und speichern beim Vorwärtsgehen. Sie verwenden dieselbe Serverfehler-Darstellung; bei Fehlern entsteht kein neuer Folgeschritt.
- Fremdschlüssel-Bindung, Autorisierung und Versionsprüfung bleiben serverseitige Verantwortlichkeiten. UI-Sperren ersetzen sie nicht.

Die PHP-Regression prüft Teilvalidierung ohne Speicherung, fehlende Anmeldung, kontextuelle Eindeutigkeitsregeln beim Update sowie unveränderte Daten nach der Vorschau. `tests/e2e/workspace.spec.ts` zählt nur persistierende Anfragen als Schreibzugriff.

## 27. Eine Action-API für Feld, Formular, Detail, Tabelle und Auswahl

| API                               | Bedeutung                                                                                                                                                                                     |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `placements`                      | Exakte Oberflächen: `field`, `form`, `detail`, `row`, `table`, `bulk`. Ohne Angabe gilt die bisherige `location`-Kompatibilität; Feld- und Tabellenaktionen sind ausdrücklich zu deklarieren. |
| `icon`, `label`, `description`    | Gemeinsame Beschriftung, Symbol und Hilfstext. Symbolbuttons besitzen einen zugänglichen Namen.                                                                                               |
| `group`                           | Beschriftete Menügruppen mit Trennlinien.                                                                                                                                                     |
| `children` / `ActionGroup`        | Rekursive Untermenüs; Gruppen werden nicht als Fachaktion ausgeführt. Kindaktionen werden separat auf Sichtbarkeit, Auswahl und Freigabe geprüft.                                             |
| `visible(row)`                    | Sichtbarkeit pro Datensatz; bei Mehrfachauswahl müssen alle Zeilen erlaubt sein.                                                                                                              |
| `enabled(context)`                | `true`, `false` oder deaktivierter Grund als Text. UI und Dispatcher prüfen die Freigabe; eine direkte `runAction`-Ausführung umgeht sie nicht.                                               |
| `bulk`                            | Mehrere Datensätze erlaubt. Bei `false` blockiert auch der Dispatcher mehrere IDs.                                                                                                            |
| `requiresRecord`                  | Standard `true`; `false` erlaubt Aktionen am ungespeicherten Formular bzw. ohne Zeilenauswahl.                                                                                                |
| `interaction`                     | `dialog` mit Vorbereitung/Bestätigung oder `immediate`. Auch direkte Aktionen verwenden Fehlerbehandlung und denselben Ergebnis-Dispatcher.                                                   |
| `refresh`                         | Standard `true`; `false` für reine Formularaktionen oder Aktionen mit eigener Zeilenprojektion.                                                                                               |
| `fieldsFor(context)`              | Dynamische Action-Felder, etwa die vom Resource-Schema freigegebenen Bulk-Felder.                                                                                                             |
| `prepare(context)`                | Asynchrone Defaults oder Blockaden vor dem Ausführen.                                                                                                                                         |
| `execute(context, confirmation?)` | Zugriff auf echte Zeilen, Instanz und Eingaben; Rückgabe entsprechend `ActionUIResult` bzw. dem REST-Ergebnisvertrag.                                                                         |

Die tatsächliche Anzahl und IDs sind stets eindeutig:

```ts
async execute({ rows, resource, values, instance }: ActionContext) {
    const ids = rows.map(row => row.id); // einzelne oder mehrere IDs
    const current = rows[0];            // bei einer Einzelaktion
    const formValues = instance.form?.getValues();
    // API-Aktion, openForm/openRelation/openFlow, refreshForm oder Rückgabe …
}
```

`values` enthält die eigenen Action-Eingaben; `instance.form` referenziert das übergeordnete Formular. `instance.formResource` benennt dessen Resource, was bei Actions aus Unterrelationen wichtig ist. `instance.table` liefert die Tabelleninstanz, `reload` den expliziten Reload. Änderungen am Formular allein sind noch keine Datenbankspeicherung.

### Feldaktionen ohne Seitenlogik

```ts
{
    ...text("name", "Bezeichnung", "general", true),
    suffixActions: [new PropertyNameActions()],
}
```

`prefixActions` und `suffixActions` werden bei Text-, E-Mail- und Zahlenfeldern innerhalb des zentralen `InputGroup` gerendert. `FormActionScope` stellt Ressource und Formular bereit. Nur Felder mit Actions abonnieren den Formularzustand für dynamische Freigaben. Gesperrte Felder sperren auch ihre Action-Buttons.

Das laufende Beispiel liegt in `modules/properties/name-actions.ts`: „Leerzeichen bereinigen“ liest den aktuellen Namen; „Adresse übernehmen“ liest Straße/Hausnummer aus demselben Formular. Ohne Straße ist die zweite Action mit Begründung deaktiviert. Beide funktionieren vor dem ersten Speichern und liefern einen `form-patch`, statt die Page zu manipulieren:

```ts
return {
    data: {
        result: {
            data: {
                ui: {
                    type: "form-patch",
                    values: { name: nextName },
                    message: "Bezeichnung übernommen.",
                },
            },
        },
    },
};
```

Für Datenbankänderungen weiterhin den Provider oder die Backend-Action aufrufen. `document` öffnet weiterhin die PDF-Komponente, `details` eine Ergebnisansicht. Unbekannte Ergebnisformen werden abgewiesen. Für eine eigene Formular-Komposition außerhalb des Editors sind `FormProvider` und `FormActionScope` explizit einzubinden.

`ActionMenu` und `ActionButtons` verwenden dieselben Definitionen. Die Collection bindet `table`, `row` und `bulk`, die Detailseite `detail`, der Editor `form`. Die eingebaute Edit-Aktion bleibt direkt; destructive Actions nutzen weiterhin Vorprüfung und Serverbestätigung. Die bestehenden expliziten Hauptbuttons „Bearbeiten“ bleiben erhalten.

## 28. Schwebende Auswahlleiste und native Mehrfachbearbeitung

`BulkActionBar` sitzt zentriert über dem Tabellenfooter, mit abgerundeter dunkler Fläche, Auswahlzahl, Actions und Aufheben-Button. Sie bleibt innerhalb der Collection; kleine Viewports dürfen umbrechen. Auswahl bleibt auf die aktuelle geladene Seite begrenzt und wird bei Wechsel von Suche/Sortierung/Filter/Seite zurückgesetzt.

Die Mehrfachbearbeitung ist eine einzige wiederverwendbare Action:

```ts
bulkEditable: ["manager_name", "manager_email", "manager_phone", "next_inspection_on"],
actions: [new BulkEditAction(), /* weitere Actions */],
```

Objekte demonstrieren Verwaltungsdaten, Verträge `deposit_status` und `notes`. Im Dialog muss jedes zu ändernde Feld ausdrücklich aktiviert werden. Nicht aktivierte Felder bleiben unberührt; ein aktiviertes optionales Feld darf bewusst geleert werden. Ohne Auswahl ist der Ausführen-Button gesperrt. Schreibgeschützte, deaktivierte und Write-only-Felder werden ausgeschlossen.

`saveMany` sendet **eine native REST-Mutation** mit ID/Version je Zeile. Es gibt keinen separaten Bulk-Controller und keinen Loop einzelner HTTP-Requests. REST-Validierung, Versionsprüfung und Transaktion gelten für die ganze Auswahl. Fehler oder ein Konflikt lassen alle Datensätze unverändert. `bulkEditable` steuert das Produktangebot der UI; die REST-Resource und Policies bleiben die Sicherheitsgrenze.

Die Antwort enthält projizierte `records`. Nur diese Zeilen und Details werden im Query-Cache ersetzt; die Liste wird ohne sofortiges Refetch als veraltet markiert. Das bewahrt Scrollposition, Auswahl und Sortierung wie beim normalen Edit. Elternformulare können über `refreshForm` gezielt nachladen.

## 29. Architekturentscheidung für weitere Fachmodule

Die Domain-Ordner aus Abschnitt 25 bleiben fachlich. Ein CRUD-Thema braucht **keine zusätzliche Domain-Klasse**, solange die Änderung mit Model, REST-Feldern, Laravel-Regeln und vorhandenen Relations-/Versionsfunktionen beschrieben ist. Thin REST-Controller bleiben die explizite Zuordnung zwischen URL und Resource. Sie enthalten keine Kopie der CRUD-Implementierung.

Konkrete Einsparungen dieses Updates:

1. Drei Formulararten verlieren ihren zweiten Client-Validator. Precognition und die bestehenden REST-Regeln ersetzen eine zusätzliche Validierungsschicht.
2. Single-Save, Validierung und Bulk-Save teilen `mutationPayload` und Fehlernormalisierung.
3. Zeilen-, Detail-, Formular-, Feld- und Bulk-Actions teilen `ResourceAction`, Freigabe und Render-Komponenten.
4. Mehrfachbearbeitung entsteht aus der Resource-Konfiguration statt je Domain aus einem neuen Controller/Service/Dialog.
5. Darstellung, Wizard, Filter, Palette und Auswahlleiste liegen zentral; Pages wählen nur Komponenten und Props.

Neue Ressourcen werden weiterhin mit Model/Migration, einer REST-Resource samt validierten Feldern und Relationsfreigaben, dem dünnen REST-Controller und einer UI-Resource registriert. Erst eine echte Fachoperation wie Aktivierung, Laufzeitüberschneidung, Kündigungsbestätigung oder fachliches Klonen rechtfertigt eine eigene Domain-Action. Kein generisches `BaseModel`, das jede Beziehung und jede Regel magisch ableitet: Das würde die heute sichtbaren Verträge und Sicherheitsgrenzen verstecken.

Ein späterer Metadaten-Adapter könnte REST-Enums, Labels und Eingabegrenzen in TypeScript generieren. Das ist **noch nicht implementiert**; derzeit werden UI-Feldtypen und Labels ausdrücklich definiert. Die Geschäftsvalidierung wird bereits heute nicht doppelt ausgeführt. Ebenso bleiben Organisationsgrenzen wie vereinbart verschoben.

Orientierung: [REUI Stepper](https://reui.io/docs/components/base/stepper), [öffentliche REUI-Wizard-Komposition](https://reui.io/blocks/application/wizard/wizard-1), [Filament Actions](https://filamentphp.com/docs/5.x/actions/overview), [Refine Forms](https://refine.dev/core/docs/guides-concepts/forms/) und [Laravel Precognition](https://github.com/laravel/docs/blob/13.x/precognition.md). Bestehende Bibliotheken werden genutzt; keine neue Laufzeit-Abhängigkeit.
