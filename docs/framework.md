# nextHV · Framework- und Fachmodell-Handbuch

Dieses Dokument beschreibt den aktuellen Framework-Stand einschließlich nativer PHP-Metadaten, Query-Tabs, View-/Edit-Sheets, Formular-Flows, Vertragsakte, direkter Feldmutationen und Screenshot-Workflow. Es ist die Anleitung zum Bauen weiterer CRUD-Fachmodule. Die bestehenden öffentlichen REUI-Komponenten bleiben die UI-Grundlage; Refine und Filament dienen als Architekturvorbilder, werden nicht zusätzlich als Laufzeit installiert. Die zusammenhängenden Konfigurationsbeispiele für den jüngsten Ausbau stehen in Abschnitt 34.

## 1. Einstieg und Betriebsmodell

- Laravel 13 + `lomkit/laravel-rest-api` 3, Sanctum-Session, Scramble/OpenAPI.
- React 19, React Router 7, TanStack Query, TanStack Table 9, React Hook Form; Geschäftsregeln der REST-Formulare werden ausschließlich auf dem Laravel-Server geprüft; Controls prüfen Eingabeformat und Bediengrenzen. Zod bleibt nur für die isolierte Komponenten-Demo und deren Tests.
- REUI Base Nova, Base UI, Tailwind 4; gemeinsame Farben und Abstände in `resources/css/app.css` und zentralen Komponenten.
- PHP 8.3+, Composer 2, Node 22.12+; CI verwendet Node 24/PHP 8.5. SQLite für lokale Entwicklung und Tests.
- `setasign/fpdf` (wie in s4v2) erstellt PDF-Berichte serverseitig. Die FPDF-Kernschriften unterstützen Windows-1252; UTF-8-Daten werden vor Messung und Ausgabe entsprechend konvertiert.

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

| Ebene                 | Ort                                                                              | Aufgabe                                                                                                                             |
| --------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Datenmodell           | `app/Models`, `database/migrations`                                              | Tabellen, Fremdschlüssel, Indizes, Casts, explizite Relationen                                                                      |
| Fachaktionen          | `app/Domain/Property/Actions`, `app/Domain/Contract/Actions`                     | Fachliche Änderungen, Klonen, Vertragsregeln, Kennzahlen, PDF-Erstellung                                                            |
| Integrität            | `app/Observers`                                                                  | Regeln auch bei Modelländerungen außerhalb eines einzelnen REST-Endpunkts                                                           |
| REST-Schema           | `app/Rest/Resources`                                                             | Felder, Regeln, Relationen, Versionen, Actions, berechnete Werte                                                                    |
| UI-Metadaten          | `app/Rest/Ui`, `config/ui.php`, `resources/js/framework/data/resource-schema.ts` | Native REST-Details erweitern und UI-Registry ergänzen: Optionswerte, Relationsziele, Picker-Scopes, Operatoren und Eingabehinweise |
| REST-Actions          | `app/Rest/Actions`                                                               | Autorisierung, Einzel-/Bulk-Ziel, Bestätigung, Übergabe an Fachaktionen, Ergebnisvertrag                                            |
| Zusätzliche Endpunkte | `app/Http/Controllers`                                                           | Login, private Dokumente, Clone-Defaults, PDF-Abruf                                                                                 |
| UI-Primitives         | `resources/js/components/ui`                                                     | Offizielle Base-UI-/shadcn-Bausteine                                                                                                |
| REUI                  | `resources/js/components/reui`                                                   | Öffentliche REUI-Quellen, einschließlich DataGrid, Stepper, TimePicker, NumberField und Alert                                       |
| App-Blöcke            | `resources/js/components/blocks`                                                 | AppShell, Cards, Listen, KPIs, Overlay, Layout, Auth, LazyTabs                                                                      |
| Formularfelder        | `resources/js/components/fields`                                                 | BaseField, ResourceField, CurrencyField, ChoicePicker, EntityPicker, CheckboxList, Datumspicker                                     |
| CRUD-Laufzeit         | `resources/js/framework`                                                         | Provider, Hooks, Form-Engine, Workbench, Actions, Navigation, Tabellen                                                              |
| Fachkonfiguration     | `resources/js/modules`                                                           | Ressourcen, Felder, Spalten, Relationslisten, fachliche UI-Actions                                                                  |
| Seiten                | `resources/js/pages`                                                             | Zusammensetzung der Komponenten ohne eigene Styles                                                                                  |

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

Vertragsbeteiligte lassen sich im Entwurf, bei aktiven und bei beendeten Verträgen anlegen, ändern und entfernen. Duplikate derselben Person/Rolle und mehrere Hauptkontakte derselben Rolle bleiben ausgeschlossen. Der letzte Mieter eines aktiven Vertrags darf weder gelöscht noch in eine andere Rolle geändert werden. Der Vertragsbezug einer bestehenden Beteiligung bleibt unveränderbar. Diese Beteiligungen besitzen keine zeitliche Historisierung; ihre Bearbeitbarkeit ist keine Historienfunktion. Konditionshistorie und geschützte Vertragskerndaten behalten ihre eigenen Regeln.

Kündigungen werden zunächst erfasst; erst die bestätigte Backend-Action setzt das Vertragsende. Die erfassten Fristen sind Vertragsangaben. Eine rechtliche Bewertung oder automatische Berechnung gesetzlicher Kündigungsfristen ist nicht implementiert.

Ausweisnummern sind verschlüsselt und schreibbar, aber nicht über die API auslesbar; angezeigt werden nur die letzten vier Zeichen. Dateien werden privat und verschlüsselt gespeichert. PDF/JPEG/PNG bis 10 MB, authentifizierter Download ohne Cache. `APP_KEY` muss dauerhaft erhalten bleiben.

## 4. Ressourcen schnell ergänzen

1. Migration, Model, Relationen und gegebenenfalls Enum anlegen.
2. Fachregeln in eine Domain-Action; relevante Invarianten über Observer absichern.
3. REST-Resource, Controller und Policy erstellen; Route unter `api/v1` registrieren. Enum-Werte und Relationen dort definieren, Optionslabels in `config/ui.php` und optionale Picker-Scopes am PHP-Feld hinterlegen.
4. Frontend-Definition im passenden Fachordner anlegen und in `modules/registry.ts` aufnehmen. `select(name, label, group?)` und `relation(name, label, group?)` verwenden; Wertelisten und Relationsziele kommen aus den nativen Details der PHP-Resource.
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
};
```

Die Registrierung erzeugt Menüeinträge, Listen-, Detail- und Formularansichten. `navigation: false` unterdrückt nur den Menüeintrag; eine Ressource bleibt für Relationslisten und Direktlinks verfügbar. `navigationGroup` erzeugt aufklappbare Bereiche, aktuell Stammdaten, Vermietung und Dokumente. Berechtigungsprüfungen laufen über den zentralen abschaltbaren Adapter.

## 5. Einheitliche Feldkomponenten

Jedes `ResourceField` verwendet `BaseField`: Label, Pflichtkennzeichnung, I-Icon mit Popover, Beschreibung, Sperrhinweis, Fehlerzuordnung und optionalen Zähler. IDs und `aria-describedby` verbinden Hinweise mit dem Eingabeelement. Text- und Zahlenfelder benutzen die vorhandenen Primitives; Select, Dialog, Popover und Fokussteuerung stammen aus Base UI.

| `kind`                             | Verhalten                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `text`, `email`                    | Kontrollierte Eingabe und Eingabehinweise; fachliche Mindest-/Maximallänge und E-Mail-Gültigkeit prüft Laravel      |
| `textarea`                         | Mehrzeilig, `rows`, Live-Zeichenzähler, `minLength`, `maxLength`                                                    |
| `number`                           | Numerischer Formwert, `min`, `max`, `step`                                                                          |
| `currency`                         | REUI NumberField mit deutscher Betragsdarstellung, `EUR`, numerischem Formwert und zwei Nachkommastellen            |
| `select`                           | Suchbare Einzel-/Mehrfachauswahl (`multiple`) aus `options`                                                         |
| `multiselect`                      | Suchbare Mehrfachauswahl, einzeilige Titel, optionales Leeren                                                       |
| `checkbox`                         | Einzelner boolescher Wert                                                                                           |
| `checkbox-group`, `checkbox-cards` | Dynamische Listen/Karten, Suche, Select-all, deaktivierte Optionen, Auswahlgrenze und Array-Wert                    |
| `relation`                         | Serverseitige Suche/Filter, Einzel-/Mehrfachauswahl, Titel/Subtext, abschaltbare Neuanlage                          |
| `date`, `month`, `time`            | Kalender-/Monats-/Zeitpicker                                                                                        |
| `date-range`, `month-range`        | Beginn/Ende mit gegenseitigen Kalendergrenzen; Vollständigkeit und fachliche Gültigkeit gehören in die Serverregeln |

Gemeinsame Props: `required`, `nullable`, `default`, `description`, `help`, `placeholder`, `disabled`, `lockedReason`, `readonlyOnEdit`, `writeOnly`, `group`, `reduced`. `validate(value, values)` gehört ausschließlich zur isolierten Demo, nicht zum REST-Formular. Der Metadaten-Adapter ergänzt native Nullbarkeit, Schreibmöglichkeiten und einfache Eingabegrenzen; er führt die Laravel-Regeln nicht im Browser erneut aus.

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

Ob leere Felder und Mehrfachwerte zulässig sind, entscheiden die PHP-Regeln. Pflichtmarkierungen, Zähler und Picker unterstützen die Eingabe. Das Backend muss Array-Felder und deren zulässige Werte ausdrücklich erlauben; ein UI-Prop erzeugt keine Datenbankspalte.

### CurrencyField

Die editierbare Zahl erscheint als `1.234,50`; daneben steht `EUR` als eigener, nicht bearbeitbarer Suffix außerhalb des Inputs. `1234.5` wird im Formular und JSON geführt und als `DECIMAL(12,2)` gespeichert. Das Suffix ist über `aria-describedby` zugeordnet. Kein Cent-Multiplikator. Die REUI/Base-UI-Komponente übernimmt Parsing, Gruppierung und Darstellung, React Hook Form den numerischen Zustand. Leeren ergibt `null`; Nullbetrag `0` bleibt erhalten. Laravel prüft beim Speichern den Wertebereich und maximal zwei Nachkommastellen. Die Eingabekomponente übernimmt ausschließlich Zahlenformat und Bediengrenzen.

Alle bestehenden Geldfelder, darunter Miete, Nebenkosten, Heizung und Kaution, verwenden diesen Baustein. `currency` und `locale` sind konfigurierbar. Die Komponentenseite demonstriert auch Counter, Hilfetext, Checkboxgruppe und Mehrfachauswahl.

### Datumsdarstellung

Tabellenspalten mit `kind: "date"` werden zentral als **dd.MM.yyyy** dargestellt. Dafür ist kein zusätzlicher Formatstring im Fachmodul nötig. Die Formatierung erfolgt jetzt auch bei einem anklickbaren Titelfeld wie `RentCondition.effective_from`. Das Backend erhält weiterhin ISO-Daten (`yyyy-MM-dd`).

## 6. Sheet, Dialog, Wizard und Direktlinks

- Formular-Sheets bis 48rem breit, auf Desktop eingerückt und abgerundet, mobil bildschirmbreit. `size: "wide"` erlaubt bis 64rem.
- Fester Header mit Icon, Titel, optionalem Badge/Subtext sowie Werkzeugen rechts; eigener scrollbarer Inhalt und fester Footer. Wizard-Schritte stehen horizontal zentriert im festen Kopfbereich unter dem Titel, auch mobil. Eine optionale `editor.summary` steht bei ausreichender Breite neben den Feldern, sonst darunter.
- Dialoggrößen `compact`, `form`, `wide`; kompakt für Bestätigungen, breit für PDF-Vorschauen.
- Speichern/Weiter rechts, Abbrechen daneben, Zurück links. Im Wizard steht kein zusätzlicher Schritttext im Footer. Schließen, Escape und Abbrechen durchlaufen denselben Dirty-Check; laufendes Speichern blockiert Schließen.
- Wizard validiert den aktuellen Schritt mit Laravel Precognition vor Weiter, bewahrt Werte beim Zurückgehen und springt bei Fehlern in den betreffenden Schritt.
- Mehrere Serverfehler erscheinen gesammelt ohne identische Wiederholungen; konkrete Feldfehler bleiben am Feld sichtbar.
- Jede Neu-/Bearbeiten-/View-Ansicht erhält standardmäßig lesbare URL-Parameter, z. B. `?panel=units/new&parent=properties/16&bind=property_id&reduced=1` oder `?panel=contracts/8/edit`. Ein neu geladener Link lädt den Datensatz erneut über die API. Abschnittsbearbeitung ergänzt eine Feldliste und die Rückkehr zur Ansicht.
- In der URL stehen Ressource, Modus, ID, Darstellungsart und Relationskontext. Ungespeicherte Formularinhalte, Ausweisnummern und Callbacks werden nicht serialisiert.
- Browser-Zurück/Navigation fragt bei ungespeicherten Formularen nach. Für Reload/Tab-Schließen wird der native Browserhinweis verwendet.
- Bis zu acht verschachtelte Formulare. Eltern bleiben gemountet und rücken visuell zurück; Base UI übernimmt Fokus und Modalverhalten. Reduzierte Bewegung wird berücksichtigt.
- Keine Sheet-/Dialog-Umschalter in Listen oder Relationslisten. Die Oberfläche wird über `presentation` im Formularaufruf bzw. `createForm`/`editForm` konfiguriert; Direktlinks behalten diese Wahl.

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

| Prop                                  | Default / Bedeutung                                                                                             |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `searchable`                          | `true`; Suchfeld, Clear-Button, 250-ms-Debouncing                                                               |
| `pagination`                          | `true`; serverseitige Seiten mit 10/25/50/100 Zeilen                                                            |
| `pagination={false}`                  | Begrenzte Liste bis 100 Zeilen, ausdrücklich angezeigte Begrenzung                                              |
| `rowSelection`                        | `"multiple"`; auch `"single"`, `false` oder `(row) => boolean`                                                  |
| `doubleClickEdit`                     | `true`; Doppelklick auf normale Zellen öffnet Edit; Buttons/Links bleiben eigenständig                          |
| `syncWithLocation`                    | `true`; Zustand aus URL, auch bei Zurück/Vorwärts                                                               |
| `urlKey`                              | Optionaler Präfix für unabhängige Tabellen auf derselben Seite                                                  |
| `resizable`, `pinnable`               | `true`; Spaltenbreite und Fixieren über REUI                                                                    |
| `compact`                             | Relationsliste mit begrenzter Höhe, kleinerer Standardseite und eigenem URL-Präfix                              |
| `filterable`, `groupable`             | Unabhängig schaltbar; Standard Hauptliste `true`, kompakte Relation `false`                                     |
| `views`                               | Query-Tabs; Standard `resource.views` bei Hauptlisten, kompakt aus; `false` blendet sie aus                     |
| `toolbarFilters`                      | Feldnamen derselben Filterdefinitionen für direkte Auswahl-/Relationsfilter; Standard `resource.toolbarFilters` |
| `viewMode`                            | `"page"` als Standard; `"sheet"` / `"dialog"` öffnet einen echten Lesemodus über den Datensatzlink              |
| `fixedFilters`, `defaults`, `context` | Serverseitige Relationsfilter, Vorbelegung und gesperrter Bezug                                                 |
| `onSaved`, `form`, `formResource`     | Rückkopplung an ein übergeordnetes Formular                                                                     |

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

Weitere Funktionen: serverseitige Sortierung, registrierte Filter, Spaltenauswahl und Spaltenverschiebung über das REUI-Kopfmenü, Refresh, Lade-/Fehlerzustände und explizite Bulk-Actions. Die Spaltenreihenfolge/-breite/-fixierung bleiben sitzungsbezogener Tabellenzustand; die URL persistiert View, Suche, Seite, Seitengröße, Sortierung, Filter, Gruppierung, Sichtbarkeit und Dichte.

Die Hauptliste füllt die nach Header, KPI-Bar, Abständen und Toolbar verfügbare Höhe. `TableViewport` ist der einzige native vertikale Scrollbereich; der Kopf bleibt sticky, der Footer mit Seitenauswahl rechts liegt außerhalb. Relationslisten verwenden eine kompaktere maximale Höhe. Leere Ergebnisse ersetzen nur den Tabellenkörper; Kopf, Toolbar und Footer bleiben stehen. Eine schwebende Auswahlleiste ist ein Overlay und ändert weder Höhe noch Padding. Auf sehr niedrigen Viewports kann der Inhaltsbereich entsprechend klein werden.

Gruppierung bezieht sich auf die aktuell serverseitig geladene Seite und nennt ausdrücklich die Anzahl **auf dieser Seite**. Es wird nicht der gesamte Datenbestand in den Browser geladen. Zeilenauswahl wird bei Wechsel von Seite, Suche, Sortierung oder Filtern aufgehoben. Bulk-Actions erhalten nur die tatsächlich ausgewählten Zeilen der geladenen Seite.

Der CSV-Button exportiert die Auswahl oder die aktuelle Seite, jeweils die sichtbaren Spalten. Er ist kein unbeschränkter Gesamtexport. Trennzeichen `;`, UTF-8 mit BOM, Anführungszeichen-Escaping und Schutz gegen typische Tabellenformeln. Custom-Renderer werden nicht als HTML exportiert; `column.exportValue(row)` bestimmt optional den Exportwert; Avatargruppen und Tags werden sonst als Namensliste exportiert, andere Zellen mit ihrem API-Feldwert.

## 8. Actions und Löschblockaden

Eine `ResourceAction` definiert `id`, `label`, optional `icon`, `description`, `group`, `children`, `placements`, `bulk`, `destructive`, `fields`/`fieldsFor`, `visible`, `enabled`, `prepare` und `execute`. `location` bleibt als kompatible ältere Kurzform erhalten; die vollständige API steht in Abschnitt 27. Der Kontext liefert:

- `rows`: tatsächliche ausgewählte Datensätze;
- `resource`: die Ressourcendefinition;
- `values`: Action-Eingaben; verbindliche Prüfung erfolgt durch den Server beim Ausführen;
- `instance.reload`, `openForm`, `navigate`, `table`;
- optional `instance.form`, `formResource` und `refreshForm`.

`bulk = false` verbietet mehrere Zeilen auch im Ausführungsweg. Die Backend-Action setzt unabhängig davon `maxResources` und prüft Policies. Das Frontend ersetzt keine serverseitige Autorisierung.

### Löschregeln am Objekt

Nach der einmaligen Bestätigung im Dialog sendet die UI genau einen `DELETE /api/v1/{resource}` mit den ausgewählten IDs. Es gibt keinen Vorprüfungsendpunkt, keine `deletionCheck`-Option, keine Blockaden-Vorschau und keinen Lösch-Token mehr.

`PropertyObserver::deleting` prüft die fachlichen Regeln direkt bei der Ausführung: aktive Objekte sowie Objekte mit Einheiten (auch soft-gelöschten) bleiben erhalten. Andere Modelle verwenden ihre vorhandenen Observer. Die native REST-Transaktion rollt die gesamte Mehrfachlöschung zurück, sobald ein Datensatz abgelehnt wird. Fehler kommen als verständliche Backend-Meldungen zurück und werden im selben Dialog angezeigt; die Auswahl bleibt erhalten. Ein erneuter Versuch erfolgt nur nach einem weiteren bewussten Klick.

### Clone-Defaults

`CloneDefaults` bestimmt Nummer und Bezeichnung im Backend. Die UI lädt diese Werte vor dem Öffnen der Action-Eingabe; ohne übergebene Werte erzeugt auch die Backend-Action ihre Defaults. Nummer und Bezeichnung können vor dem Klonen geändert werden.

`CloneProperty` kopiert Objektstammdaten, setzt das neue Objekt auf aktiv und entfernt den nächsten Prüftermin; optional werden Einheiten kopiert. `CloneUnit` kopiert die physischen Stammdaten und startet mit Zustand `ready`. Verträge, Partnerzuordnungen, Kündigungen, Ausweise und Konditionen werden nie mitkopiert. Die daraus folgende fehlende Vermietung ergibt sich aus fehlenden Verträgen.

## 9. Custom-Actions und typisierte Ergebnisse

Am Objekt sind zwei ausführbare Beispiele vorhanden:

| Frontend                | Backend                                        | Ergebnis                                                                |
| ----------------------- | ---------------------------------------------- | ----------------------------------------------------------------------- |
| `InspectPropertyAction` | `InspectProperty`                              | Zugriff auf Model, Einheitenzahl/-fläche und Stammdaten; Details-Dialog |
| `PropertyReportAction`  | `CreatePropertyReport` → `BuildPropertyReport` | FPDF-Objektbericht, automatische Vorschau und Download          |

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

Für PDF-Ergebnisse erzeugt das Backend eine zehn Minuten gültige relative signierte URL, gebunden an den aktuellen Benutzer. Der Abruf prüft erneut Authentifizierung, Policy, Signatur und Benutzer-ID. Die Antwort ist `application/pdf`, `private, no-store` und `nosniff`. Das Frontend akzeptiert nur dieselbe Origin unter `/api/`, prüft den MIME-Typ, lädt mit Sitzung und gibt erzeugte Blob-URLs nach dem Schließen frei. Die Darstellung übernimmt ein bei Bedarf geladener PDF.js-Canvas-Viewer mit Zoom und Seitennavigation; Öffnen in neuem Tab und Download liegen in den zentralen Sheet-Actions (Abschnitt 45).

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

Objekt- und Vertragsliste besitzen eine gemeinsame, such- und filterabhängige KPI-Leiste oberhalb ihrer Toolbar (siehe Abschnitt 32). Die Objekt-Detailseite zeigt weiterhin monatliche Grundmiete und Jahreshochrechnung, Belegung, Nebenkosten/Heizung sowie durchschnittliche Mietdauer laufender Verträge und filtert die Berechnung auf das Objekt. Die Zahlen beruhen auf heute gültigen Vertragskonditionen, nicht auf verbuchten Zahlungseingängen.

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
| `GET /api/v1/properties/{id}/clone-defaults`    | Objekt-Klonvorbelegung                                     |
| `GET /api/v1/units/{id}/clone-defaults`         | Einheiten-Klonvorbelegung                                  |
| `GET /api/v1/properties/{id}/report?...`        | Signierter PDF-Abruf                                       |
| `POST/GET /api/v1/identity-documents/{id}/file` | Private Ausweisdatei                                       |

Session-Endpunkte: `/auth/user`, `/auth/login`, `/auth/logout`; Sanctum-CSRF, Same-Origin-Credentials und Login-Rate-Limit. `/docs/api` ist authentifiziert geschützt.

Updates übertragen `updated_at` als `version`. Bei `409` kann das Formular aktualisiert werden; lokale Dirty-Werte bleiben erhalten und müssen geprüft werden. `422` wird in Feldfehler und Fehlerliste übersetzt. Nach dem Klick im Action-Dialog wird ein `428`-Token einmal mit unveränderten Eingaben und derselben Auswahl zurückgesendet. Es gibt keine zweite Bestätigungsstufe; währenddessen sind Submit und Schließen gesperrt. Nach Mutationen werden Ressourcen- und Kennzahlenqueries invalidiert.

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

Featuretests decken unter anderem Auth, Seeder, Verträge, Historie, Dokumentenschutz, Versionskonflikte, Bestätigung, deaktivierte Permissions sowie direkte Löschfehler und transaktionales Zurückrollen einer Mehrfachlöschung, Klondefaults, virtuelle schreibgeschützte Felder und den PDF-Abruf ab. React-Tests prüfen Wizard/Dirty-State, echte REUI-Tabellen, URL-Zustand, Deep-Link-Hydrierung, Browser-Zurück, geschachtelte gesperrte Relationsformulare, Currency-Parsing, Mehrfachauswahl, Datumsformat und mehrteilige Alerts.

Die Playwright-Suite prüft die Oberfläche mit einer isolierten Testdatenbank; der separate Screenshot-Workflow erzeugt die Aufnahmen aus Abschnitt 22. Ein blockierter oder fehlgeschlagener Browserstart ist keine visuelle Abnahme. PDF-Canvas-Rendering, responsive Details und die tatsächliche Zielumgebung müssen geprüft werden; Komponententests ersetzen keine pixelgenaue Browserabnahme.

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

`collection` gilt für alle Oberflächen; `editorCollection` überschreibt einzelne Optionen im Editor. `createForm` und `editForm` bestimmen unabhängig Darstellung, reduzierte Felder und Wizard. Ohne feste Darstellung gilt der zentrale Sheet-Standard. `binding: "locked"` ist der Standard: Vorbelegung, sichtbarer Sperrhinweis und erzwungener Bezug beim Speichern. `prefill` trägt den Bezug editierbar ein; `none` übernimmt keinen Bezug. Die zugrunde liegende Liste bleibt weiterhin auf den übergeordneten Datensatz gefiltert. Fachlich unveränderbare Backend-Felder bleiben auch bei `prefill` unveränderbar.

Bei einem Edit-Direktlink lädt das Framework den Datensatz und prüft, ob sein Fremdschlüssel zum angegebenen Elternbezug passt. Diese Prüfung ist eine Konsistenzprüfung der UI; Backend-Validierung, Authentifizierung und vorhandene Versionskontrolle gelten weiterhin. Sie ersetzt keine Berechtigungs- oder Organisationsprüfung.

### Fähigkeiten einer Collection

| Option                                       | Verhalten                                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `searchable`, `filterable`, `groupable`      | Suche, Mehrfachfilter, Gruppierung jeweils aktivieren; deaktivierte Funktionen wenden auch entsprechende URL-Werte nicht an                       |
| `pagination`                                 | Seitennavigation ein-/ausblenden; ohne Paging höchstens 100 Einträge, Gesamtzahl und Grenze bleiben sichtbar                                      |
| `rowSelection`                               | `false`, `single`, `multiple` oder Prädikat pro Datensatz                                                                                         |
| `actions`                                    | Alle registrierten Actions, `false` für keine oder eine Allowlist wie `["edit", "inspect"]`; gilt für Zeilen, Auswahl und Doppelklick-Bearbeitung |
| `create`, `detailLink`, `doubleClickEdit`    | Hinzufügen, Titel-Link und Doppelklick unabhängig schalten                                                                                        |
| `columnChooser`, `exportable`, `refreshable` | Spaltenmenü im Tabellenkopf und übrige Werkzeuge unabhängig konfigurieren                                                                         |
| `toolbar`                                    | Gesamte Werkzeugleiste ein-/ausblenden; Fähigkeiten bleiben separat konfigurierbar                                                                |
| `resizable`, `pinnable`                      | Spaltenbreiten und Fixierung steuern                                                                                                              |
| `virtualized`                                | `"auto"` ab 50 geladenen Zeilen, `true` oder `false`; gruppierte Seiten verwenden ihre einzelnen Gruppen-Tabellen                                 |
| `syncWithLocation`, `urlKey`                 | URL-Synchronisation und isolierter Namensraum für mehrere Tabellen                                                                                |

CSV exportiert die aktuelle Seite bzw. Auswahl, nicht stillschweigend den gesamten Datenbestand. Paging aus bedeutet bewusst keinen unbegrenzten Download. Für umfangreiche Historien kann dieselbe Relation Paging aktivieren.

### Legacy-Flows mit gespeicherten Zwischenschritten

`framework/forms/flow.ts` definiert das optionale Ablaufmodell; Fachdefinitionen liegen im jeweiligen Modul und werden in `modules/flows.ts` registriert. `modules/contracts/contract-flow.ts` bleibt für bestehende `new-contract`-Direktlinks registriert. Der normale Anlegen-Button verwendet diesen Flow nicht mehr, sondern `createRelations` und eine gemeinsame atomare Mutation (siehe unten). Nur ein ausdrücklich geöffneter Legacy-Flow arbeitet wie bisher:

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

`source` referenziert einen gespeicherten Schritt oder `parent`. Darstellung, Wizard und reduzierte Erfassung sind pro Schritt konfigurierbar. Ein ausdrücklich gesetztes `ResourceDefinition.createFlow` startet den Flow beim Anlegen aus einer Collection; der aktuelle Vertrag setzt dieses Prop nicht mehr. `RelationDefinition.createForm.flow` kann ihn relationsspezifisch überschreiben oder mit `false` für eine einfache Erfassung deaktivieren.

- Vorwärts validiert und speichert den aktuellen Schritt. Fehler halten den Ablauf an.
- Zurück öffnet den bereits gespeicherten Datensatz zum Bearbeiten; es entsteht kein zweiter Vertragsentwurf. Ungespeicherte Änderungen erfordern eine Verwerfentscheidung.
- Der URL-Zustand enthält nur Flow-ID, Schritt, Ressourcennamen und gespeicherte IDs. Eingaben, Notizen und Ausweisdaten werden nicht serialisiert. Ungültige oder übersprungene Schritte werden abgewiesen.
- Nach Browser-Reload werden Bezüge und Datensätze neu geladen. Ein verlassenes Formular verwirft seinen Hydrierungscache; das Zurückkehren verwendet den aktuellen Stand.
- Oberste Flows können nach Abschluss zu einem gespeicherten Datensatz navigieren. Geschachtelte Flows schließen sich und kehren zum Elternformular zurück. Ressourcen- und KPI-Queries werden invalidiert.
- Ein Flow ist **keine Transaktion über mehrere HTTP-Aufrufe**: gespeicherte Zwischenschritte bleiben beim Abbruch erhalten. Die Oberfläche weist darauf hin. Automatische Kompensation, beliebige Verzweigungen, Freigabestufen und persistierte serverseitige Workflow-Instanzen sind nicht implementiert.

### Wiederholbare Unterdatensätze bei der Anlage: `createRelations`

Der Standard-Button **Vertrag anlegen** öffnet den normalen Resource-Editor mit wiederholbaren Beteiligten und Konditionen. Die Kinder bleiben bis zum abschließenden Speichern Formularwerte. Weiter/Zurück im Wizard speichert keine Zwischendatensätze. Eine neue Resource braucht dafür weder eine eigene Formularseite noch kopierte Felddefinitionen:

```ts
createRelations: [
    {
        relation: "parties",
        resource: () => parties,
        foreignKey: "contract_id",
        label: "Vertragsbeteiligte",
        singular: "Beteiligter",
        group: "parties",
        defaults: () => ({ role: "tenant" }),
    },
    {
        relation: "conditions",
        resource: () => conditions,
        foreignKey: "contract_id",
        label: "Konditionen",
        singular: "Kondition",
        group: "conditions",
        defaults: (parent) => ({ effective_from: parent.starts_on || null }),
    },
],
```

| `CreateRelationDefinition`      | Bedeutung                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `relation`                      | Name der nativen PHP-Relation und des Arrays im Formular                                                |
| `resource: () => childResource` | Vorhandene, mit PHP-Metadaten ergänzte Child-Resource; keine doppelte Feld-/Optionspflege               |
| `foreignKey`                    | Vom Parent abgeleiteter Bezug; wird weder als Repeater-Feld angezeigt noch in Child-Attributes gesendet |
| `label`, `singular`             | Bereichstitel und Beschriftung von Zeile/Hinzufügen/Entfernen                                           |
| `group`                         | Einordnung in die vorhandene Formular-/Wizard-Gruppe                                                    |
| `initialRows`                   | Anfangszahl, Standard `1`; `0` startet leer                                                             |
| `fields`                        | Optionale Feld-Allowlist aus der Child-Resource                                                         |
| `defaults(parent)`              | Vorbelegung beim Erzeugen einer neuen Zeile aus den aktuellen Parent-Werten                             |

`RelationRepeater` verwendet die zentralen `ResourceField`-Komponenten und stabile `useFieldArray`-Zeilen. Hinzufügen und Entfernen ändern nur den Formularzustand. Defaults sind eine Vorbelegung, keine dauerhafte Synchronisierung, die spätere Eingaben überschreibt. Alle Zeilen dürfen entfernt werden; ein Vertragsentwurf kann später vervollständigt werden. Die Aktivierungs-Action fordert weiterhin Mieter und Anfangskondition.

`mutationPayload` sendet Parent und Kinder über den vorhandenen Endpunkt, zum Beispiel:

```json
{
    "mutate": [
        {
            "operation": "create",
            "attributes": {
                "code": "MV-NEU",
                "unit_id": 1,
                "starts_on": "2026-01-01"
            },
            "relations": {
                "parties": [
                    {
                        "operation": "create",
                        "attributes": {
                            "business_partner_id": 1,
                            "role": "tenant",
                            "is_primary": true
                        }
                    }
                ],
                "conditions": [
                    {
                        "operation": "create",
                        "attributes": {
                            "effective_from": "2026-01-01",
                            "base_rent": 800
                        }
                    }
                ]
            }
        }
    ],
    "response": {}
}
```

Die Beispiel-IDs setzen bestehende Einheit und Geschäftspartner voraus. PHP erlaubt an `ContractResource` ausschließlich `MutationOperation::Create` für die beiden `HasMany`-Relationen. Lomkit bindet `contract_id` aus dem neu angelegten Parent. `Contextual::rule` macht den Bezug bei eigenständigen Child-Anlagen weiterhin verpflichtend und bei verschachtelten Child-Anlagen verboten; `updatable(false)` bleibt erhalten. Eine mitgesendete fremde Vertrags-ID kann die Zuordnung nicht umleiten.

Die native REST-Transaktion umfasst Vertrag, sämtliche Beteiligten und Konditionen sowie automatisch ergänzte Partnerrollen. Bei einem Validierungs-/Observerfehler wird alles zurückgerollt. Fachliche Regeln bleiben in ihren bisherigen Observern: keine doppelte Beteiligung, höchstens ein Hauptkontakt pro Rolle, keine doppelten Konditionsstichtage und kein Stichtag außerhalb der Vertragslaufzeit. Ein neu angelegter Vertrag bleibt Entwurf.

Fehler behalten ihre Zeilenadresse, etwa `mutate.0.relations.conditions.1.attributes.effective_from`. Der Datenprovider normalisiert sie zu `conditions.1.effective_from`; der Editor öffnet die betroffene Gruppe und fokussiert das konkrete Feld. Auch Precognition verwendet die nativen verschachtelten Pfade. Die endgültige Mutation prüft Observer, Transaktion und aktuellen Datenbankzustand erneut. Bestehende Verträge verwenden weiter ihre separat ladenden Relationslisten; `createRelations` wirkt ausschließlich bei der Parent-Neuanlage.

## 17. Vertragsakte, Dashboard und gemeinsame Gestaltung

`/contracts/:id` rendert eine eigene `contract-detail-page.tsx`. Die Seite komponiert Komponenten ohne lokale Styles. Die Übersicht enthält aktuelle monatliche Kondition, Kaution, Vertragsbeginn, Kündigungsfrist, Laufzeit, Beteiligte, nächste Aktionen und Notizen. Die aktuelle Kondition wird serverseitig nach Vertrag und `effective_from <= heute` gefiltert und absteigend sortiert; zukünftige Konditionen verfälschen die Übersicht nicht. Die Datumsgrenze verwendet Europe/Berlin.

Beteiligte, Konditionen, Kündigungen sowie aus- und eingehende Vertragsverknüpfungen besitzen eigene Tabs. `LazyTabs` synchronisiert den aktiven Tab mit der URL und mountet nur den aktiven Inhalt. Die Übersicht lädt eine begrenzte Kontaktzusammenfassung und die aktuelle Kondition; vollständige Relationslisten laden erst beim Tabwechsel. Tab-Counts stammen aus den API-Aggregaten. `openRelation` übernimmt den Vertragsbezug auch bei den Schnellaktionen der Übersicht.

Die Gestaltung orientiert sich an der bereitgestellten Referenz: kühle neutrale Flächen, blaue Hauptaktionen, kompakte gruppierte Navigation, ruhige Typografie, dünne Trennlinien und weiße Inhalte in REUI-Frames. Zentrale Farbwerte liegen in `resources/css/app.css`. `WorkspaceCard`, `WorkspaceColumns`, `PersonAvatar`, `PeopleGroup`, `BarChart` und die Dashboard-Blöcke sind wiederverwendbare Komponenten. `Avatar`, `AvatarGroup` und `Frame` stammen aus den dokumentierten öffentlichen Base-Nova-Registries. Avatar-Gruppen unterstützen Bilder, Initialen, Größen und einen Überlaufzähler.

Das Dashboard enthält bewusst gekennzeichnete **Beispieldaten** für Finanzen, Termine, Aufgaben und Mini-Kennzahlen. Zeitraum, Miete/Eingänge, Widget-Auswahl und Aufgaben-Checkboxen bedienen die lokale Vorschau; es werden keine fiktiven Zahlungsvorgänge gespeichert. Der Tab „Bestand“ lädt echte Kennzahlen und Objekte. Die Command-Palette (`Ctrl/⌘ K`) sucht in den registrierten, sichtbaren Bereichen; eine globale Datensatzsuche ist weiterhin ein eigener zukünftiger Ausbau.

## 18. PDF-Viewer und Grid-Performance

### PDF

Die React-Komponente `PdfViewer` nutzt den gemeinsamen, bei Bedarf geladenen PDF.js-Canvas-Renderer. `pdfjs-dist` ist die einzige direkte Viewer-Abhängigkeit; React-PDF und weitere Viewer-Wrapper sind nicht installiert. Der Worker wird lokal gebündelt. Die Backend-Generierung nutzt `setasign/fpdf`; die React-Vorschau bleibt unverändert. Report-Sheets und Erweiterungsvertrag sind in Abschnitt 45 beschrieben.

```tsx
const PdfViewer = lazy(() => import("@/components/blocks/pdf-viewer"));
<Suspense fallback={<Loading />}>
    <PdfViewer url="/api/v1/…" name="Objektbericht.pdf" title="Objektbericht" />
</Suspense>;
```

Die Vorschau bietet eine helle Fläche, Ladezustand, wiederholbare Fehler, automatische Breitenanpassung, Zoom und Seitennavigation. Dokumentaktionen liegen bei Report-Sheets in `Overlay.actions`; eingebettete Ausweisdateien verwenden denselben Loader und Renderer. Textsuche, Textauswahl, Druck und Annotationen werden nicht im Canvas implementiert; dafür ist Öffnen/Download verfügbar.

Der Abruf bleibt authentifiziert auf derselben Origin unter `/api/`, prüft den PDF-MIME-Typ und verwendet ein AbortSignal. Blob-URLs werden beim Dokumentwechsel/Schließen freigegeben. Kein externer PDF-Dienst erhält Dokumente. Die Komponente wird erst beim Öffnen geladen.

### Grid

- Öffentliche REUI-DataGrid-Primitives einschließlich Spaltenfilter und virtueller Tabelle; keine kopierten kostenpflichtigen Pro-Blöcke.
- Suche mit Debounce; abgelöste HTTP-Anfragen werden über TanStack Query und `AbortSignal` abgebrochen.
- Bereits geladene Zeilen bleiben bei Paging/Filterwechsel sichtbar. Die Ansicht zeigt einen Ladeindikator und deaktiviert veraltete Auswahl-/Zeilenaktionen bis zur neuen Antwort. Initiales Laden verwendet REUI-Skeletons.
- Mehrfachfilter mit durchsuchbaren Optionen und ausgewählten Werten; serverseitiger `in`-Filter. Frühere skalare Filter-URLs bleiben lesbar und werden normalisiert.
- Zeilenfenster ab 50 Datensätzen, konfigurierbar. Die API-Seitengröße bleibt auf 100 beschränkt. Stabile leere Daten und über Referenzen aktualisierte Action-Instanzen verhindern unnötigen Neuaufbau bzw. veraltete Formularbezüge.
- Fixierter Tabellenkopf, eigene Scrollfläche und Pagination im Footer. Sortierung, Filter, Suche, Paging, Gruppierung und Sichtbarkeit bleiben URL-basiert; Spaltenbreite und Fixierung sind weiterhin Sitzungszustand.
- Form-Layer und Action-Dialoge werden zusätzlich bei Bedarf geladen; die PDF-Einbettung bleibt ein eigenes Lazy-Modul.

Ergänzte Regressionstests prüfen gespeicherte Flow-Schritte und Zurückbearbeitung ohne Duplikate, URL-Bereinigung, abgeschaltete Relationsfunktionen, Mehrfachfilter, PDF-Bedienung und Aufräumen sowie die serverseitige Auswahl der gültigen Kondition. Die Playwright-Suite wartet auf gerenderte PDF-Canvas-Seiten und prüft Zoom, Mobilbreite und die zentrale Platzierung der Dokumentaktionen; siehe Abschnitt 45.

Zusätzliche Primärquellen: [REUI Frame](https://reui.io/docs/components/base/frame), [REUI DataGrid-Beispiele](https://reui.io/components/data-grid), [Base-Nova Avatar](https://ui.shadcn.com/docs/components/base/avatar), [Base UI Combobox](https://base-ui.com/react/components/combobox), [REUI Checkbox](https://reui.io/components/checkbox).

## 19. Suchbare Auswahlfelder und Datumsgrenzen

`ChoicePicker` kapselt die bereits installierte Base-UI-Combobox und die Base-Nova-InputGroup. `RelationPicker` in `entity-picker.tsx` ergänzt nur den Datenprovider und die Neuanlage. Keine zweite Select-/Suchbibliothek wurde installiert. `MultiSelect` bleibt ein Kompatibilitätswrapper.

| Prop                              | Vertrag                                                                                                         |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `multiple`                        | Einzelwert oder Array; auch bei `kind: "select"` und `kind: "relation"`                                         |
| `clearable`                       | Löschsymbol/-aktion sichtbar; die Formularpflicht bleibt separat durch `required` definiert                     |
| `creatable`                       | Nur Entity-Picker: reduzierte Neuanlage aktivieren/deaktivieren; prüft zusätzlich den Permission-Adapter        |
| `filters`                         | Lomkit-Filter im Backend-Suchrequest; AND mit Suchtext, keine rein lokale Filterung                             |
| `displayText(row)` / `labelField` | Titel der Entity; Standard ist `resource.titleField`                                                            |
| `secondaryText(row)`              | Zusatztext im Dropdown; mit `selectedDisplay: "rich"` auch geschlossen, standardmäßig eine abweichende Nummer   |
| `maxSelected`                     | Auswahlgrenze; Entity-Picker höchstens 100, passend zum API-Seitenlimit                                         |
| `options`                         | Statische Werte mit `value`, `label`, optional `description`, `icon`, `image`, `badge`, `badgeTone`, `disabled` |
| `placeholder`, `disabled`         | Platzhalter und vollständige Eingabesicherung                                                                   |

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

Tab fokussiert das Suchfeld; Tippen startet direkt die Suche, ohne einen weiteren Klick. Nach dem Schließen stehen standardmäßig nur Titel im Eingabefeld; `selectedDisplay: "rich"` ergänzt bei Einzelauswahl die konfigurierten Bild-/Badge-/Beschreibungselemente. Mehrfachwerte werden als einzeilige, abgeschnittene Liste dargestellt; das Feld wächst nicht. Beim Wiederöffnen bleiben die tatsächlichen Werte selektiert. Der Löschbereich reserviert bei `clearable: true` dauerhaft seinen Platz. Mehrfach-Entities werden über **einen gebündelten ID-Filter** geladen, nicht über eine Anfrage je Auswahl. Suchergebnisse werden mit Debounce und AbortSignal geladen. Eine Neuanlage wird vor Übernahme gegen denselben Backend-Filter geprüft.

```ts
{ name: "starts_on", label: "Beginn", kind: "date", required: true,
  clearable: false, minDate: "2026-01-01", maxDate: "2027-12-31" }
{ name: "period", label: "Zeitraum", kind: "date-range", clearable: true,
  minDate: "2026-01-01", maxDate: "2026-12-31" }
```

`minDate`/`maxDate` sind inklusive ISO-Grenzen für Kalender und freie Texteingabe; dieselben fachlichen Grenzen müssen in der REST-Resource als Laravel-Regeln definiert sein. Monatspicker verwenden `YYYY-MM` bzw. den Monatsanteil einer ISO-Datumsgrenze. Bei Bereichen begrenzen Beginn/Ende einander. `dateRangeControlError` prüft außerdem die Eingabeformate und die zeitliche Reihenfolge; die isolierte Komponenten-Demo prüft auch die Vollständigkeit. Eine persistierte Fachressource muss vollständige/optionale Bereiche in ihren Serverregeln abbilden. Anzeige bleibt `dd.MM.yyyy`, Übertragung ISO. `clearable: false` unterdrückt die Löschaktion und Abwahl desselben Kalendertags; ein manuell geleertes Control zeigt einen Eingabefehler. Programmatische Defaults bleiben möglich.

`DatePicker` ist ein editierbares Textfeld mit separatem Kalenderbutton. Es akzeptiert `1.2.2026` und normalisiert beim Verlassen zu `01.02.2026`; an Formular/API gehen gültige Daten als `2026-02-01`. Ungültige Entwürfe bleiben sichtbar und im Dirty-State erhalten, statt stillschweigend auf den vorherigen Wert zurückzufallen. `dateControlError` prüft Format, tatsächliches Kalenderdatum, Min-/Max-Grenzen und die Leeren-Option am Control; der Kalender respektiert dieselben Grenzen. `Alt` + Pfeil nach unten öffnet ihn. Diese Eingabeprüfung ersetzt keine Vertrags-/Konditionsregeln auf dem Server und führt keinen Zod-Geschäftsvalidator ein.

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

Bereits im Cache vorhandene Fremdschlüssel-Eltern werden gezielt als einzelne Datensätze nachgeladen und gepatcht, z. B. der Vertrag nach einer neuen Kondition. Ein fehlgeschlagener optionaler Elternrefresh macht eine bereits erfolgreiche Speicherung nicht rückgängig; der Cache wird dann als veraltet markiert. Im geöffneten Elternformular ergänzt `onSaved` den bestehenden Refresh mit `keepDirtyValues`. Aktive Collection-Kennzahlen werden nach dem Speichern gezielt neu geladen; die übrigen Overview-Kennzahlen werden als veraltet markiert und beim erneuten Aufruf oder expliziten Refresh geladen.

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
8. `08-bulk-loeschen.png` (Löschbestätigung ohne Bearbeitungsaktion)
9. `09-feldaktionen.png` (Objektformular mit Untermenü im Textfeld)
10. `10-relationsfilter.png`
11. `11-wizard-mobil.png`
12. `12-wizard-dialog.png`
13. `13-grid-keine-treffer.png`
14. `14-sheet-zahlung.png`
15. `15-komponenten-rich.png`
16. `16-komponenten-mobil.png`
17. `17-grid-loading.png` (kontrolliert verzögerte echte API-Antwort)
18. `18-einheiten-spalten.png`
19. `19-ausweis-detail.png`
20. `20-date-picker-sheet.png`
21. `21-date-picker-dialog.png`

Zusätzliche Aufnahmen zeigen `00-anmeldung.png`, `00-anmeldung-mobil.png`, `22-dashboard-bestand.png`, `23-einheiten-objektfilter.png`, `24-einheit-view-sheet.png`, `25-einheit-abschnitt-edit.png`, `26-einheit-edit-regionen.png` und `27-zelltypen.png`. Die verbindliche Liste steht in `tests/e2e/screenshots.spec.ts`; die Dateinamen dokumentieren geplante Aufnahmen, keinen Nachweis eines bereits erfolgreichen Jobs.

Die Suite prüft außerdem, dass der aktive Tab-Inhalt unterhalb der Tab-Leiste die verfügbare Breite nutzt, kein horizontaler Seitenüberlauf entsteht und die Vertragsansicht samt Edit-Sheet bei 390 px funktioniert. Der Zeitraum muss vor dem ersten Öffnen „Dieser Monat“ anzeigen.

Das Artefakt **workspace-screenshots** enthält die PNG-Dateien und bleibt 14 Tage verfügbar. Bereits erstellte Aufnahmen werden auch bei einem späteren Testfehler veröffentlicht. Bei einem Browser-/App-Fehler wird zusätzlich `screenshot-diagnostics` mit Trace und Fehlerausgabe für 7 Tage hochgeladen. Fehler beim Start eines GitHub-Runners können dagegen keine Artefakte erzeugen.

Lokal nach der im README beschriebenen Testdatenbank-Vorbereitung: `npm run screenshots`. Ein vorhandener Browser kann optional mit `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/pfad/zu/chromium` verwendet werden. Der normale CI-Workflow testet weiterhin Anwendung/API und den vollständigen Browserablauf; die Screenshot-Suite ist separat.

Regressionstests decken Tastatursuche, Mehrfachauswahl/Vorauswahl, Backend-Filter, abgesicherte Datumsgrenzen, explizite Nullwerte, Checkbox-Auswahl, einzelne Cache-Zeilen, Inline-Validierung/Fehler und die projizierte Mutation über die echte Laravel-API ab. Ein fehlgeschlagener Browserstart ist keine erfolgreiche visuelle Abnahme.

## 23. Zentrales Layout und visuelle Korrekturen

Die Auswertung der echten CI-Aufnahmen zeigte vier gemeinsame Ursachen: falsche Orientierungsselektoren in `Tabs`, fehlende übersetzte Initialwerte im Zeitraum-Select, eine überladene Tabellen-Toolbar sowie uneinheitliche Wizard-Komposition. Die Korrekturen liegen in Komponenten, nicht in Seitenstyles.

| Bereich             | Standard und Erweiterungspunkt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Theme / AppShell    | Kühle neutrale Flächen, weiße Inhaltskarten, Blau für aktive Navigation, Aktionen und Diagramm-Hervorhebung. Farben einschließlich Sidebar zentral in `resources/css/app.css`. Kompakte einzeilige Marke ohne weiße Logokarte; Keine Suchzeile in der Sidebar; die Bereichssuche bleibt per Strg/⌘ K verfügbar. Kein zusätzlicher Suchbutton rechts im Header.                                                                                                                                                                                                                                |
| Tabs / LazyTabs     | Das `orientation`-Prop wird an Base UI weitergegeben. Selektoren verwenden dessen tatsächliches `data-orientation`. Horizontale Tabs stehen über dem Inhalt; vertikale Tabs daneben. Die Tab-Leiste darf innerhalb ihrer eigenen Breite scrollen; Panels bleiben `min-width: 0`. Aktiver Unterstrich, Zähler und Tastaturfokus zentral. URL und verzögertes Laden unverändert.                                                                                                                                                                                                                |
| Karten / Kennzahlen | `WorkspaceCard` übernimmt lesbare Kopf- und Fußzeilen sowie umbrechende Actions. `WorkspaceColumns` besitzt begrenzte Grid-Spalten und `min-width: 0`. Ein einzelner sichtbarer Baustein belegt die volle Breite.                                                                                                                                                                                                                                                                                                                                                                             |
| Dashboard           | Der Zeitraum verwendet denselben durchsuchbaren `ChoicePicker` im Menümodus wie Gruppierung und Filter. Bereits vor dem Öffnen erscheinen übersetzte Labels. Monats-/Quartalsauswahl passt Betrag, Titel und Balkenauswahl an. Die Demo-Kennzeichnung bleibt sichtbar.                                                                                                                                                                                                                                                                                                                        |
| Balkendiagramm      | Gemeinsame gerundete Skala, dezente Hilfslinien, Planlinie und Blau-Hervorhebung. Mini-Diagramme zeigen ersten und letzten Monat außerhalb der schmalen Balkenspalten, ohne abgeschnittene Monatslabels. Tastaturfokus liefert dieselben Werte wie Hover.                                                                                                                                                                                                                                                                                                                                     |
| Tabellen-Toolbar    | Gemeinsame, bei Platzmangel umbrechende Zeile: Suche → Filter hinzufügen / aktive Filter-Chips → kompakte Gruppierung; rechts Ressourcen-Actions → Export → Aktualisieren → Anlegen. Keine separaten Buttons „Spalten“ oder „Zeilendichte“. `columnChooser` steuert das Spalten-Untermenü in den Tabellenköpfen. `densityToggle` entfällt; die bestehende `dense`-URL-Einstellung bleibt lesbar. Auswahl und Zeilenaktionen haben feste, nicht skalierbare Spaltenbreiten; Status-, Zahlen- und Badge-Spalten bleiben kompakt, Namen und Adressen erhalten flexiblen Platz nach Abschnitt 33. |
| Overlay / FieldGrid | Sheet, Dialog, Header, scrollender Inhalt und Footer teilen dieselben Abstände. Standard-Sheets bis 48 rem, auf Desktop eingerückt und abgerundet. Das Feldraster richtet sich per Container Query nach seiner eigenen Breite; breite Felder belegen `col-span-full` und erzeugen bei schmalen Formularen keine zusätzliche Spalte.                                                                                                                                                                                                                                                           |
| WizardProgress      | Eine gemeinsame Komposition auf REUI-Stepper für Formulargruppen und gespeicherte Multi-Entity-Flows. Eine horizontale Schrittnavigation im festen Header mit Nummer bzw. Haken, Verbindungslinien, sichtbaren Labels und blauem aktivem Schritt; auch mobil im Kopf. Nur bereits erreichbare Formulargruppen sind anklickbar. Persistierte Flows behalten ihre vorhandene Zurück-/Speicherlogik; der Fortschritt springt nicht über notwendige Mutationen hinweg.                                                                                                                            |

API-Projektionen verwenden bei Includes und Aggregaten snake_case: `business_partner`, `related_contract`, `incoming_links_count`. Eloquent-Relationsnamen in Suchanfragen bleiben camelCase. Die Vertragsansichten verwenden die tatsächlichen Antwortschlüssel, damit Kontakte, Verknüpfungen und Zähler sichtbar werden.

Orientierung an den öffentlichen [REUI-Data-Grid-Kompositionen](https://reui.io/components/data-grid/c-data-grid-34) und [REUI-Stepper-Primitives](https://reui.io/docs/components/base/stepper); keine zusätzlichen Pakete oder kostenpflichtigen Blöcke.

## 24. Filter-Builder und einheitliche Auswahl

Die öffentlichen [REUI-Filters](https://reui.io/docs/components/base/filters) und [Wizard-Kompositionen](https://reui.io/blocks/application/wizard/wizard-4) dienen als Interaktionsvorbild. Die Umsetzung besteht aus den bereits installierten REUI-/Base-UI-Primitives. Es wird kein lizenzpflichtiger Pro-Block eingebunden und kein neues Paket benötigt.

`ResourceFilters` wird aus den freigegebenen `resource.columns` aufgebaut. Native PHP-Metadaten ergänzen Feldtypen, Optionen, Relationspicker und erlaubte Operatoren vor der Anzeige; siehe Abschnitt 34. `column.filter` passt einen Filter an oder schaltet ihn ab; `resource.filters` ergänzt zusätzliche Felder bzw. überschreibt automatisch abgeleitete Definitionen. „Filter“ öffnet eine durchsuchbare Feldauswahl. Pro Feld entsteht ein Chip mit Feldname, **ist / ist nicht**, durchsuchbarer Mehrfachauswahl und Entfernen. Ein kompakter Reset-Iconbutton erscheint nur bei vorhandenen Filtern und nennt die Filteranzahl in Tooltip/Accessible Name. Er entfernt sämtliche Filter und Entwürfe; Suchtext, Sortierung und Spalten bleiben erhalten. Einzelne Filter lassen sich weiterhin am jeweiligen Chip entfernen. Unvollständige Chips sind nur lokale Entwürfe und erzeugen keinen Serverfilter. Nach Auswahl des ersten Werts bleibt das Menü offen, auch während die URL asynchron aktualisiert wird. Ein Feld kann nur einmal vorkommen; mehrere Werte werden innerhalb dieses Feldes als Menge behandelt, verschiedene Felder per AND kombiniert.

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

Die Felder und Werte müssen zum tatsächlichen REST-Resource passen. Das Beispiel beschreibt die Konfiguration; es erweitert nicht automatisch das Backend-Enum. Der Builder unterstützt diskrete Optionsfelder sowie Textfilter (`kind: "text"`) mit „ist gleich“ / „ist nicht“, auch auf freigegebenen Relationspfaden wie `unit.name`. Text wird erst per Enter oder Anwenden-Icon übernommen; Tippen allein löst keine Anfrage aus. Zahlen-, Betrags- und Datumsbereiche sowie Leerwertfilter sind implementiert (Abschnitt 33). Verschachtelte OR-Gruppen sind weiterhin kein Bestandteil des Builders.

```json
{ "status": { "operator": "not in", "values": ["draft", "ended"] } }
```

So wird `filters` URL-kodiert gespeichert. `sanitizeGridFilters` akzeptiert nur registrierte Felder, bekannte Optionswerte beziehungsweise nicht leere Texte bis 200 Zeichen und die zum Feldtyp passenden Operatoren; Duplikate und leere Regeln werden entfernt. Alte Links mit `{"status":"active"}` oder `{"status":["active"]}` bleiben gültig. `compileGridFilters` übersetzt Optionsfilter in Lomkit-Filter mit `operator: "in" | "not in"` und `value: string[]`; Textfilter erhalten `operator: "=" | "!="` und einen skalaren String. Die Datenbank filtert den gesamten Bestand; der Browser filtert nicht nur die aktuell geladene Seite. Filteränderungen setzen die Seite auf 1 und heben Zeilenauswahl auf. `filterable={false}` deaktiviert die UI und URL-Filter, erhält aber die fest vorgegebenen Relationsfilter.

`ChoicePicker` besitzt jetzt drei Präsentationen mit derselben Auswahl-, Such- und Tastaturlogik:

| `presentation`    | Verwendung                                                                      |
| ----------------- | ------------------------------------------------------------------------------- |
| `input` (Default) | Formularfelder und asynchrone Entity-Picker; Tippen sucht direkt im Feld        |
| `menu`            | Gruppierung, Dashboard-Zeitraum und Filterauswahl; Button mit Suchfeld im Popup |
| `chip`            | Kompakte Operator-/Wertauswahl innerhalb eines Filter-Chips                     |

`triggerIcon` ist optional. Single/Multiple, Clearable, Disabled, Preselection, Optionsuche und Beschriftungen bleiben dieselben Props. Tab + Tippen öffnet auch Toolbar-Menüs direkt mit der Suche. Escape schließt ohne gespeicherte Auswahl zu löschen. Geschlossen erscheinen standardmäßig nur Titel; Eingabefelder unterstützen optional `selectedDisplay: "rich"` für eine einzelne Auswahl; lange Mehrfachauswahlen werden innerhalb einer begrenzten Breite abgeschnitten und um die Anzahl ergänzt. Styles liegen ausschließlich in der gemeinsamen Komponente.

Das Theme verwendet Blau für Primäraktionen, Fokus, aktive Navigation und Diagramm-Akzente; neutrale Grau-/Weißflächen für Sidebar und Inhalt. Erfolgszustände sind blau, Warnungen amber, Fehler rot. Die zentrale Token-Datei gilt auch für Login und Overlays. Der Objektbericht behält seine eigenständige Berichtsvorlage.

## 25. Architekturprüfung der Domain-Klassen

Maßstab: Eine Domain-Action bleibt bestehen, wenn sie eine benannte fachliche Operation, Transaktion oder wiederverwendete Invariante kapselt. Reine HTTP-Autorisierung, Feldnamenübersetzung und Antwortformatierung gehören an die REST-Grenze. Eine Klasse pro CRUD-Methode ohne zusätzliche Fachlichkeit ist hier nicht nötig; diese Aufgaben übernimmt Lomkit bereits.

| Klasse                | Entscheidung und Begründung                                                                                                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ActivateContract`    | Behalten. Aktivierung verlangt Entwurf, Mieter und Anfangskondition; Transaktion und gesperrter Vertrag bilden eine fachliche Zustandsänderung.                                                                             |
| `ConfirmTermination`  | Behalten. Kündigung und Vertrag werden gemeinsam geändert; nachgelagerte Konditionen blockieren den Abschluss. Das ist keine generische Statusänderung.                                                                     |
| `ValidateContract`    | Behalten. Mindestlaufzeit, Enddatum und Überschneidungen gehören zur Vermietungsdomäne. Gemeinsamer Aufruf über den Observer sichert verschiedene Schreibwege.                                                              |
| `ValidateUnit`        | Behalten und als einzige fachliche Prüfung nutzen. Aktives Objekt, Nummer im Objekt und Verschiebesperre bei Vertragshistorie gelten auch beim Klonen. Die doppelte Nummernprüfung in der REST-Clone-Action wurde entfernt. |
| `CloneProperty`       | Behalten. Transaktion, Prüftermin-Reset und optionales Kopieren physischer Einheiten sind fachliche Kopierregeln. `CloneUnit` wird explizit per Konstruktor injiziert.                                                      |
| `CloneUnit`           | Behalten. Physische Stammdaten kopieren, Zustand `ready`, keine Verträge oder Mieterdaten übernehmen. Derselbe Ablauf wird separat und beim Objekt-Klon verwendet.                                                          |
| `CloneDefaults`       | Behalten. Nummer, Kopiebezeichnung und `with_units` sind gemeinsame Produktvorgaben für Vorbelegung und Ausführung. Ein Modell-agnostischer Generator wäre derzeit nur zusätzliche Indirektion.                             |
| `PropertyObserver`    | Prüft Status und vorhandene Einheiten direkt beim Löschen. Die separate Vorprüfung wurde entfernt; native REST-Transaktionen sichern Mehrfachlöschungen ab.                                                                 |
| `CalculateOverview`   | Behalten. Stichtag, laufende Verträge und wirksame Konditionen definieren Kennzahlen. Metric und PDF nutzen dieselbe Berechnung.                                                                                            |
| `BuildPropertyReport` | Behalten. Ein konkreter fachlicher Bericht, kein zweites CRUD-System. Ein generisches PDF-Templating-Framework wäre erst bei mehreren wiederholten Berichtlayouts sinnvoll.                                                 |

Die fünf Property-Enums (`PropertyStatus`, `PropertyType`, `UnitStatus`, `UnitType`, `ManagementType`) begrenzen fachliche Werte und werden von Eloquent/REST wiederverwendet. Vertragszustände bleiben native `in:`-Regeln. Der Details-Adapter liest beide Varianten und versorgt das Frontend mit denselben Werten; dafür sind weder zusätzliche Domain-Enums noch ein neues Enum-Framework erforderlich.

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

### Deutsche Fehlermeldungen und verschachtelte Zeilen

Die Anwendungssprache steht zentral in `config/ui.php` (`locale: de`). `AppServiceProvider` setzt beim Start die Laravel-Sprache und den deutschen Fallback, bevor Validatoren aufgelöst werden. Damit bleiben API-, Formular-, Precognition- und native REST-Meldungen auch bei älteren Installationen mit `APP_LOCALE=en`, `APP_FALLBACK_LOCALE=en` oder einem entsprechend gecachten App-Config deutsch. Ein fehlender neuer UI-Config-Key verwendet ebenfalls `de`. Die derzeit deutsche Oberfläche unterstützt noch keine Umschaltung nach Browser-Sprache. Der Verify-Job führt die PHP-Suite bewusst mit den alten englischen Umgebungswerten aus.

`LocalizedValidator` ist zentral über `AppServiceProvider` registriert. `lang/de/validation.php` enthält deutsche Regeltexte, Feldnamen unter `attributes` sowie Relationstitel unter `relations`; ein PHP-Feld kann mit `->label('Objektreferenz')` seine Anzeige ausdrücklich überschreiben. Native REST-Texte stehen in `lang/vendor/rest/de/validation.php`. Die technischen Fehlerkeys bleiben stabil, während Meldungen zum Beispiel **„Konditionen, Zeile 2 · Gültig ab“** benennen. Unbekannte Payload-Keys fallen auf eine verständliche allgemeine Bezeichnung zurück.

Vorhandenseinsregeln (`required`, `filled`, `present`) werden vor Typprüfungen angeordnet; `bail` begrenzt die Regelmeldungen pro Feld auf den ersten hilfreichen Fehler. Damit produziert ein leeres Pflichtfeld nicht mehrere widersprüchliche Typ-/Wertebereichsmeldungen. Dies verändert weder erlaubte Werte noch die zugrunde liegenden Laravel-Regeln.

`MutationValidationContext` merkt den aktuellen Mutationspfad requestlokal über `Resource::mutating`/`mutated`. Bei verschachtelten Observerfehlern ergänzt er nur nackte, deklarierte Feldkeys um die aktuelle Zeilenadresse. Bereits qualifizierte native Fehlerkeys sowie bestehende Top-Level-/Delete-Keys bleiben unverändert. Eigene Overrides der beiden Resource-Hooks müssen jeweils `parent::mutating(...)` bzw. `parent::mutated(...)` aufrufen. Es gibt keine parallele Kopie der Fachregeln im Parent oder Frontend.

## 27. Eine Action-API für Feld, Formular, Detail, Tabelle und Auswahl

| API                            | Bedeutung                                                                                                                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `placements`                   | Exakte Oberflächen: `field`, `form`, `detail`, `row`, `table`, `bulk`. Ohne Angabe gilt die bisherige `location`-Kompatibilität; Feld- und Tabellenaktionen sind ausdrücklich zu deklarieren. |
| `icon`, `label`, `description` | Gemeinsame Beschriftung, Symbol und Hilfstext. Symbolbuttons besitzen einen zugänglichen Namen.                                                                                               |
| `group`                        | Beschriftete Menügruppen mit Trennlinien.                                                                                                                                                     |
| `children` / `ActionGroup`     | Rekursive Untermenüs; Gruppen werden nicht als Fachaktion ausgeführt. Kindaktionen werden separat auf Sichtbarkeit, Auswahl und Freigabe geprüft.                                             |
| `visible(row)`                 | Sichtbarkeit pro Datensatz; bei Mehrfachauswahl müssen alle Zeilen erlaubt sein.                                                                                                              |
| `enabled(context)`             | `true`, `false` oder deaktivierter Grund als Text. UI und Dispatcher prüfen die Freigabe; eine direkte `runAction`-Ausführung umgeht sie nicht.                                               |
| `bulk`                         | Mehrere Datensätze erlaubt. Bei `false` blockiert auch der Dispatcher mehrere IDs.                                                                                                            |
| `requiresRecord`               | Standard `true`; `false` erlaubt Aktionen am ungespeicherten Formular bzw. ohne Zeilenauswahl.                                                                                                |
| `interaction`                  | `dialog` mit Vorbereitung/Bestätigung oder `immediate`. Auch direkte Aktionen verwenden Fehlerbehandlung und denselben Ergebnis-Dispatcher.                                                   |
| `refresh`                      | Standard `true`; `false` für reine Formularaktionen oder Aktionen mit eigener Zeilenprojektion.                                                                                               |
| `fieldsFor(context)`           | Dynamische Action-Felder, etwa die vom Resource-Schema freigegebenen Bulk-Felder.                                                                                                             |
| `prepare(context)`             | Optional: asynchrone Defaults, etwa für Duplizieren. Ohne Implementierung findet keine Vorbereitung statt.                                                                                    |
| `execute(context)`             | Zugriff auf echte Zeilen, Instanz und Eingaben; Rückgabe entsprechend `ActionUIResult` bzw. dem REST-Ergebnisvertrag.                                                                         |

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

`ActionMenu` und `ActionButtons` verwenden dieselben Definitionen. Die Collection bindet `table`, `row` und `bulk`, die Detailseite `detail`, der Editor `form`. Die eingebaute Edit-Aktion bleibt direkt; Löschen verwendet einen Bestätigungsdialog mit genau einem DELETE und Fehleranzeige aus dem Backend. Die bestehenden expliziten Hauptbuttons „Bearbeiten“ bleiben erhalten.

## 28. Schwebende Auswahlleiste und native Mehrfachbearbeitung

`BulkActionBar` sitzt zentriert über dem Tabellenfooter, mit abgerundeter dunkler Fläche, Auswahlzahl, Actions und Aufheben-Button. Sie ist ein Overlay innerhalb der Collection und verändert beim Ein-/Ausblenden weder die Grid-Höhe noch dessen Padding; kleine Viewports dürfen umbrechen. Auswahl bleibt auf die aktuelle geladene Seite begrenzt und wird bei Wechsel von Suche/Sortierung/Filter/Seite zurückgesetzt.

In allen aktuell registrierten Fachmodulen ist ausschließlich `bulkActions: ["delete"]` freigegeben. Mehrfachbearbeitung ist dort entfernt. Die generische `BulkEditAction` bleibt als explizite Framework-Erweiterung verfügbar; ein neues Modul kann sie bei fachlichem Bedarf so aktivieren:

```ts
bulkActions: ["bulk-edit", "delete"],
bulkEditable: ["manager_name", "manager_email", "manager_phone", "next_inspection_on"],
actions: [new BulkEditAction(), /* weitere Actions */],
```

Die bisherigen Objekt-/Vertragsbeispiele sind deaktiviert. Im Dialog muss jedes zu ändernde Feld ausdrücklich aktiviert werden. Nicht aktivierte Felder bleiben unberührt; ein aktiviertes optionales Feld darf bewusst geleert werden. Ohne Auswahl ist der Ausführen-Button gesperrt. Schreibgeschützte, deaktivierte und Write-only-Felder werden ausgeschlossen.

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

Der Metadaten-Adapter ist implementiert: Er ergänzt die registrierte UI-Resource zur Laufzeit aus den nativen Lomkit-Details. Enums, Optionslabels, Relationsziele, Picker-Scopes und einfache Eingabehinweise kommen aus PHP; Layout, Feldreihenfolge, Icons und React-Renderer bleiben ausdrücklich in TypeScript. Es gibt keinen zweiten Ressourcen-Endpunkt und keine generierten Client-Geschäftsregeln. Organisationsgrenzen bleiben wie vereinbart verschoben.

Orientierung: [REUI Stepper](https://reui.io/docs/components/base/stepper), [öffentliche REUI-Wizard-Komposition](https://reui.io/blocks/application/wizard/wizard-4), [Filament Actions](https://filamentphp.com/docs/5.x/actions/overview), [Refine Forms](https://refine.dev/core/docs/guides-concepts/forms/) und [Laravel Precognition](https://github.com/laravel/docs/blob/13.x/precognition.md). Bestehende Bibliotheken werden genutzt; keine neue Laufzeit-Abhängigkeit.

## 30. Wizard, Sheet und zentrale Konfiguration von Filtern/Spalten

Die aktuelle Wizard-Komposition orientiert sich an der öffentlich sichtbaren [REUI Wizard-4-Vorschau](https://reui.io/blocks/application/wizard/wizard-4); die Sheet-Anordnung nutzt dieselben zentralen Overlay-Slots. Sie verwendet die vorhandenen Primitives; kein kostenpflichtiger Blockcode und keine neue Abhängigkeit. Die echte serverseitige Schrittvalidierung, Dirty-Checks, Direktlinks und gespeicherten Flows bleiben erhalten.

### Overlay-Slots und Standardverhalten

`Overlay` bietet `icon`, `titleBadge`, `actions`, `sidebar`, `header`, `footerStart` und `footer`. Sheet und Dialog verwenden denselben Header: Icon und Titel links, Badge direkt am Titel, Subtext darunter, Aktualisieren/weitere Actions rechts neben Schließen. Der `header`-Slot enthält bei Wizards den horizontalen REUI-Stepper; nur vorherige Formularschritte sind direkt anwählbar. `sidebar` bleibt ein optionaler allgemeiner Overlay-Slot und wird vom Wizard nicht benutzt. Zurück liegt links im Footer, Abbrechen und Speichern/Weiter rechts. Kein zusätzlicher Schrittzähler im Footer. Der Inhalt scrollt zwischen Header und Footer.

Auf Ressourcenebene sind die Defaults zentral konfigurierbar:

```ts
editor: {
    titleBadge: true, // Default; false blendet es aus
    // description: "Eigener Subtext", // false blendet den Subtext aus
},
```

Ohne Override zeigt das Badge den übersetzten Status, ansonsten „Neu“/„Bearbeiten“. Der Subtext zeigt beim Bearbeiten den Datensatztitel, beim Anlegen einen kurzen Kontext. Fachliche Actions werden weiterhin über ihre Placements gesteuert. `Overlay.titleBadge` akzeptiert für eigene Dialoge beliebigen React-Inhalt. Die allgemeine Seite und Relationskarten zeigen keinen redundanten Erklärungstext mehr zwischen Überschrift und Tabelle.

### Relationsfilter: PHP erlaubt, TypeScript präsentiert

Für **Vertrag → Einheit → Name ist gleich** ist ein Beispiel bereits in `contracts-resource.ts` aktiviert. Es wird über die Relation auf dem Server gefiltert, ohne Einheiten zunächst in den Browser zu laden.

```php
// app/Rest/Resources/ContractResource.php: Relation registrieren
BelongsTo::make('unit', UnitResource::class)->onlyOperations(),

// app/Rest/Resources/UnitResource.php: Feld und erlaubte Operatoren
Text::make('name')->searchable()
    ->filterable(['=', '!=', 'in', 'not in', 'like', 'not like']),
```

```ts
// resources/js/modules/contracts/contracts-resource.ts
filters: [
    { field: "status", label: "Status" }, // Werte aus der PHP-Resource
    { field: "unit.name", label: "Einheit · Name", kind: "text" },
],
```

Der API-Filter lautet `{ field: "unit.name", operator: "=", value: "Wohnung 01" }`. Die REST-Bibliothek löst nur registrierte Relationen/Felder auf und prüft deren Filterfreigabe, Operatoren und bestehende Policies. Nicht freigegebene Pfade oder Operatoren führen zu HTTP 422. Die vorhandene Permission-/Organisationsarchitektur wird dadurch nicht um neue Mandantengrenzen erweitert. Eine UI-Definition ist keine Berechtigung.

**Die PHP-Resource liefert native Metadaten für die UI.** `detailsMeta()` ergänzt vorhandene Lomkit-Details um Optionen und Relationspicker; der Adapter übernimmt nur serverseitig erlaubte Operatoren. TypeScript definiert Layout und Rendering. Eine Relationsspalte wird standardmäßig zum durchsuchbaren ID-Picker; ein explizites `kind: "text"` behält einen Pfadfilter wie `unit.name`. Zahlen-/Datumsbereiche sind verfügbar. Frei verschachtelte OR-Gruppen sind weiterhin kein Bestandteil des UI-Builders.

### Spalten und Standardspalten

Spalten stehen pro Ressource unter `resources/js/modules/<modul>/<modul>-resource.ts` in `columns`. Die Reihenfolge des Arrays bestimmt die anfängliche Reihenfolge; API-Ausgabefelder stehen in der zugehörigen PHP-REST-Resource. Eine ausgeblendete Spalte ist keine Datensicherheitsgrenze.

```ts
columns: [
    { field: "code", label: "Vertrag", hideable: false },
    { field: "status", label: "Status", kind: "badge" },
    { field: "signed_on", label: "Unterzeichnet am", kind: "date", defaultVisible: false },
],
```

`defaultVisible` ist standardmäßig `true`; `hideable` ebenfalls. `hideable: false` hält eine Spalte sichtbar und nimmt sie aus dem Ausblendmenü. Die Vertragsnummer und das zunächst ausgeblendete Unterzeichnungsdatum demonstrieren beide Optionen. Ein gültiger `columns`-URL-Zustand überschreibt die Defaults für ausblendbare Spalten; unbekannte Spalten und Versuche, Pflichtspalten auszublenden, werden verworfen. Im Spalten-Untermenü setzt **„Standardspalten wiederherstellen“** die Sichtbarkeit auf die Ressourcendefinition zurück, auch in gruppierten Tabellen. Reihenfolge, Breite und Fixierung werden dabei nicht zurückgesetzt.

Die Tests prüfen Relationsfilter über die echte API, abgewiesene Pfade/Operatoren, URL-Sichtbarkeitsdefaults, Pflichtspalten sowie Textfilter-Übernahme und Filterreset ohne Verlust des Suchtexts. Die Screenshot-Suite ergänzt `10-relationsfilter.png` und `11-wizard-mobil.png`, prüft die überlappungsfreie Schrittnavigation auf Desktop/Mobil und zeigt Wizard und Edit-Sheet im neuen Aufbau.

## 31. Header-Wizard, Formularreview und Produktreife (14.11.2026)

### Gemeinsame Darstellung

`ResourceEditor` setzt `WizardProgress` in `Overlay.header`. Die Navigation bleibt unter dem Titel sichtbar, während ausschließlich der Inhalt scrollt. Sheet und Dialog teilen diese Anordnung; es gibt keine seitliche Wizard-Spalte und keinen Schrittzähler im Footer. Alle Schrittlabels bleiben auch mobil sichtbar (maximal zwei Zeilen). Zurück bleibt links, Abbrechen und Weiter/Speichern rechts. Gespeicherte Multi-Entity-Flows erklären im Kopf, dass Abbrechen bereits gespeicherte Datensätze behält. Ein Formularwizard validiert weiterhin vor Weiter auf dem Server; ein gespeicherter Flow behält seine Transaktionen pro Schritt und seine Zurück-Logik.

`FormSection` verwendet dieselbe REUI-Frame-Struktur wie die übrigen Karten. Gruppen können als `card`, `plain` oder `collapsible` präsentiert werden. Das Feldraster richtet sich nach der tatsächlichen Containerbreite; eingeklappte Regionen bewahren Formularwerte. Relationslisten bleiben eigenständige Karten. Neue Module benötigen dafür keine Seitenstyles.

### Grid: behobene Review-Funde

- Eine leere Gruppierung zeigte zuvor gar keine Rückmeldung. Jede Collection unterscheidet jetzt „Noch keine Einträge“ von „Keine Treffer“. Bei aktiven Such-/Filterkriterien gibt es einen gemeinsamen Reset. Dieser entfernt nur benutzerdefinierte Kriterien und setzt auf Seite 1; feste Relationsfilter, Gruppierung, Spalten und Sortierung bleiben erhalten. Suche und Filter werden atomar in derselben URL-Aktualisierung zurückgesetzt.
- Der normale Reset-Iconbutton in der Toolbar entfernt weiterhin ausschließlich Filter, nicht den Suchtext. Beide Aktionen haben eindeutige Beschriftungen für ihren jeweiligen Umfang.
- `searchPayload` ergänzt bei nicht eindeutigen Sortierungen `id desc` als letztes Kriterium; eine explizite ID-Sortierung bleibt erhalten. Das stabilisiert Paging bei gleichen Feldwerten. Es ist kein Snapshot über parallele Änderungen hinweg; Einfügungen während Offset-Paging können weiterhin Seiten verschieben.
- Initiale Skeletons, während Folgeanfragen sichtbare/inaktive Altzeilen, Seitenbegrenzung, API-Filter und Einzelzeilen-Mutationen bleiben erhalten. Ein geänderter Datensatz bleibt wie bisher bis zum Refresh/erneuten Besuch an seiner Position; Serverfilter und Sortierung werden dabei bewusst nicht durch eine Vollabfrage neu ausgewertet.

### Ehrliche Freigabeentscheidung

**Weitere CRUD-Module: ja, auf dieser Basis. Allgemeine Marktreife: noch keine Freigabe.** Der Review betrifft Code, vorhandene Tests und CI-Demoaufnahmen, nicht eine produktive Installation oder einen unabhängigen Sicherheits-/Betriebsaudit.

| Bereich                       | Befund / Konsequenz                                                                                                                                                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Erweiterbarkeit               | API-Resources, zentrale React-Collections/Editoren, Relation-Konfiguration, Actions, Feld-Actions, Deep Links und Flows sind vorhanden. Ein neues Standardmodul benötigt keine eigene Table- oder Form-Page.                                                                                                                          |
| Rechte und Organisationen     | `config/nexthv.php` deaktiviert Permissions standardmäßig; `ResourcePolicy` überspringt dann den Adapter. Die gemeinsame REST-Resource trägt ausdrücklich `WithoutPerimeter`. Das wurde auf Wunsch vertagt und wird hier nicht aktiviert. Vor einem Einsatz mit getrennten Organisationen/Benutzerrollen ist das ein Freigabeblocker. |
| Fachlicher Produktumfang      | Dashboard-Demowerte bleiben Vorschau. Zahlungen/Buchhaltung, verlässliche Ist-/Soll-Abgrenzung und weitere Verwaltungsprozesse sind kein fertig abgenommenes Gesamtprodukt. Vor Vermarktung müssen die tatsächlich angebotenen Abläufe mit Hausverwaltern fachlich abgenommen werden.                                                 |
| Betrieb / Nachvollziehbarkeit | Ein fachliches Änderungsjournal, eine nachgewiesene Backup-Wiederherstellung sowie Monitoring-/Alarmierungs- und Rollback-Abnahme sind im geprüften Repository nicht als vollständiger Betriebsnachweis vorhanden. Infrastruktur außerhalb des Repositories wurde nicht geprüft.                                                      |
| Datenbank / Last              | Die CI verwendet SQLite und überschaubare Demodaten. Serverseitiges Paging und Virtualisierung sind vorhanden, ersetzen aber keine Messungen mit realistischen Datenmengen und konkurrierenden Vertrags-/Konditionsänderungen auf der Ziel-Datenbank.                                                                                 |
| UX / Barrierefreiheit         | Desktop-/Mobil-Screenshots und Interaktionstests helfen gegen Regressionen. Ein vollständiger Tastatur-/Screenreader-Audit und Nutzertests mit Verwaltern sind noch kein nachgewiesener Teil der Freigabe.                                                                                                                            |
| Schema-Vertrag                | PHP definiert Felder, Regeln, Enums und Relationen; der native Details-Adapter ergänzt die UI-Registry, TypeScript beschreibt die Präsentation. Neue Module brauchen weiterhin einen Integrationscheck für Metadaten, erlaubte Filter/Sortierungen, Mutationsantworten und Serverfehler.                                              |

### Architekturentscheidung für weitere Module

1. Model, Migration und REST-Resource für Daten, Beziehungen und Validierung; keine zusätzlichen Domain-Klassen für bloßes CRUD. Die installierte REST-Bibliothek besitzt bereits Generatoren (`rest:resource`, `rest:controller`, `rest:action`). Deren Standard-Policy ist keine produktive Rechtekonfiguration.
2. Domain-Actions für echte fachliche Operationen wie Vertragsaktivierung oder Kündigungsbestätigung behalten. Deren Transaktions- und Konsistenzregeln gehören nicht in ein generisches Rest-Model oder in die React-Konfiguration.
3. Im Frontend eine `ResourceDefinition` unter `modules/<modul>` registrieren: Felder, Gruppen, Columns/Defaults, Filter, Actions und Relationen. Den gemeinsamen Editor/Grid verwenden; eigene Pages nur für fachlich abweichende Detailübersichten.
4. Den vorhandenen nativen Details-Vertrag durch API-Tests absichern. Der Adapter liest die REST-Resource, verändert aber keine Fachregeln und ersetzt weder Policies noch serverseitige Mutationsvalidierung.

Die Browser-Suite kontrolliert horizontal angeordnete Schritte **im Header**, unveränderte Headerposition beim Scrollen, die responsive Formular-/Zusammenfassungsanordnung, die mobile Variante sowie das Dialog-Pendant. `12-wizard-dialog.png` und `13-grid-keine-treffer.png` ergänzen die bisherigen Aufnahmen. Die UI-Tests decken den gruppierten Leerzustand, den Reset bei festem Relationsbezug und deterministische Sortier-Payloads ab.

## 32. Zentrierter Wizard, Rich-Controls, Sheet-Tabs und Tabellen-KPIs

Die neue Komposition orientiert sich an den gezeigten REUI-Beispielen und der öffentlichen Vorschau [Data Grid Advanced 1](https://reui.io/blocks/data-grid/advanced/data-grid-advanced-1). Es wurden keine zusätzlichen Bibliotheken installiert und keine lizenzpflichtigen Blockquellen eingebunden.

### Wizard und Zahlen-Stepper

`WizardProgress` zentriert die Schrittnavigation horizontal und vertikal im festen Header, begrenzt sie auf 42 rem und verteilt die Schritte gleichmäßig. Bei breiten Containern stehen Nummer und Label nebeneinander, bei schmalen übereinander. Der zusätzliche Erläuterungssatz unter den Schritten entfällt. Verbindungslinien, abgeschlossene Schritte und die bestehende serverseitige Weiter-/Speicherlogik bleiben erhalten. Formulargruppen verwenden weiterhin nur bereits erreichte Schritte als Sprungziele; gespeicherte Flows durchlaufen ihre Mutationen.

`kind: "number"` verwendet zentral den vorhandenen REUI `NumberField` als Minus/Plus-Control: `min`, `max`, `step`, `locale` und `steppers` (Standard `true`, mit `false` ausblendbar). Leeren ergibt `null`, ein Wert eine Zahl. Die Input-Grenzen unterstützen die Bedienung; Laravel entscheidet weiterhin über fachliche Gültigkeit. Feld-Actions bleiben über `prefixActions`/`suffixActions` möglich.

### Rich-Select und Zahlungsart-Control

```tsx
{
    name: "unit_id", label: "Einheit", kind: "relation", resource: "units",
    selectedDisplay: "rich", clearable: true, creatable: false,
    displayText: row => String(row.name),
    secondaryText: row => `${row.code} · ${label(row.type)}`,
    optionMeta: row => ({
        icon: <Building2 />,
        // image: row.thumbnail_url, // optional, nur tatsächlich vorhandene Bild-URLs
        badge: label(row.status),
        badgeTone: row.status === "ready" ? "success" : "warning",
    }),
}
```

Statische `options` verwenden dieselben Eigenschaften: `label` als erste Zeile, `description` als zweite, `image` oder `icon`, `badge` und `badgeTone` (`neutral`, `success`, `warning`, `danger`). Die gemeinsame `ChoiceContent`-Komponente verhindert unterschiedliche Darstellung in Dropdown, Auswahl und Buttons. `selectedDisplay: "rich"` gilt für ein einzelnes Eingabefeld. Standard bleibt `title`; Toolbar-Menüs und Mehrfachauswahl bleiben kompakt. Bei mehreren ausgewählten Werten werden weiterhin nur Titel begrenzt dargestellt. Tab + Tippen sucht sofort; beim Öffnen ist die bestehende Auswahl vorausgewählt. Ein fehlgeschlagenes Bild erhält einen Initialen-Fallback.

```tsx
{
    name: "payment_method", label: "Zahlungsart", kind: "choice-buttons",
    default: "card",
    options: [
        { value: "card", label: "Karte", icon: <CreditCard /> },
        { value: "cash", label: "Bar", icon: <Banknote /> },
        { value: "wallet", label: "Wallet", icon: <Wallet /> },
    ],
}
```

`ChoiceButtons` ist eine echte Base-UI-Radiogruppe: ein Wert, Pfeiltastensteuerung, gesperrte Optionen und gemeinsamer Feldfehler-/Beschreibungskontext. Die Zahlungsart unter `/components` ist eine interaktive Vorschau, keine Zahlungsabwicklung und kein zusätzliches Vertragsdatenbankfeld. Bei einem produktiven Modul gehören Feld, zulässige Werte und Persistierung in dessen PHP-Resource.

### Tabs und Karten in beiden Editor-Oberflächen

```ts
editor: {
    sectionStyle: "card", // Standard; "plain" ist ausdrücklich optional
    tabs: [
        { id: "general", label: "Grunddaten", groups: ["general", "term"] },
        { id: "finance", label: "Zahlung", groups: ["finance"], summary: paymentSummary },
        { id: "details", label: "Hinweise", groups: ["details"] },
        { id: "relations", label: "Beziehungen", relations: true },
    ],
}
```

Der Vertrag demonstriert diese Konfiguration. `Overlay.tabs` erzeugt die Unterstreichungsnavigation zwischen Titel und Scrollbereich für Sheet **und** Dialog. Die zentralen Tabs verwenden ihre eigenen Base-UI-Orientierungsattribute, damit die aktive Unterstreichung auch in portalierten Sheets sichtbar bleibt. `groups` referenziert die bestehenden Formgruppen; alle sichtbaren Gruppen sollten einem Tab zugeordnet sein. Die Tab-Auswahl ist lokaler UI-Zustand; der bestehende Deep Link öffnet den Datensatz, nicht einen bestimmten Editor-Tab. Wizard/Flow behalten ihre eigene Schrittnavigation und verwenden keine zusätzlichen Editor-Tabs. Reine Relationstabs erscheinen erst für gespeicherte Datensätze.

Felder bleiben beim Wechsel registriert, Dirty-Werte erhalten. Ein Serverfehler öffnet den Tab der ersten fehlerhaften Gruppe. Der bestehende Speicherweg, Dirty-Check, Sperrbezüge und geschachtelte Sheets bleiben gleich. Relationslisten werden erst beim Öffnen eines Tabs mit `relations: true` gemountet; ihre eigenen Collection-Props gelten weiter.

`WorkspaceCard`, `SectionCard`, `FormSection` und `DetailCard` teilen `ContentCard` auf REUI `Frame`, `FrameHeader` und `FramePanel`: dezenter Titelbereich, abgesetzter weißer Inhalt, optionale Actions rechts. `KeyValueCard` bietet `summary` (kompakte Formsumme) und `framed` (Detailkarte). Einträge besitzen `id`, `label`, `value`, optional `description`, `emphasis`, `separator`. Diese Karten sind rein darstellend; direkte Property-Mutationen bleiben Aufgabe der vorhandenen `EditableKeyValueList`.

`editor.summary` oder `editor.tabs[].summary` erhält mit `items(values, record)` die aktuellen Formularwerte. `FormSummary` abonniert sie isoliert; Änderungen führen nicht zu API-Aufrufen oder einer Neudarstellung der ganzen Tabelle. Konditionen zeigen Grundmiete, Neben-/Heizkosten, Umsatzsteuer und monatlichen Gesamtbetrag. Speichern und endgültige Berechnung bleiben im Backend.

### KPI-Leiste über der Table-Toolbar

`ResourceDefinition.summary` beschreibt Darstellung und Metric-Key; `CollectionOptions.summary` aktiviert/deaktiviert sie (Standard: Hauptliste an, kompakte Relation aus).

```ts
summary: {
    metric: "summary",
    items: [
        { key: "total", label: "Verträge", icon: FileText },
        { key: "active", label: "Aktiv", icon: CircleCheck },
        { key: "draft", label: "Entwürfe", icon: FilePenLine },
        { key: "deposits", label: "Vereinbarte Kaution", kind: "currency", icon: Wallet },
    ],
}
```

PHP registriert die Berechnungen direkt an der REST-Resource, ohne neue Domain-Klassen für bloße Summen:

```php
public function metrics(): array
{
    return [new CollectionSummary([
        'total' => fn (Builder $query): int => $query->count(),
        'active' => fn (Builder $query): int => $query->where('status', 'active')->count(),
        'deposits' => fn (Builder $query): float => (float) $query->sum('deposit'),
    ])];
}
```

`POST /api/v1/{resource}/metrics/summary` erhält dieselbe debouncte Suche, freigegebenen Filter und festen Relationsfilter wie die Liste. Paging, Sortierung, Includes und Zeilenauswahl werden nicht übertragen. Der native REST-Query bleibt Ausgangspunkt jeder Berechnung; jede Closure bekommt einen unabhängigen Clone ohne Sortierung. Kennzahlen gelten damit für die **gesamte gefilterte Auswahl**, nicht nur die aktuelle Seite. Bestehende Rechte-/Perimeter-Konfiguration wird unverändert übernommen; die zuvor vertagten Organisationsgrenzen werden dadurch nicht nachgerüstet.

Objekte zeigen Anzahl, aktive Objekte, zugehörige Einheiten und Grundstücksfläche. Verträge zeigen Anzahl, aktive Verträge, Entwürfe und vereinbarte Kautionen. Vier Aggregationsabfragen je Metric, keine Abfrage je Tabellenzeile. `CollectionKpis` verwendet eine integrierte Stat-Zeile mit Icon, Label, feinen Zellteilern und klarer Wert-Hierarchie; initial Skeletons und bei Fehlern Wiederholen. Zahlen, Euro und Einheiten werden zentral formatiert. Es gibt keine erfundenen Trends oder Zahlungseingänge. Kleine Viewports verwenden zwei Spalten.

Nach einer Standardmutation werden aktive Kennzahlen der Resource gezielt invalidiert; die Tabellenzeile wird wie bisher aus der Mutationsantwort gepatcht. Das Grid wird beim Edit nicht komplett nachgeladen. Bei gecachten Eltern werden deren Datensatz und aktive Kennzahlen aktualisiert. Neue Einträge und expliziter Tabellen-Refresh laden die entsprechende Liste weiter regulär.

### Nachweise

PHP-Tests prüfen Auth, Filterfreigaben, Textsuche kombiniert mit Relationsfiltern, Summen über mehr als eine Standard-Metric-Seite sowie leere Ergebnisse. React-Tests prüfen Rich-Select-Tastatursuche, Zahlungsart-Tastatursteuerung, Zahlen-Stepper, Tabwechsel mit erhaltenen Eingaben, Serverfehler-Tabwechsel, verzögerte Relationsabfragen und gezielte Kennzahlenaktualisierung ohne Listenreload. Der Screenshot-Job ergänzt `14-sheet-zahlung.png`, `15-komponenten-rich.png` und `16-komponenten-mobil.png`; die Aufnahme `05-vertrag-bearbeiten.png` zeigt das kompakte Einheitenfeld, Tabs und Karten.

## 33. Spaltenschema, stabile Tabellen und gemeinsame Karten (14.11.2026)

### Filter vollständig im Schema definieren

Jede Tabellenspalte mit nativer Filterfreigabe ist standardmäßig filterbar, auch eine per `defaultVisible: false` ausgeblendete Spalte. Write-only-Felder werden ausgeschlossen. `columnFilters(resource)` verwendet die durch PHP-Metadaten ergänzten Typen, Optionen, Relationspicker und Operatoren aus Spalte/Feld. Bestehende `resource.filters` bleiben für zusätzliche Relationsfilter und Überschreibungen erhalten. Jede angebotene API-Eigenschaft muss weiterhin in der PHP-Resource filterbar sein; eine Frontend-Deklaration erweitert keine Serverfreigabe.

```ts
columns: [
    {
        field: "name",
        label: "Bezeichnung",
        size: "30%",
        minSize: 192,
        maxSize: 480,
    },
    {
        field: "status",
        label: "Status",
        kind: "badge",
        minSize: 104,
        maxSize: 140,
    },
    { field: "area", label: "m²", kind: "number" },
    {
        field: "expires_on",
        label: "Gültig bis",
        kind: "date",
        filter: { nullable: true },
    },
    {
        field: "business_partner.display_name",
        label: "Geschäftspartner",
        filter: { field: "businessPartner.display_name", kind: "text" },
    },
    { field: "preview", label: "Vorschau", filter: false },
];
```

| Typ             | Bedienung / native Serveroperatoren                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------- |
| Optionen        | Durchsuchbare Mehrfachauswahl; `in`, `not in`                                                       |
| Text            | Gleich/ungleich, enthält/enthält nicht; `=`, `!=`, `like`, `not like`                               |
| Zahl / Currency | Gleich/ungleich, größer/kleiner inklusive Grenzen und `between`; Zahlen werden numerisch übertragen |
| Datum           | Gleich/ungleich, vor/bis/nach/ab und Bereich; ISO-Werte für API/URL, `dd.MM.yyyy` im Picker         |
| Nullable        | `is null`, `is not null`; ohne künstlichen leeren String                                            |

`filter.operators` begrenzt die erlaubte Auswahl pro Spalte. Text, Zahlen und Bereiche werden ausdrücklich per Enter oder Haken übernommen; unvollständige/umgekehrte Bereiche bleiben Entwurf und erzeugen keinen Request. Gleiche Bereichsgrenzen sind erlaubt. Bei Zahlen akzeptiert die Eingabe ein Dezimalkomma. Native `like`-Filter verwenden `%` und `_` als SQL-Platzhalter; ihre Werte bleiben gebundene Parameter. Der Server validiert unabhängig vom Browser Feld, Operator und Wert.

Berechnete Felder verwenden die native Lomkit-Schnittstelle `filterUsing`: `full_address` und `full_name` filtern mit deklarierter SQL-Expression; `monthly_total` verwendet dieselbe Rundung wie seine Anzeige und einen numerischen SQL-Cast. `ExpressionFilter` hält die native Operatorlogik und Parameterbindung zentral. Die Anzahlspalte `units_count` filtert über den nicht selektierbaren Filteralias `unit_count` mittels `has('units', operator, count)`. Damit kollidiert der Filter nicht mit dem bestehenden REST-Aggregat `units_count`. Suchergebnis und KPI-Metric verwenden dieselben Filter. Keine Abfrage pro Zeile.

### Filter und Gruppierung, Spalten und Ladezustand

Filter hinzufügen und Gruppieren verwenden denselben `ChoicePicker` im Menümodus, dieselbe Höhe, Ränder, Icons und Tastatursuche. Aktive Filter bleiben Chips. Reset erscheint nur bei aktiven Filtern/Entwürfen. Gruppierung bleibt bewusst auf die aktuelle geladene Seite beschränkt.

`ColumnDefinition.size` akzeptiert Pixel oder Prozent der verfügbaren Datenbreite. `minSize`, `maxSize` und `grow` beschreiben bevorzugte Desktop-Breiten und Verteilung; das tatsächliche Containerbudget hat Vorrang. `column-layout.ts` gibt freien Platz bevorzugt Titel-/Adressspalten; Status, Beträge, Zahlen und Checkbox-/Action-Spalten wachsen nicht pauschal mit. Manuelle Resize-Breiten werden ebenfalls in das Budget eingepasst. Reicht die Breite für die bevorzugte Tabellenaufteilung nicht aus, zeigt `ResponsiveRecordList` alle sichtbaren Spalten als beschriftete Datensatzwerte. Es werden nicht stillschweigend Spalten versteckt, und horizontales Scrollen entfällt. Ein `ResizeObserver` misst den Collection-Container; Layoutstyles bleiben im Framework.

Initiales Datenladen nutzt konkrete Skeleton-Zellen für Text, Badge, Zahl, Auswahl und Actions mit stabiler Zeilenhöhe; maximal 16 Skeleton-Zeilen, unabhängig von einer Seitengröße von 100. Beim verzögerten Laden des Routenmoduls erscheint `CollectionLoading` mit passender Header-/KPI-/Toolbar-/Grid-/Footer-Struktur. Es gibt keine künstliche Mindestwartezeit. Bei Hintergrundabfragen bleiben vorhandene Zeilen sichtbar und vor veralteten Aktionen geschützt. Der Footer bleibt außerhalb der scrollenden Zeilenfläche.

### Eine Karten- und Detaildarstellung

`ContentCard` ist die gemeinsame Komposition für Dashboard-, Formular-, Detail- und Tabellenkarten. Props: `title`, `description`, `icon`, `actions`, `footer`, `compact`, `flush`, `grow`, `fill`. Titel/Actions erzeugen eine REUI-Kopfzeile; ohne Kopf bleibt ein einzelnes weißes Panel ohne leeren Header. Bestehende `WorkspaceCard`, `SectionCard`, `DetailCard` und `FormSection` delegieren dorthin. Formulargruppen verwenden standardmäßig Karten; `sectionStyle: "plain"` und `sectionStyle: "collapsible"` sind explizite Alternativen.

`KeyValueRows` übernimmt das gemeinsame semantische `dl`-Raster für lesende und direkt editierbare Werte. Labels und Werte stehen nebeneinander, lange Inhalte umbrechen, Summen dürfen über `align="spread"` rechts ausgerichtet werden. `formatFieldValue` teilt Datum-/Currency-/Options-/Relationsdarstellung zwischen Detail und Inline-Editor. Eingeladene Geschäftspartner zeigen ihren Namen statt nur der ID. Die vorhandene Einzelproperty-Mutation mit Serverprüfung und Versionskontrolle bleibt unverändert.

`PageWrapper` in der AppShell bestimmt die gemeinsame Breite für Dashboard, Collections und Akten: standardmäßig maximal 1440 px, optional `width: "reading"` mit 64rem. `DetailPageLayout` füllt diese Breite; einzelne Tabs setzen keine eigene Maximalbreite. `DetailColumns` trennt Grunddaten von ergänzenden Angaben und Metadaten, mobil stapeln die Karten. Standard-Edit-Sheets sind maximal 48rem breit; Wizards mit Zusammenfassung und explizit breite Sheets verwenden das breite Overlay. Pages komponieren die Bausteine ohne eigene Layoutstyles.

Die redundante Rücksprung-/Statuszeile und der Kategorie-/Code-Eyebrow im Page-Header entfallen global. Navigation bleibt im AppShell-Menü/Breadcrumb-Kontext. Die Sheet-/Dialog-Umschalter und ihr altes `presentationToggle`-Prop sind entfernt; `presentation` bleibt Bestandteil der Formular-API und Direktlinks. Alle aktuellen Module erlauben in der Mehrfachauswahl nur Löschen.

`BaseField` kapselt den eigentlichen Control-Bereich. Portal-Fokuswächter sind dadurch keine zusätzlichen Abstands-Geschwister des Feldrasters. `PopoverContent` verwendet einen festen Portal-Positioner; ein Kalender vergrößert weder die Feldzeile noch den Scrollbereich des Formulars. Die Screenshot-Suite prüft die Y-Position des folgenden Datumsfelds vor/nach dem Öffnen in Sheet und Dialog sowie kompakte Statusspalten und sichtbare Lade-Skeletons.

## 34. Native Metadaten, Query-Views und gemeinsame Formularflächen

### Ein Schema für Auswahlwerte und Relationen

Die PHP-REST-Resource ist die Quelle für Felder, zulässige Werte, Relationen und Filterfreigaben. Dafür wird der vorhandene authentifizierte Lomkit-Details-Endpunkt verwendet:

```http
GET /api/v1/units?with=fields.capabilities,fields.filter,fields.rules,fields.meta,relations
```

`App\Rest\Resources\Resource::detailsMeta()` ergänzt `data.meta.ui` mit `version: 1`, `fields`, `relations` und `labels`. `ResourceMetadata` liest native Felder, Regeln und registrierte `BelongsTo`-Relationen. Es existiert keine zweite Liste der erlaubten Enum-Werte und kein paralleles CRUD-Schema.

| Quelle in PHP                                                                            | Verwendung im Frontend                                                                                                 |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `Enum::make('status', UnitStatus::class)` oder native `rules('in:...')`                  | `options` für Filter/Anzeige, `offeredOptions` für auswählbare Formularwerte, Default aus Feldmetadaten/Model          |
| `config/ui.php` → `options`                                                              | Gemeinsame übersetzte Optionslabels; feldbezogene Abweichung mit `meta(['ui' => ['optionLabels' => [...] ]])`          |
| Native Feld-Capabilities, Filteroperatoren, Nullbarkeit und einfache `min`-/`max`-Regeln | Schreibschutz, angebotene Filter, Pflichtmarkierung und Bediengrenzen; keine Ausführung von Geschäftsregeln im Browser |
| `BelongsTo` plus Eloquent-Relation                                                       | Fremdschlüssel, Ressourcenname, Response-Key und Titelfeld des Relationspickers                                        |
| `meta.ui.picker` am Fremdschlüsselfeld                                                   | Auswahl-Scope des Formulars, `creatable`, optional `labelField`, `multiple`, `clearable`                               |
| `meta.ui.filter.filters` am Fremdschlüsselfeld                                           | Separater Such-Scope für Relationsfilter in Tabellen                                                                   |

Standard-Ressourcenname und Titelfeld können über `uiResourceName()` und `uiTitleField()` in PHP überschrieben werden. Abgeleitet werden registrierte `BelongsTo`-Fremdschlüssel; Array-/m:n-Felder benötigen weiterhin einen dazu passenden API-Vertrag.

Beispiel für **Objekt in Einheit**:

```php
Integer::make('property_id')
    ->rules(Rule::exists('properties', 'id')->whereNull('deleted_at')->where('status', 'active'))
    ->meta(['ui' => [
        'picker' => [
            'filters' => [['field' => 'status', 'value' => 'active']],
            'creatable' => false,
        ],
        'filter' => ['filters' => []],
    ]]);

Enum::make('type', UnitType::class);
Enum::make('status', UnitStatus::class);

// In relations():
BelongsTo::make('property', PropertyResource::class)->onlyOperations();
```

```ts
// resources/js/modules/units/units-resource.ts
fields: [
    relation("property_id", "Objekt"),
    select("type", "Einheitenart"),
    select("status", "Zustand"),
],
columns: [{ field: "property.name", label: "Objekt", sortable: false }],
// Optionaler direkter Filter: toolbarFilters: ["property_id"],
```

Das Formular sucht aktive Objekte auf dem Server und speichert deren ID. Die Tabellenspalte `property.name` wird automatisch zu einem suchbaren `property_id`-Filter. In der Einheitenliste wird er über **Filter → Objekt** geöffnet; es gibt dort keinen zusätzlichen direkten Objektpicker. Der Tabellenfilter verwendet den separaten Filter-Scope, damit auch Einheiten eines archivierten Objekts auffindbar bleiben. Bereits gewählte Datensätze werden für die Anzeige anhand ihrer IDs geladen. Soll ausdrücklich der Name statt die ID verglichen werden, bleibt `filter: { field: "property.name", kind: "text" }` möglich. Such-Scope und gesperrter Formularkontext sind Bedienhilfen; Existenz, Status und Mutationsfreigabe müssen weiterhin serverseitig abgesichert sein.

`ResourceSchemaProvider` lädt nach der Anmeldung alle registrierten Ressourcenbeschreibungen und hydratisiert die Registry atomar, bevor Formulare oder Workbench mounten. Fehlende/ungültige Metadaten zeigen einen Fehler mit Wiederholen statt leerer Optionslisten. Der optionale SessionStorage-Cache gilt fünf Minuten, getrennt nach Benutzer und Frontend-Build; Login, Logout und HTTP 401 entfernen ihn. Gespeichert werden Metadaten, keine Datensätze oder Ausweisinhalte. Native Capabilities sind UI-Hinweise und ersetzen keine Autorisierung.

TypeScript bleibt für Feldreihenfolge, Gruppen, Formularart, Beschriftungen, Hilfetexte, Icons, Rich-Darstellung und React-Renderer zuständig. Der Einheitenpicker im Vertrag verwendet `selectedDisplay: "title"`: eine kompakte Zeile ohne ausgewählten Untertitel oder Badge. Rich-Auswahl bleibt als zentrale Option verfügbar.

### Collection-Views und optionale direkte Filter

Die aktuellen Module verwenden die gemeinsame Suche-/Filter-/Gruppieren-Toolbar. Direkte `toolbarFilters` sind eine optionale Konfiguration für eigene Module, kein zweiter Standardfilter.

```ts
views: [
    { id: "all", label: "Alle", count: true },
    { id: "active", label: "Aktiv", filters: [{ field: "status", value: "active" }], count: true },
    { id: "draft", label: "Entwürfe", filters: [{ field: "status", value: "draft" }], count: true },
],
// Optional zusätzlich: query: "Suchtext" pro View.
collection: {
    filterable: false,
    groupable: false,
    toolbarFilters: ["unit_id"],
},
```

`CollectionViewDefinition` besitzt `id`, `label`, optionale `filters`, `query` und `count`. Die Vertragsliste zeigt Alle/Aktiv/Entwürfe/Beendet, die Einheitenliste Alle/Nutzbar/Instandhaltung. `CollectionOptions.views` kann die Resource-Views ersetzen oder mit `false` abschalten; in kompakten Relationslisten sind sie standardmäßig aus. Der aktive View steht in der URL. Ein Wechsel setzt Seite und Auswahl zurück.

Für die Zeilenabfrage gelten feste Elternfilter **und** View-Filter **und** Benutzerfilter. Eine View-`query` wird mit dem eingegebenen Suchtext kombiniert. Reset entfernt Benutzerkriterien, nicht den Elternbezug oder den gewählten View. Optionale Tab-Zähler verwenden den festen Eltern-Scope und die jeweilige View-Definition; sie bleiben unabhängig von Benutzerchips, Seitengröße und aktueller Seite. Die KPI-Leiste dagegen folgt der gesamten aktuellen Such-/Filterauswahl. Fehlende Zähler werden nicht als Null dargestellt.

`toolbarFilters: ["property_id"]` referenziert dieselben Filterdefinitionen wie der Builder und unterstützt direkte Options- und Relationspicker. Es werden keine zweiten Optionen gepflegt. Ein direkter Filter wird nicht zusätzlich im Builder angeboten. `filterable: false` blendet den Builder aus; explizite Toolbar-Filter bleiben bedienbar. `groupable: false` blendet Gruppieren unabhängig davon aus und wendet keine alte URL-Gruppierung an. Suche, Pagination, Spaltenauswahl, Actions und Export bleiben separat konfigurierbar, auch in `relation.collection` und `relation.editorCollection`.

### Deklarative Zelltypen und Export

`column.cell` verwendet denselben Renderer in normalen und gruppierten Tabellenzeilen. Daten bleiben API-Werte; Komponenten legen keine neuen Datenbankfelder an.

```ts
columns: [
    {
        field: "display_name", label: "Kontakt",
        cell: { type: "avatar", primary: "display_name", secondary: "email", image: "avatar_url" },
        exportValue: (row) => String(row.display_name ?? ""),
    },
    {
        field: "parties", label: "Beteiligte",
        cell: { type: "avatars", items: "parties", nameField: "display_name", imageField: "avatar_url", max: 3 },
    },
    { field: "tags", label: "Tags", cell: { type: "tags", items: "tags", max: 3 } },
    { field: "name", label: "Objekt", cell: { type: "icon-text", icon: Building2 } },
    { field: "code", label: "Vertrag", cell: { type: "text", primary: "code", secondary: "unit.name" } },
],
```

Die Beispiele mit `avatar_url`, `parties` oder `tags` setzen entsprechende API-Ausgabefelder voraus. `primary` und `secondary` akzeptieren einen Feldpfad oder eine Funktion `(row) => string`; `items` akzeptiert einen Pfad oder eine Funktion mit Array-Rückgabe. `nameField`, `imageField` und `max` konfigurieren Mehrfachdarstellungen. Bilder besitzen einen Initialen-Fallback, Avatargruppen und Tags eine begrenzte Anzahl mit Restanzeige. Ein frei definierter `column.render` bleibt möglich. `exportValue(row)` trennt den fachlichen CSV-Wert von der visuellen Darstellung; ohne Override werden Avatargruppen/Tags zu Namenslisten, andere Zelltypen verwenden den API-Wert der Spalte.

`/components` zeigt die Zelltypen mit fiktiven Daten in `CellTypesDemo`. Für kleine bereits geladene Listen gibt es `RecordTable` in `framework/tables/record-table.tsx`:

```tsx
<RecordTable
    label="Kontakte"
    columns={columns}
    rows={rows}
    dense={false}
    emptyMessage="Keine Einträge vorhanden."
/>
```

Diese lesende Tabelle teilt REUI-Grid, Zellrenderer und Prozent-/Min-/Max-Spaltenbreiten. Sie führt keine API-Abfragen, Mutationen, Pagination oder Zeilenauswahl aus; dafür ist `ResourceCollection` zuständig.

### Echter Lesemodus und Abschnittsbearbeitung

```ts
collection: { viewMode: "sheet" }, // alternativ "page" (Standard) oder "dialog"
view: { sectionStyle: "collapsible" },
```

Die Einheitenliste demonstriert diesen Modus live. Ein Klick auf den Datensatz öffnet `ResourceView` mit semantischen `KeyValueRows`, Datum-/Currency-/Optionsformatierung und Relationsnamen. Es werden keine deaktivierten Eingabecontrols als Leseansicht verwendet; Write-only-Felder werden nie angezeigt. Doppelklick zum Bearbeiten bleibt über `doubleClickEdit` separat steuerbar.

```ts
workbench.openForm({
    resource: units,
    mode: "view",
    row: unit,
    presentation: "sheet",
});
```

Der Bearbeiten-Button öffnet das vollständige Formular im selben Panel. Der Stift einer Gruppe startet gezielt die bearbeitbaren Gruppenfelder. Dieser Abschnittsmodus nutzt `FormRequest.fields`; die Workbench serialisiert Feldliste und Rückkehr zur Ansicht im Panel-Descriptor. Der Editor sendet nur die gewählten Attribute plus ID/Version, keine versteckten Änderungen aus anderen Gruppen. Servervalidierung, unveränderbare Fremdschlüssel und gesperrter Elternkontext bleiben wirksam. Nach Speichern oder Abbrechen erscheint wieder die Leseansicht; der Dirty-Check gilt weiterhin. Die vorhandene Mutation aktualisiert betroffene Cache-Zeilen statt die gesamte Tabelle neu zu laden.

### Klappbare Gruppen und optionale Wizard-Zusammenfassung

Das folgende Beispiel zeigt die Erweiterungs-API. Die aktuellen Objekt-/Vertragswizards verwenden keine zusätzliche Summary-Karte.

```ts
groups: [
    { id: "general", label: "Stammdaten" },
    {
        id: "details", label: "Ausstattung",
        collapsible: true,
        defaultOpen: false,
        summary: (values) => values.has_balcony ? "Mit Balkon" : "Ohne Balkon",
    },
],
editor: {
    sectionStyle: "collapsible",
    summary: {
        title: "Objektübersicht",
        items: (values) => [
            { id: "name", label: "Objekt", value: String(values.name || "—") },
            { id: "city", label: "Ort", value: String(values.city || "—") },
        ],
    },
},
```

`sectionStyle` unterstützt `card` (Standard), `plain` und `collapsible`; `view.sectionStyle` überschreibt die Darstellung für den Lesemodus, andernfalls gilt der Editor-Stil. Gruppen sind standardmäßig offen. `group.collapsible` überschreibt den Gruppenstil, `defaultOpen` bestimmt den Anfangszustand und `summary(values)` die kompakte Zusammenfassung im Kopf. `group.stepLabel` erlaubt einen kurzen Schrittnamen neben dem ausführlicheren Abschnittstitel. Bei mehr als vier Schritten stehen die Beschriftungen unter den Indikatoren, damit die horizontale Navigation lesbar bleibt. `FormSection` kapselt Header, Actions, Auf-/Zuklappen und Inhalt. Ein Serverfehler öffnet den betroffenen Tab und Abschnitt und fokussiert das Feld; eingeklappte Regionen verlieren keine Eingaben.

Der Header-Stepper orientiert sich an Wizard-4: zentrierte horizontale Schrittnavigation, aktuelle/abgeschlossene Schritte, klare Footer-Actions ohne zusätzlichen Schrittzähler. Im Wizard bleibt die aktive Gruppe offen. `editor.summary` liefert die gemeinsame Key-Value-Zusammenfassung; `editor.wizardSummary` kann alternativ ausschließlich für Wizard/Flow gesetzt werden und hat dort Vorrang. Beide Summary-Props sind optionale Erweiterungspunkte; sie sind in der aktuellen Objekt- und Vertragsanlage nicht gesetzt.

Die Wizard-Zusammenfassung wird mit `FormSummary` im gemeinsamen `FormLayout` umgesetzt: bei ausreichender Containerbreite rechts neben den Feldern sticky, bei schmalem Platz darunter. Wizards mit Zusammenfassung verwenden ein breites Overlay. `items(values, record)` liest Formularwerte lokal; es entstehen keine API-Requests bei jeder Eingabe. Objekt- und Vertragswizard verwenden aktuell keine zusätzliche Zusammenfassung. Die Zahlungskarte im Vertrags-Edit bleibt aktiv; auch die Collection-KPIs sind davon unabhängig. Die Standardvertragsanlage speichert erst am Ende gemeinsam; gespeicherte Zwischenschritte gelten nur für ausdrücklich verwendete Legacy-Flows.

### Gemeinsame Shell, Frames und Seitenbreite

`AppShell` komponiert die Navigation im Stil der Shell-7-Vorschau mit zentraler Suche, hierarchischen Menüpunkten und einer ruhigen Breadcrumb-Topbar ohne zusätzlichen Produktiv-/Statusblock rechts. `PageWrapper` liegt außerhalb der einzelnen Seiten-Tabs und verantwortet Breite, Seitenabstände und die verfügbare Collection-Höhe:

```tsx
<PageWrapper mode="page" width="workspace">
    {children}
</PageWrapper>
// mode: "page" | "collection"; width: "workspace" | "reading"
```

Die AppShell setzt ihn bereits; normale Pages sollen keinen zweiten Wrapper ergänzen. `workspace` ist maximal 1440 px, `reading` maximal 64rem. `DetailPageLayout`, `LazyTabs`, `WorkspaceColumns` und Tabellen füllen denselben Elterncontainer. Ein Wechsel zwischen Übersicht und Einheiten-/Vertragstab verändert deshalb keine seitenweite Maximalbreite. Bei schmalem Platz wechselt das Grid in beschriftete Datensatzzeilen; ein horizontaler Scrollbereich ist nicht vorgesehen.

`ContentCard`, `FormSection`, `KeyValueCard` und `KeyValueRows` nutzen gemeinsame REUI-Frame- und Feldkomponenten im Aufbau der Form-/Form-6-Vorschauen: ruhiger Rahmen, klar getrennte Titel-/Inhaltsbereiche, kurze lesbare Werte und zentrale Action-Slots. Die Login-Komponente orientiert sich an Auth-8 mit einer zentrierten Karte vor dem lokal ausgelieferten Bild `public/images/auth-residence.webp`; kein Split-Layout, kein zusätzliches Logo, kein äußerer Footer und keine externe Bildanfrage beim Login. Farben, Abstände und Größen bleiben in Tokens und gemeinsamen Komponenten, nicht in Pages.

Die benannten REUI-Blockvorschauen sind Gestaltungsreferenzen, keine Behauptung einer Übernahme lizenzpflichtiger Blockquellen. Die konkreten Quellen und Assets stehen in [ui-sources.json](ui-sources.json). Der Ausbau erleichtert weitere CRUD-Module; die Freigabegrenzen aus Abschnitt 31 bleiben bestehen.

## 32. Lesbare Links und Rückmeldungen ohne Toasts

`framework/navigation/panels.ts` ist der einzige URL-Codec. Das Standard-Sheet braucht keinen Darstellungsparameter; `layout=dialog` ist optional. `parent=properties/16&bind=property_id` bindet eine neue Einheit an das Objekt. `prefill=1` macht den Bezug editierbar, ohne diesen Parameter bleibt er gesperrt. `wizard=1`, `reduced=1`, `fields=notes,code` und `back=view` steuern die Oberfläche. Für weitere Ebenen verwenden dieselben Parameter `p2.`, `p3.` usw. Die maximal acht Ebenen funktionieren nach Reload und mit Browser-Zurück; private Formwerte und zufällige UI-Schlüssel stehen nie im Link. Alte `panels=[…]`-Links werden weiterhin gelesen und beim nächsten Panel-Wechsel in das neue Format geschrieben. Legacy-Flows behalten `flow`, `step` und gespeicherte `records`-Referenzen; unbekannte oder unvollständige Abläufe werden verworfen.

Der Klick auf **Löschen** im geöffneten `ActionDialog` ist die einmalige Zustimmung und führt direkt einen DELETE aus. Es gibt weder Vorprüfung noch einen zweiten Bestätigungsrequest. Während der Ausführung sind Schließen und Submit gesperrt. Nach Erfolg werden die betroffenen Ansichten aktualisiert und der Dialog geschlossen; Backend- und Netzwerkfehler bleiben darin sichtbar. Schlägt nach erfolgreichem Löschen nur die Aktualisierung fehl, ist erneutes Ausführen gesperrt. `prepare(context)` ist ausschließlich für optionale Action-Defaults vorgesehen und wird ohne Implementierung nicht gestartet.

Verbindliche Fachaktionen wie Vertragsaktivierung behalten ihre explizite serverseitige Bestätigung. Ausschließlich `dataProvider.action` behandelt dafür einen signierten `428`-Handshake mit genau einer Folgeanfrage. Die UI ruft `execute(context)` nur einmal auf; `dataProvider.destroy` hat keinen Token-Parameter und wiederholt fehlgeschlagene Löschungen nicht automatisch.

Toasts und die `sonner`-Abhängigkeit sind entfernt. Speichern zeigt das aktualisierte Formular bzw. schließt den Editor; Fehler bleiben am Formular. Sheets und Dialoge haben keinen Kopierbutton; Direktlinks bleiben über die Browseradresse verfügbar. Fehler direkter Actions erscheinen als beständiger Fehlerdialog, Abmeldefehler im Arbeitsbereich. Fachliche Ergebnisse wie PDF und Detailauswertungen behalten ihren Ergebnisdialog.

### Einheitliche Toolbars und Mehrfachfilter

Suche, Filter, Gruppieren, Export, Aktualisieren und Hinzufügen verwenden eine Höhe von 36 px – auch in eingebetteten Relationstabellen. Mehrfachfilter zeigen den ersten Titel mit `+N` für weitere ausgewählte Werte; Anzahl, Chevron und Entfernen bleiben getrennt und schrumpfen nicht. Der Tooltip enthält alle Titel, im geöffneten Picker bleiben sämtliche Werte vorausgewählt. Daten und OR-/IN-Filterverhalten ändern sich durch die kompaktere Anzeige nicht.

Die gemeinsame `ResourceCollection`-Toolbar trennt die Bedienzeile (Suche, Filter hinzufügen, Gruppieren und rechts Aktionen) von einer zweiten Zeile für aktive Filter. `ResourceFilters.renderToolbar(trigger, activeFilters)` liefert beide Slots getrennt. Lange Kriterien verdrängen die Aktionen dadurch nicht. Bei wenig Platz bricht der Aktionsblock als Gruppe um; Filterchips passen sich über einen Container-Query der tatsächlichen Tabellenbreite an, auch in eingebetteten Relationstabellen. Schmale Chips zeigen Feld/Operator und Entfernen oben, den Wert darunter. Zahlen- und Datumsbereiche teilen die verfügbare Breite, ohne horizontalen Überlauf. „Zurücksetzen“ entfernt nur Benutzerfilter des Builders; feste Relationsbezüge und separat konfigurierte direkte Filter bleiben bestehen. Der Tabellenbereich passt sich der verbleibenden Höhe an und behält mindestens 6 rem für Kopf und eine Zeile. So bleibt das Paging auch mit einzelnen KPI-Karten und Ansichtstabs bei 720 px Fensterhöhe sichtbar. Mobile Datensatzkarten behalten 16 rem Mindesthöhe, damit eine vollständige Karte lesbar bleibt. Wenn der jeweilige Mindestbereich wegen zusätzlicher Filter oder sehr geringer Fensterhöhe nicht passt, scrollt die Collection mitsamt ihren Bedienelementen; der Footer bleibt erreichbar. Die Auswahlaktionsleiste liegt außerhalb dieses Scrollbereichs als Overlay. Die Aufnahmen `35-filter-toolbar-umbruch.png`, `36-filter-toolbar-mobil.png` und `37-filter-mobile-datensatz.png` prüfen Umbruch und erreichbare Datensätze mit mehreren aktiven Kriterien.

### Icons in Tabs

`TabsTrigger` akzeptiert `icon={Building2}` und `icons={false}`. Icons sind standardmäßig eingeschaltet, sofern eines konfiguriert ist. Dasselbe gilt für `LazyTabs` (`tabs[].icon`, `icons`), `Overlay` (`tabs.items[].icon`, `tabs.icons`) und `CollectionViews` (`views[].icon`, `icons`). Ressourcen setzen `editor.tabs[].icon` und optional `editor.tabIcons: false`; Collections verwenden `tabIcons: false`. Relationstabs nutzen standardmäßig das Icon der verknüpften Ressource, mit `relation.icon` als Überschreibung. Tab-Inhalte werden weiterhin erst beim Aktivieren geladen.

```tsx
<LazyTabs
    icons
    tabs={[
        {
            id: "overview",
            label: "Übersicht",
            icon: LayoutDashboard,
            render: () => <Overview />,
        },
        {
            id: "units",
            label: "Einheiten",
            icon: Building2,
            count: 5,
            render: () => <Units />,
        },
    ]}
/>
```

## 35. Relationssuche, Tabellenabschluss und kompakte Eingaben

- **Grid:** Die Aktionsspalte bleibt 40 px breit und am rechten Rand fixiert. Eine einzelne sichtbare Fachspalte übernimmt mit REUI `fillWidth` die übrige Breite, etwa bei Partnerrollen. Gruppierte Tabellen verwenden dieselbe Anordnung. Seitengröße, Trefferbereich und Seitennavigation bilden standardmäßig eine rechtsbündige Gruppe; mobil darf sie umbrechen. Der bestehende Tabellen-Scrollbereich und die überlagerte Mehrfachauswahlleiste bleiben erhalten.
- **Actions/Formulare:** Das Standardmenü enthält keine Überschrift „Verwalten“. Destruktive Aktionen stehen hinter einer Trennlinie; explizite fachliche Gruppen bleiben möglich. Sheets und Dialoge verzichten auf die Kopieraktion. Gesperrte Elternbezüge bleiben beim Bearbeiten deaktiviert, zeigen aber keinen zusätzlichen Sperrhinweis/-Icon. Beim Anlegen bleibt der Hinweis sichtbar. `BaseField.inline` ordnet Checkbox und Label gemeinsam auf einer Zeile an.
- **Tabs:** Detailseiten und Listenansichten verwenden die einzeilige `ResponsiveTabList` mit automatischem Überlaufmenü (Abschnitte 36–37). `TabsList responsive` bleibt für kurze Editor-Tabs verfügbar. Seitenkopf-Aktionen dürfen umbrechen; Detailtabs erhalten keinen horizontalen Scrollbalken.
- **Datum/Tastatur:** Neben `TT.MM.JJJJ` akzeptiert der DatePicker acht Ziffern (`01012026` → `01.01.2026`). Unmögliche Daten und Min-/Max-Verletzungen bleiben Fehler und blockieren das Absenden; die API erhält ISO-Daten. Zusätzliche Öffnungstasten neben Eingaben sind keine Tabstopps. Die Eingabe bleibt erreichbar; beim Datum öffnet `Alt+Pfeil runter` den Kalender. Eigenständige Auswahlbuttons bleiben per Tastatur erreichbar.

### Einmalige PHP-Konfiguration für Suchfelder und Picker-Kontext

`Resource::searchableRelations()` nimmt standardmäßig die direkt deklarierten `BelongsTo`-Relationen auf. `RelatedContains` erweitert die native Lomkit-Contains-Suche mit gruppierten `EXISTS`-Abfragen auf deren ausdrücklich suchbaren Feldern. Wörter dürfen auf Hauptdatensatz und Relation verteilt sein. So findet die Suche nach einer Vertragsnummer auch Vertragsbeteiligungen; vorhandene Elternfilter bleiben wirksam. Es gibt keine rekursive Suche über den gesamten Beziehungsgraphen und keine Einzelabfrage pro Zeile. Ein Resource-Override kann die beteiligten Beziehungen beschränken oder mit `[]` ausschließen. Die vorhandene Single-Workspace-Konfiguration bleibt unverändert; Organisationsgrenzen sind weiterhin separat umzusetzen.

`Resource::uiPicker()` beschreibt die zweite Zeile zentral über `meta.ui.picker`, beispielsweise in `UnitResource`:

```php
public function uiPicker(): array
{
    return [
        'secondaryFields' => ['property.name', 'property.city', 'code'],
        'includes' => [['relation' => 'property']],
    ];
}
```

Formulare und Relationsfilter übernehmen diese Metadaten. Gleiche Wohnungsnamen werden durch Objekt und Ort unterscheidbar; geschlossen bleibt standardmäßig der Titel sichtbar. Feldspezifische `secondaryText`/`displayText`-Props können die Anzeige überschreiben. Picker laden höchstens 25 Treffer ohne Tabellenaggregate, suchen debounct, brechen überholte Requests ab und verwenden Ergebnisse 30 Sekunden lang aus dem Query-Cache. Während einer neuen Suche bleiben veraltete Optionen nicht auswählbar. Gewählte IDs werden gesammelt nachgeladen. Normale Tabellen übernehmen weiterhin ihre bisherigen Cache-Einstellungen und aktualisieren beim Speichern nur die geänderte Zeile.

### Relationszellen und Export

Relationsspalten wie `contract.code` und `property.name` werden im Grid als **normaler Text** ausgegeben, ohne automatischen `Cell`-/Link-Wrapper. Die Datensatztitel behalten ihre eigene Navigation. Der Schema-Adapter nutzt die nativen Sortierfreigaben der verknüpften Ressource; für Objektlisten sortiert die API Einheiten beispielsweise über `property.name`. Falls ein Response-Alias wie `property_record.name` verwendet wird, übersetzt `sortField` den sichtbaren Spaltennamen in den kanonischen REST-Sortierpfad. Die REST-API prüft erlaubte Relationen und Sortierfelder serverseitig.

`ColumnDefinition.options` wird unabhängig von der Filteranzeige aus den PHP-Metadaten übernommen. Zellanzeige und CSV verwenden diese Beschriftungen: `tenant` wird zu `Mieter`, boolesche Werte zu `Ja`/`Nein`. Spaltenüberschriften und Dateiname sind fachlich benannt. `exportValue(row)` bleibt der bewusste Override. Exportiert wird weiterhin nur die aktuelle Seite bzw. Auswahl; der Schutz vor CSV-Formeln bleibt aktiv.

Browseraufnahmen `40`–`44` prüfen die einspaltige Rollentabelle, CSV-Beschriftungen, Suche über Vertragsnummern, Navigation über die reguläre Vertragsliste, das kontextgebundene Bearbeiten, Tabs bei 390/768 px und die Einheiten-Auswahl mit Objektbezug. Backendtests prüfen zusätzlich kombinierte Suchbegriffe, wörtliche Wildcard-Zeichen und den unveränderten Elternfilter.

Die umfangreiche Screenshot-Tour berücksichtigt an Aufnahmegrenzen und vor zusätzlichen Szenarioblöcken die Rate-Limit-Header des Servers. Bei knappem Anfragebudget wartet sie auf die Rücksetzung und beginnt die Budgetmessung neu; damit werden auch zusätzliche Sidebar-Count-Abfragen berücksichtigt. Das Testzeitlimit von 240 Sekunden umfasst diese möglichen Wartezeiten. Das produktive API-Limit bleibt unverändert.

## 36. REUI-orientierte Bereichsnavigation und einzelne Kennzahlenkarten

`LazyTabs` verwendet zentral `ResponsiveTabList`: eine ruhige, einzeilige Line-Navigation mit Icons, neutraler aktiver Unterstreichung und kleinen Zählern. `ResizeObserver` misst den tatsächlichen Container und die gerenderten Beschriftungen statt Gerätebreiten zu raten. Der aktive Bereich bleibt sichtbar; weitere Bereiche stehen im tastaturbedienbaren Menü **Weitere**. Auch lange aktive Beschriftungen können die Seite nicht verbreitern. Die unsichtbare Messzeile ist vom Fokus und Accessibility-Baum ausgeschlossen und separat gegen Überlauf begrenzt. Die Berechnung erfolgt bei Größen-, Beschriftungs- oder Zähleränderungen, nicht über einen Scroll-Handler.

URL-Parameter, Browser-Zurück, bestehende Direktlinks und Lazy-Mounting bleiben erhalten. Ein unbekannter Tab öffnet den konfigurierten Anfangsbereich, ersatzweise den ersten vorhandenen Bereich. `RelationDefinition.navigationLabel` erlaubt eine kurze Navigationsbeschriftung unabhängig vom vollständigen Relationstitel. Im Vertrag heißen die Bereiche nun **Übersicht**, **Beteiligte**, **Konditionen**, **Kündigungen**, **Verknüpfungen** und **Eingehende Links**. Die IDs und getrennten Richtungen der Vertragsverknüpfungen bleiben unverändert.

`MetricCard` / `MetricCardGrid` sind die Kennzahlenbasis für Vertrag, Objekt und Dashboard. Tabellen verwenden dieselbe Wertdarstellung mit `appearance="inset"` innerhalb ihrer gemeinsamen Listenfläche (Abschnitt 37). Jede Kennzahl besitzt eine eigene, einfach umrandete Karte mit Titel, hervorgehobenem Wert und optionalem, durch eine Linie getrenntem Zusatztext. Doppelte Rahmen entfallen. Es gibt keinen zusätzlichen äußeren Kartenheader. Das Raster zeigt zwei Karten auf schmalen und vier ab 40rem Inhaltsbreite; `MetricGrid` und `WorkspaceColumns variant="metrics"` delegieren an dieselbe Basis. Der frühere `compact`-Parameter von `MetricGrid` bleibt kompatibel, erzeugt aber keinen abgeschnittenen inneren Scrollbereich mehr.

```tsx
<MetricGrid
    items={[
        {
            label: "Kaution",
            value: money(record.deposit),
            hint: label(record.deposit_status),
            icon: WalletCards,
        },
        {
            label: "Kündigungsfrist",
            value: "3",
            suffix: "Monate",
            hint: "Zum Monatsende",
        },
    ]}
/>
```

`MetricCard` bietet außerdem `loading`, `badge`, `actions`, `accent` und `children` für bestehende Minicharts. Ladezustände verwenden einen maßhaltigen Skeleton. Im Vertrag unterscheidet die Konditionskennzahl jetzt Laden, nicht verfügbare Daten und tatsächlich fehlende Konditionen. Fehlerdetails/Retry bleiben in der Konditionskarte. Es werden keine Trends oder Finanzwerte erfunden; die Dashboard-Demodaten behalten ihre Kennzeichnung.

Gestaltungsreferenzen: öffentliche Vorschauen von REUI **Project Workspace / navbar-1** und **Stats Overview / stats-1**. Der Pro-Quellcode ist hinter einem Lizenzzugang gesperrt. Die Umsetzung ist eine eigene Komposition aus den bereits vorhandenen REUI/Base-UI-Primitiven, kein unveränderter Import dieser Pro-Blöcke; Herkunft siehe `ui-sources.json`. Es wurden keine Bibliotheken ergänzt.

Regression: Der Interaktionstest prüft Überlaufwahl, verzögertes Mounting, erhaltene URL-Filter, aktiven Bereich nach Resize und ungültige Direktlinks. Die Screenshot-Tour prüft bei 390/768px eine einzeilige Navigation, zwei nebeneinanderliegende KPI-Karten und den Wechsel zu eingehenden Verknüpfungen über **Weitere**. Aufnahmen `03`, `42`, `43`, `45` zeigen Desktop, iPhone, iPad und die gewählte mobile Relation.

## 37. AppShell und zusammenhängende Listenansichten

Die Shell folgt dem Aufbau von REUI `app-shell-7` in heller Darstellung: durchgehender 52-px-Kopf, schmale 240-px-Navigation, neutrale aktive Menüzeilen, einklappbare Gruppen und Kontobereich unten. Die kompakte Icon-Leiste und das mobile Menü verwenden weiterhin denselben Navigationsbaum. Die festgelegten Abstände gelten zentral in `AppShell` und `PageWrapper`. Es gibt keine zusätzlichen Umgebungs-/Systemanzeigen oder Suchfelder in der Sidebar.

`ResourcePage` braucht keinen umschließenden `SectionCard` mehr. `ResourceCollection` übergibt die Kennzahlen an den `summary`-Slot von `CollectionSurface`. Diese gemeinsame Fläche enthält eine integrierte Kennzahlenzeile mit feinen Trennlinien, genau eine Ansichtsnavigation, die Toolbar, Datensätze und Paging. Ein zusätzlicher Abstand und separate Kartenrahmen oberhalb der Tabelle entfallen. Eingebettete Relationstabellen behalten `compact` und erhalten keinen zusätzlichen Außenrahmen. Die Ladeansicht benutzt dieselben Komponenten und dieselbe Hierarchie.

- `MetricCard density="compact" appearance="inset"`: für Listenkennzahlen, ohne hohe Hinweiszeile. Zusatzbeschreibungen sind am Kartentitel verfügbar. Schriftgröße und Raster passen sich der tatsächlichen Karten-/Containerbreite an; kein horizontaler KPI-Scrollbereich.
- `ResponsiveTabList`: jetzt auch für `CollectionViews`. Tabs bleiben in einer Zeile; **Weitere Ansichten** übernimmt den Überlauf. Der aktive Tab bleibt sichtbar. URL, Query, feste Elternfilter und Zählercache ändern sich nicht. `ariaLabel`, `panelId`, `moreLabel` und `tabs[].domId` erlauben korrekte Zuordnung zu einem bestehenden Tabpanel.
- Toolbar unter 560 px Inhaltsbreite: Suche in der ersten Zeile, Filter/Gruppierung und Aktionen in der zweiten. Die Gruppierung erhält einen beschrifteten Icon-Trigger (`ChoicePicker.iconOnly`); Export und Aktualisieren bleiben über **Weitere Tabellenaktionen** erreichbar. Der Erstellen-Button zeigt **Neu**, behält aber den vollständigen zugänglichen Namen. Benutzerdefinierte Actions bleiben verfügbar.
- Unter 768 px Fensterbreite scrollt die gesamte Listenansicht im Workspace. `TableViewport.pageFlow` verhindert verschachtelte mobile Scrollfenster; alle Spalten bleiben als beschriftete Kartenwerte lesbar. Das Paging bleibt unten an der sichtbaren Fläche. Sein `compact`-Modus zeigt Seitengröße, Trefferbereich sowie Vor/Zurück in einer Zeile; die vollständige Seitenwahl bleibt auf breiten Flächen erhalten. Ab 768 px bleibt die Tabelle ein eigener Scrollbereich mit fixiertem Kopf und danebenliegendem Footer.
- Mehrfachauswahl bleibt eine überlagerte Action-Leiste; im mobilen Seitenfluss ist sie am Bildschirm fixiert und verkleinert die Liste nicht. Refresh-Fortschritt liegt über dem Tabellenpanel und erzeugt keinen Höhensprung.

Prüfung: Die Browser-Tour ergänzt Aufnahmen `46`–`55` für Objekte und Einheiten auf dem iPhone, letzten Datensatz/Paging, iPad, Desktop-Shell, mobiles Menü sowie Vertragslisten mit KPI-Karten. Sie prüft unter anderem die KPI-Höhe, einzeilige Tabs, die Toolbar-Höhe, vollständige erste/letzte Datensätze, fehlende innere mobile Scrollbereiche, horizontale Überläufe und sichtbares Desktop-Paging. Ein Interaktionstest deckt die schmale Aktionsleiste und serverseitiges Paging mit erhaltenem URL-Zustand ab. Die Prüfung umfasst Backend- und React-Tests, Produktionsbuild, Browser-Funktionstest und alle 55 Screenshot-Aufnahmen.

Die Screenshot-Action läuft auch auf `codex/ui-shell-*`, damit echte Browseraufnahmen vor der zusammengefassten Übernahme nach `main` geprüft werden können. KPI- und Tab-Konfigurationen sind weiterhin optional: deaktivierte Blöcke werden nicht durch die Layoutkomponenten erzwungen.

## 38. Headless Tabellen-Controller, Pagination, Gruppierung und Provider

**Öffentliche API:** `useResourceTable<TRecord>` liegt unter `framework/tables/use-resource-table.ts`. Er bündelt URL-State, Suche, Filter, Sortierungen, Paging, gruppierte Serverzahlen und eine ausdrücklich ausgelöste Auswahl über Seiten hinweg. `ResourceCollection` verwendet denselben Controller und stellt weiterhin die REUI-Darstellung bereit. Der Hook ist auch ohne DataGrid in individuellen Ansichten verwendbar.

```tsx
const table = useResourceTable<UnitRecord>({
    resource: units,
    pagination: { mode: "server", currentPage: 1, pageSize: 25 },
    filters: {
        initial: { status: { operator: "in", values: ["ready"] } },
        permanent: [{ field: "property_id", value: 42 }],
        defaultBehavior: "merge",
    },
    sorters: {
        initial: [{ id: "name", desc: false }],
        permanent: [{ field: "property.name", direction: "asc" }],
    },
    queryOptions: { staleTime: 30_000, retry: 2 },
});
// table.state, table.update, table.setFilters(next, "merge" | "replace"),
// table.setSorters, table.result, table.groupResult, table.selectAllFiltered
```

Die für Filter-/Sortier-Vorgaben verwendeten Felder und Operatoren unterliegen weiterhin dem nativen REST-Schema. `filters.initial` ist ein sanitisierter benutzereditierbarer Anfangszustand, `filters.permanent` wird serverseitig jeder Abfrage hinzugefügt und **nicht** in veränderbaren URL-Parametern gehalten. `sorters.permanent` wird nur auf deklarierte sortierbare Spalten angewendet; Gruppierung und ID-Tie-Break bleiben deterministisch. `fixedFilters` und View-Scopes gelten zusätzlich und können durch `setFilters` weder gelöscht noch ersetzt werden.

### Paging-Vertrag

- **`server`** (Standard): Seitengröße 10/25/50/100, Server sortiert und filtert. URL, First/Last und serverseitige Gesamtzahl bleiben konsistent.
- **`client`**: die API lädt maximal 100 Datensätze in einer Anfrage, die lokale Ansicht paginiert. Mehr Treffer als `maxRecords` führen **zu einem sichtbaren Fehler**, niemals zu einem unbemerkt unvollständigen Resultat.
- **`off`**: nur für eine ausdrücklich kleine vollständige Datenmenge (max. 100). Besteht der gefilterte Bestand aus mehr Datensätzen, wird die Anfrage abgewiesen, statt alle Datensätze im Browser anzudeuten.

`ResourceCollection` akzeptiert dieselben `pagination`, `filters`, `sorters`, `queryOptions`-Props; alte `pagination={true|false}`-Aufrufe bleiben kompatibel. `pagination={false}` ist somit bewusst als **begrenzt vollständig** definiert, nicht mehr als stillschweigend erste 100.

### Serverseitige Gruppierung

`App\\Rest\\Metrics\\GroupedCounts` liefert `POST /api/v1/{resource}/metrics/groups` mit `group` und derselben `search.filters`/`search.text`-Struktur wie die REST-Suche. Die Auswertung erhält den bereits gefilterten Lomkit-Querybuilder und verwendet ausschließlich explizit deklarierte physische Spalten. Objekte (`city`, `type`), Einheiten (`type`, `status`), Verträge (`status`, `type`) und Partner (`kind`, `city`) sind freigegeben. Gruppenköpfe zeigen die **Gesamtzahl** im Filter-Scope; Zeilen darunter bleiben die Datensätze der gewählten Seite. Das ist explizit beschriftet. Komplexe serverseitig unabhängig paginierte Gruppen (mit eigener Cursorposition) sind weiterhin eine eigenständige nächste Stufe.

### Alle gefilterten Datensätze auswählen

Erst wenn der Benutzer die aktuell geladene Seite ausgewählt hat, kann er zusätzlich **Alle N Treffer auswählen** auslösen. Der Controller löst die vollständige, identische serverseitige Suchabfrage mit echten Zeilen, IDs und Versionen auf. Maximal **100 eindeutige Datensätze**, keine ungeprüfte Hintergrund-Selektion. Ändert sich die Trefferzahl oder Filtermenge zwischen den Anfragen, wird die Auswahl verworfen. Bulk-Actions erhalten danach konkrete Records und durchlaufen weiterhin ihre bestehenden Laravel-Autorisierungen, Transaktionen und fachlichen Limits. Für mehr als 100 Treffer ist eine separate serverseitige Job-/Confirmation-Action nötig; die UI behauptet dann **keine** Vollauswahl.

### Zusätzliche Backends und Infinite Lists

`registerDataProvider("secondary", adapter)` registriert einen **vollständigen** Adapter mit demselben Vertrag wie der Laravel-Provider. Eine Resource kann `dataProvider: "secondary"` deklarieren; Read-/Write-Hooks und Cache-Namensräume bleiben getrennt. `unregisterDataProvider` ist für Tests/Unmount vorgesehen. Moduleigene Laravel-spezifische Actions müssen bei anderen Backends ausdrücklich durch passende Actions ersetzt werden.

`useInfiniteResourceList<TRecord>(resource, { limit: 25, filters })` stellt `records`, `fetchNextPage`, `hasNextPage`, `total` und die übrigen TanStack-Infinite-Query-Zustände zur Verfügung. Der Hook lädt nur die jeweils angeforderte native REST-Seite, nicht alle Records auf einmal.

Tests: `use-resource-table.test.tsx` prüft URL-/Filter-Presets, Client/Off-Grenzen, Provider-Isolation, Infinite-Paging, serverweite Counts und begrenzte Auswahl. `GroupedCountsTest.php` prüft Counts jenseits der ersten Seite sowie das Feld-Whitelisting. Diese Tests ergänzen die bestehenden End-to-End-Prüfungen für REUI-Grid und Formulare.

## 39. Verlässliche Abfragen, Berechtigungen und Formularabschluss

Das [Framework-Konzept mit Refine-Vergleich und Freigabekriterien](framework-readiness.md) hält vorhandene Funktionen, konkrete Verbesserungen und offene Voraussetzungen für eine öffentliche Framework-Veröffentlichung auseinander.

### Cache und Performance

- Listen berücksichtigen nun auch die wirksamen `includes`/`aggregates` im Cache-Schlüssel. Unterschiedliche Antwortprojektionen teilen nicht versehentlich denselben Cacheeintrag.
- `dataProvider: "default"` und eine nicht gesetzte Providerangabe verwenden denselben Namensraum. Benannte Provider bleiben getrennt, auch bei Panel-Patches, Tab-Zählern, RelationPicker-Nachverarbeitung und Inline-Konfliktauflösung.
- Der Grid-Breitenbeobachter bindet sich nach Lade-, Gruppen- und Fehlerzuständen erneut an den tatsächlich montierten Scrollbereich. So wird dessen Scrollbar-Reserve auch bei leeren Gruppenlisten abgezogen; Header und Action-Spalte bleiben innerhalb der verfügbaren Breite.
- `one(resource, id, signal?)` und `overview(id?, signal?)` geben das `AbortSignal` bis zum HTTP-Aufruf weiter. Detailseiten, Panel-Hydrierung und Sitzungsladen verwerfen überholte Antworten.
- `useResourceTable` behält beim Seitenwechsel vorherige Zeilen. Bei Änderung von Ressource, Provider, permanenten Filtern, Elternbezug, Query-View oder Projektion zeigt es den Ladezustand ohne fremde Zeilen. Deaktivierte Abfragen starten auch keine Gruppenmetrik.
- `useSaveRecord` aktualisiert die betroffene Zeile in normalen Listen **und** geladenen Infinite-Seiten. Andere Zeilen und Seiten behalten ihre Referenzen. Ein Edit markiert Listen für den nächsten Besuch als veraltet, ohne sofort den kompletten Tabelleninhalt neu abzurufen. Neue Records lösen ein gezieltes Nachladen aus.

Zusätzliche Provider vor dem Mounten registrieren und während einer Sitzung nicht austauschen. Bei einem tatsächlichen Backend-/Identitätswechsel müssen die Query-Caches geleert werden; eine reine Namensänderung ist keine Autorisierungsgrenze. Moduleigene API-Actions und Dashboard-Metriken müssen zum gewählten Backend passen.

### Optionaler Permission-Adapter

Der Adapter bleibt **standardmäßig deaktiviert**, ohne Adapteraufrufe. Bestehende Zuweisungen an `permissionConfig.enabled` und `.adapter` bleiben möglich und aktualisieren nun montierte Oberflächen. Die bevorzugte explizite Einrichtung erfolgt einmalig vor dem Mounten:

```ts
import {
    configurePermissions,
    invalidatePermissions,
} from "@/framework/permissions";

configurePermissions({
    enabled: true,
    staleTime: 30_000,
    adapter: {
        can: async (resource, action, row, context) => {
            // Eigener Policy-Client; ein solcher Endpunkt wird nicht vom UI erfunden.
            return permissionService.check({
                resource,
                action,
                id: row?.id,
                signal: context?.signal,
            }); // boolean oder { allowed: boolean, reason?: string }
        },
    },
});

// Nach einer Rollenänderung innerhalb derselben Sitzung:
invalidatePermissions();
```

`useAccess(resource, action, row?)` liefert `{ allowed, pending?, reason? }`. `can()` und `access()` sind weiterhin für headless Actions verfügbar. Synchrone Adapter werden unmittelbar ausgewertet. Asynchrone Entscheidungen verwenden TanStack Query für Cache, Deduplizierung und Abbruch; Standards: 30 Sekunden Frische, fünf Minuten Garbage Collection, kein automatischer Retry. Datensatzattribute gehören zum Schlüssel, damit eine Statusänderung eine neue Prüfung auslöst. Ablauf wird beim nächsten Zugriff geprüft. Während einer ausstehenden oder fehlgeschlagenen Prüfung wird kein Zugriff angenommen.

`PermissionBoundary` und `ResourceRouteBoundary` schützen das Mounten von Ressourcen-Routen und Formularen. Direkte Links prüfen zunächst Ressource/Aktion und gegebenenfalls die ID; nach Panel-Hydrierung steht der vollständige Record zur Verfügung. Der Adapter muss daher mit einem partiellen `PermissionRecord` umgehen können. Navigation, Aktionsmenüs, Tabellen, Inline-Editoren und Picker reagieren auf neue Entscheidungen. Logout, Login und Sitzungsablauf löschen den Permission-Cache; verspätete Antworten dürfen keine alte Freigabe wiederherstellen.

Eine Action kann `permissionDenied = "disable"` setzen. Dann bleibt sie mit Begründung deaktiviert sichtbar; Standard ist `"hide"`. Das Verhalten gilt für einzelne und Bulk-Actions; alle ausgewählten Datensätze müssen freigegeben sein. Vorhandene `enabled(context)`-Regeln gelten zusätzlich.

**Diese Grenzen sind UI-Verhalten.** Laravel-Policies und serverseitige Organisationsgrenzen bleiben zwingend für echte Zugriffssicherheit. Deren Aktivierung wurde zuvor ausdrücklich verschoben und ist durch diesen Ausbau nicht erledigt. Ein versteckter Menüpunkt oder deaktivierter Button ist niemals eine Sicherheitskontrolle der API.

### Speichern und Folgeschritte

Der Editor sperrt konkurrierende Submit-/Wizard-Prüfungen synchron. Die fachliche Validierung bleibt serverseitig; Clientprüfungen betreffen nur die Eingabeformate bestehender Controls.

Nach bestätigtem Save werden Record/Version und Cache aktualisiert. Erst danach läuft `request.onSaved(record)` beziehungsweise der nächste Flow-Schritt. Scheitert diese Nachverarbeitung, lautet die Meldung ausdrücklich **„Der Datensatz wurde gespeichert. Der Folgeschritt ist fehlgeschlagen …“**. Die Felder sind dann gesperrt. **Folgeschritt wiederholen** ruft nur den Callback erneut auf, niemals die Create-/Update-Mutation; **Schließen** beendet den Editor. Callbacks müssen wiederholbar sein und sollen keine weitere, nicht idempotente fachliche Mutation verstecken. Fachliche zusammengehörige Schreibvorgänge gehören in eine atomare Backend-Action.

Ein unterbrochener Netzwerkaufruf mit unklarer Serverbestätigung ist dadurch noch keine Ende-zu-Ende-Idempotenz. Für externe Integrationen/Jobs bleibt ein serverseitiger Idempotency-Vertrag ein separates Freigabekriterium.

### Prüfung und Veröffentlichung

Gezielte Regressionstests decken Kontextwechsel, Abbruch, Projektionen, Infinite-Patches, asynchrone Rechte, Sitzungswechsel, direkte Formlinks, Mehrfach-Submit und wiederholbare Nachverarbeitung ab. Die bestehende CI prüft PHP, REST-Vertrag, React, Production Build und Browserabläufe. Performance gegenüber Refine wurde nicht unter vergleichbaren Lastbedingungen gemessen; es wird daher kein pauschaler Geschwindigkeitsvorteil behauptet.

## 40. Headless-Formulare und gezielte Datenabfragen

`useResourceForm` aus `framework/forms/use-resource-form` steuert jetzt auch den Standard-Editor. Eigene Seiten können denselben Controller mit `FormProvider` verwenden: `useResourceForm({resource, row, defaults, context, fields, onSaved, onInvalid, transformValues})`. Der Hook liefert `form`, `save`, `validate(names)`, `refresh`, `retryCompletion`, `busy`, `phase`, `error`, `version` und `completion`. Ein Controller gehört genau zu einem Datensatz; bei Wechsel nach Provider/Ressource/ID remounten. `transformValues` adaptiert Darstellungswerte; die Geschäftsvalidierung bleibt im Backend. Gesperrte Kontextwerte werden nach der Transformation erneut angewendet. Refresh bewahrt Dirty-Felder, nimmt aber die aktuelle Serverversion auf. Ein gespeicherter Datensatz wird bei einem Callback-Fehler nicht erneut angelegt.

`useResourceMany(resource, ids, {includes, aggregates, enabled, staleTime})` hydratisiert ausgewählte Relationen in maximal 100 IDs je Anfrage (insgesamt maximal 1.000). Identische ID-Mengen teilen eine Abfrage unabhängig von ihrer Reihenfolge; `records` bleibt in Auswahlreihenfolge, `missingIds` enthält nicht verfügbare IDs. Der RelationPicker verwendet diesen Hook; erfolgreiche Saves patchen auch diese Caches.

`useInvalidateResource()` liefert eine Funktion `(resource, {kinds, ids, refetchType})`. Beispiele: `{kinds: ['detail', 'many'], ids: [id]}` oder `{kinds: ['list', 'metric', 'view-count']}`. Benannte Provider bleiben getrennt. Panels werden nur mit dem ausdrücklichen Kind `panel` invalidiert. Ohne Kind wird der Ressourcencache aktualisiert, nicht die gesamte Anwendung. `refetchType: 'none'` markiert Daten lediglich als veraltet.

Live-Schnittstellen werden auf ausdrücklichen Wunsch nicht implementiert.

## 41. i18n-Provider

Die App mountet `I18nProvider` oberhalb des Routers. `useI18n()` liefert `locale`, `setLocale`, `t`, `number`, `money` und `date`. Deutsch ist Standard, Englisch auswählbar im Sidebar-Fuß. Ein Sprachwechsel remountet keine Formulare. Die Auswahl wird lokal gespeichert; bei gesperrtem Storage funktioniert sie für die Sitzung.

Erweiterung: `<I18nProvider messages={{en: {'module.title': 'Projects'}}} adapter={optionalAdapter}>`. Der optionale Adapter hat `translate(key, locale, params)` und kann `undefined` für den Katalog-Fallback liefern. `t('module.title', {}, 'Projekte')` verhindert technische Schlüssel als sichtbare Texte. Katalogeinträge unterstützen `{name}`-Interpolation und `{one, other}`-Pluralformen mit `count`. Eigene Locale-Codes müssen gültige Intl-Sprachcodes sein und in `locales` zugelassen werden.

Integriert sind die gemeinsamen Grid-Beschriftungen/Pagination, zentrale Formular-Footer, Tabellenzellen und Tabellenkennzahlen. Fachliche Ressourcen-/Enum-Beschriftungen und Backend-Validierung bleiben im vorhandenen PHP-Schema; dies ist kein Anspruch auf eine vollständige englische Übersetzung sämtlicher Fachmodule. Neue Komponenten sollen `useI18n` statt fest kodierter Format-Locale verwenden. Die strikte deutsche Eingabegrammatik der bestehenden Date-/Currency-Felder bleibt erhalten, bis deren Eingabevertrag ausdrücklich um weitere Locales erweitert wird.

## 42. Globale Datensatzsuche

Topbar und `Ctrl/Cmd+K` öffnen jetzt den gemeinsamen `GlobalSearch`-Dialog. Ab zwei Zeichen wird `POST /api/v1/global-search` ausgeführt (250 ms Debounce, maximal 100 Zeichen, abbrechbare Anfrage). Ergebnisse sind nach Ressource gruppiert; mehr als zehn Treffer führen mit dem Suchbegriff in die vollständige Tabellenansicht. Clientseitiges erneutes Caption-Filtern ist deaktiviert, damit Treffer über verwandte Objekte sichtbar bleiben.

Die REST-Resource implementiert `HasGlobalSearch` mit `globalSearch(): SearchDefinition`, etwa `new SearchDefinition(subtitle: ['city'], title: 'code', limit: 10, priority: 10)`. Ohne Interface bleibt die Ressource aus der globalen Suche ausgeschlossen. `uiLabel()` bestimmt die Gruppenbeschriftung. Registrierte REST-Routen liefern die Ressourcen automatisch, auch bei Route-Cache. Caption-Relationen werden gezielt vorgeladen; Titel, Trefferlimit (1–50) und Reihenfolge sind konfigurierbar. Die durchsuchbaren Felder kommen weiterhin aus `->searchable()` und `searchableRelations()` der REST-Ressource; sie werden nicht nochmals im Modell definiert. Der Endpoint verwendet `Rest::search(...)->as($user)` und damit native Feld-/Relationssuche und Autorisierung; er umgeht keine Scopes mit einem selbstgebauten SQL-OR. Er liefert nur ID, Titel, Unterzeile und lokale Zielroute. Ausweise sind nicht registriert. Mitgelieferte Ressourcen: Objekte, Einheiten, Geschäftspartner, Verträge. Organisationsgrenzen bleiben gemäß bisheriger Entscheidung zurückgestellt und werden durch diese Suche nicht ergänzt.

## 43. Audit-Timeline

Das Modell implementiert `HasAuditTrail` mit `public static function auditTrail(): AuditDefinition` und verwendet den Trait `RecordsAuditTrail`. Rückgabe z. B. `new AuditDefinition(fields: ['code', 'name'], events: ['created', 'updated', 'deleted', 'restored'])`. Akteur und Zeitpunkt werden automatisch erfasst. Ohne diesen Opt-in bleibt die Historie deaktiviert. Der Schreibpfad liest ausschließlich die Model-Definition, ohne Route-Discovery oder REST-Schema-Kompilierung. Der stabile Stream ist standardmäßig der Tabellenname mit Bindestrichen statt Unterstrichen; optional `stream: 'properties'`. Mehrere Resource-Ansichten desselben Models teilen diese Historie; UI-Verfügbarkeit schaltet die Aufzeichnung nicht ab. Bestehende Streamnamen bleiben erhalten. Die Liste ist eine ausdrückliche Datenfreigabe, keine automatische Kopie aller Modellattribute. Versteckte Modellattribute werden zusätzlich ausgeschlossen. Standardmäßig erfasst: ausgewählte Stammdaten von Objekten, Einheiten, Partnern und Verträgen; keine Ausweisnummern, Bankdaten oder freien Notizen. Werte sind auf 500 Zeichen begrenzt. Nicht eingetragene Felder haben keine Historie.

Der `AuditObserver` erfasst `created`, `updated`, `deleted`, `restored` mit Akteur und Vorher-/Nachher-Werten. Er schreibt synchron auf derselben DB-Verbindung; innerhalb der bestehenden REST-Schreibtransaktion werden Audit und Fachänderung gemeinsam zurückgerollt. Eigene Jobs/Actions müssen ihre fachlichen Writes wie üblich in einer Transaktion ausführen; direkte Query-Builder-Updates ohne Modellereignisse werden nicht erfasst. Systemänderungen haben den Akteur „System“. Die Vergangenheit wird nicht rekonstruiert.

Nach `php artisan migrate --force` erscheint der Tab bei Ressourcen mit `features.audit`. `auditTabs(resource, id)` integriert den lazy geladenen Verlauf in Detailseiten; `<AuditTimeline resource={resource} id={id} />` kann auch in einem Sheet benutzt werden. Der lesende Endpoint prüft den Zugriff über die native REST-Suche und View-Policy. Cursor-Seiten enthalten maximal 20 Einträge; Änderungen am Datensatz invalidieren dessen Historie. Keine Schreib-/Lösch-API für Audit-Einträge, Modelländerung/-löschung blockiert. Das ist eine nachvollziehbare Anwendungshistorie, keine revisionssichere oder gegen Datenbankadministratoren manipulationsgeschützte Archivierung.

## 44. CSV-Import mit Zuordnung und Relationsvorschau

`CsvImportDialog` ist ein gemeinsam genutzter, lazy geladener Dialog. `ResourceCollection` zeigt ihn automatisch für serverseitig freigegebene Ressourcen und vorhandene Create-Berechtigung. `importable={false}` blendet ihn aus. In eingebetteten, durch Elternfilter eingeschränkten Tabellen ist er standardmäßig aus: Ein Import darf keine scheinbar gesperrte Elternbeziehung umgehen. Für andere DataProvider ist dieser Laravel-Import nicht automatisch aktiviert.

Die Freigabe liegt an der vorhandenen REST-Resource; Objekte und Einheiten sind eingerichtet. Die Resource ist bereits für Felder, Regeln, Beziehungen und Actions zuständig. Audit bleibt als Datenverhalten am Model. Alle Definitionen sind `final readonly` und verwenden benannte Constructor-Argumente:

```php
use App\Contracts\Framework\HasCsvImport;
use App\Contracts\Framework\HasGlobalSearch;
use App\Framework\ImportDefinition;
use App\Framework\SearchDefinition;

class UnitResource extends Resource implements HasGlobalSearch, HasCsvImport
{
    public static string $model = Unit::class;

    public function globalSearch(): SearchDefinition
    {
        return new SearchDefinition(
            subtitle: ['property.name', 'property.city', 'code'], priority: 20,
        );
    }

    public function csvImport(): ImportDefinition
    {
        return new ImportDefinition(
            fields: ['property_id', 'code', 'name', 'type', 'status', 'area'],
            relations: ['property' => ['code', 'name']],
            aliases: ['property_id' => ['Objektnummer', 'Objekt-Nr.']],
        );
    }

    // Bestehende fields(), relations(), actions() bleiben die fachliche Quelle.
}
```

```php
use App\Contracts\Framework\HasAuditTrail;
use App\Framework\AuditDefinition;
use App\Framework\RecordsAuditTrail;

class Unit extends Model implements HasAuditTrail
{
    use RecordsAuditTrail;

    public static function auditTrail(): AuditDefinition
    {
        return new AuditDefinition(fields: ['code', 'name', 'property_id', 'status']);
    }
}
```

### Registrierung und Erweiterung durch Module

Standard: vorhandene `Rest::resource(...)`-Routen registrieren die Ressource automatisch, auch mit Laravel-Route-Cache. Kein Model-Verzeichnisscan und kein zweiter Pflichtkatalog. Optionale Modulregistrierung in `ServiceProvider::register()`:

```php
$this->app->tag([ProjectResource::class], FeatureRegistry::RESOURCE_TAG);
```

Tags registrieren die Ressource für die Feature-Registry; die normalen REST-/React-Routen sind weiterhin separat anzulegen. Identische Registrierungen sind idempotent; verschiedene Klassen mit gleichem `uiResourceName()` werden abgewiesen. Austausch vorhandener Ressourcen erfolgt bewusst über Laravel-Bindings, nicht durch stille Überschreibreihenfolge. Resource-Konfiguration lässt sich bei größerem Umfang an eigene containeraufgelöste Klassen delegieren, z. B. `return app(UnitImportDefinition::class)->definition();`; deren Rückgabe bleibt `ImportDefinition`. Keine zusätzliche Importer-Klasse für jedes einfache Modul erforderlich.

### Dynamische Verfügbarkeit und Laufzeitkosten

Optional implementiert die Resource `HasFeatureAvailability`:

```php
public function featureAvailable(Feature $feature, FeatureContext $context): bool
{
    return match ($feature) {
        Feature::Import => $context->actor !== null
            && $context->actor->can('create', static::$model),
        default => true,
    };
}
```

`FeatureContext` enthält den aktuellen Akteur und die Backend-Locale. Diese zusätzliche Einschränkung gilt für Metadaten, globale Suche, Audit-Lesen und jeden Import-Endpoint inklusive Bestätigung. Sie ersetzt keine Policy und aktiviert keine nicht deklarierte Fähigkeit. Audit-Schreiben richtet sich ausschließlich nach dem Modell. Beispiel-Policy erst aktivieren, wenn fachlich gewünscht; der bestehende Permission-Adapter bleibt unverändert.

Die `FeatureRegistry` hält Discovery und kompilierte Definitionen nur im Laravel-Request-/Job-Scope. `FeatureDefinitionCompiler` prüft die Struktur einmal je Resource-Klasse und Lifecycle. Deklarationsmethoden müssen innerhalb dieses Lifecycles stabil sein; keine benutzerabhängigen Felder darin verstecken. Benutzer-/Locale-Entscheidungen gehören in `featureAvailable()` bzw. `uiLabel()` und werden nicht memoisiert. Globale Suche überspringt Klassen ohne Such-Interface bereits vor der Schema-Kompilierung. Audit-Writes lösen die Registry überhaupt nicht auf. Es gibt keinen persistenten Benutzer-, Berechtigungs- oder Tenant-Cache und keine zusätzliche Cache-Invalidierungspflicht. Aktuell werden bei der Discovery die registrierten Resource-Instanzen einmal pro Scope aufgelöst; ein persistentes Manifest ist erst nach Messung bei sehr großen Katalogen sinnvoll.

### Migration der bisherigen API

Die interne `Model::framework(): ModelFeatures`-API wurde vollständig ersetzt; keine parallelen Konfigurationspfade. `search()` wird `Resource::globalSearch()`, `import()` wird `Resource::csvImport()`, `audit()` wird `Model::auditTrail()`, `label()` wird `Resource::uiLabel()`. `DefinesModelFeatures`, `HasModelFeatures` und `ModelFeatures` entfallen. Alle mitgelieferten Modelle/Ressourcen sind migriert. Externe Module müssen die Imports, Interfaces und Methoden entsprechend umstellen. Datenbank und React-Metadatenvertrag bleiben kompatibel; keine neue Migration.

`relations` benennt die vorhandene Eloquent-/REST-BelongsTo-Beziehung und deren erlaubte Suchmerkmale. Fremdschlüssel und Zielressource werden abgeleitet. Die vorhandenen Picker-Filter gelten sowohl beim Auflösen als auch bei der Übernahme. Andere Relationsarten werden nicht implizit importiert. `aliases` ergänzt alternative CSV-Spaltenüberschriften; bei mehrdeutiger Erkennung erfolgt keine automatische Zuordnung.

`php artisan framework:check` prüft alle registrierten Ressourcen auf unbekannte/versteckte Felder, nicht schreibbare Importfelder und fehlende oder ungültige Relationsdefinitionen. Dieser Check ist Teil der CI und prüft auch momentan nicht verfügbare Fähigkeiten, damit dynamische Ausblendung keine ungültige Konfiguration verdeckt. Die Registry ist pro Request/Job-Lifecycle scoped; es gibt keinen tenant- oder benutzerübergreifenden Entscheidungscache.

Die Liste ist eine Importfreigabe, kein zweites Validierungsschema. Beschriftungen, Typen, Enum-Bezeichnungen und Schreibrechte stammen aus PHP-REST-Feldern. `ImportMutationRequest` verwendet die native Mutation-Pipeline; gleiche Serverregeln, Policies, Model-Observer und Transaktionen wie die normale Anlage. Bei weiteren Ressourcen muss die Freigabe alle fachlich notwendigen Anlagefelder umfassen. Diese Version legt neue Datensätze an; kein verdecktes Upsert, keine verschachtelte Vertragsanlage per CSV.

Ablauf: Importfelder/erlaubte Werte ansehen und CSV-Vorlage herunterladen → Datei prüfen → Zuordnung (serverseitig vorgeschlagen anhand Feldname, Beschriftung oder Alias) → Relation über ein freigegebenes Merkmal suchen → Vorschau mit aufgelöstem Titel und Fehlern je Datensatz/Feld → verbindlich übernehmen. Relationen werden exakt innerhalb der nativen Such-/Policy-Grenzen gesucht, pro identischem Suchwert zwischengespeichert; null oder mehrere Treffer blockieren. Bei Übernahme werden Sichtbarkeit und Geschäftsregeln erneut geprüft. Geschäftsregeln in Mutation-Hooks werden erst bei der Übernahme ausgeführt; die Vorschau behauptet keine vollständige Simulation.

Grenzen: UTF-8 mit optionalem BOM, Komma/Semikolon/Tab, korrekt gequotete Zellen einschließlich Zeilenumbrüchen, maximal 2 MB / 100 Datensätze / 50 Spalten / 10.000 Zeichen je Zelle. Deutsche Enum-Titel, Ja/Nein und `dd.MM.yyyy` werden normalisiert. Der Dialog zeigt die tatsächlich für die Anlage angebotenen Enum-Werte. Abweichende CSV-Werte (etwa „Whg“) können explizit „Wohnung“ zugeordnet werden; das Backend akzeptiert nur freigegebene Zielwerte. Die Vorschau zeigt lesbare, normalisierte Werte. Nicht erkannte oder mehrdeutige Enum-Werte ergeben einen Feldfehler mit erlaubten Bezeichnungen. Ein Fehlerfilter und Zähler zeigen betroffene Zeilen; Zurück erhält die Zuordnung, ein neues Öffnen startet eine neue Sitzung. `Overlay.bodyResetKey` setzt beim Schrittwechsel nur die Scrollposition zurück, ohne Felder neu zu mounten. Zahlen akzeptieren Dezimalpunkt oder -komma, keine mehrdeutigen Tausendertrennzeichen. Es gibt keinen zweiten Client-Validator für Fachregeln.

Die geprüfte Nutzlast liegt verschlüsselt in `import_batches`; der Bestätigungsschlüssel ist an Benutzer und Ressource gebunden und 15 Minuten gültig. Ein transaktionaler Lock und gespeichertes Ergebnis machen wiederholte Bestätigung idempotent. Nach Erfolg wird die Nutzlast geleert. Bei einem Fehler werden alle Fachänderungen und Audit-Einträge zurückgerollt. Der täglich geplante `model:prune` entfernt abgelaufene Batches nach einem Tag; dafür muss der Laravel-Scheduler laufen. Große Hintergrundimporte und dauerhafte Importhistorie sind bewusst nicht Teil dieses synchronen Dialogs.

Der neue `GET .../import/schema` liefert Felder, Pflichtfeldhinweise, Enum-Optionen, Relationssuchmerkmale und Vorlage; alle Beschriftungen stammen aus dem Backend. Die Hinweise ersetzen keine Servervalidierung. Deployment bei noch nicht ausgeführtem vorherigen Ausbau: `php artisan migrate --force`; dieser Capability-Umbau benötigt keine weitere Migration. Tests decken Zuordnung, aufgelöste/mehrdeutige/gelöschte Beziehungen, Benutzerbindung, Ablauf, Opt-in/Create-Policy, native Fehler, atomaren Rollback und doppelte Bestätigung ab.

## 45. Dokument-Actions und PDF-Vorschau im Sheet

Reports verwenden einen eigenen, rein lesenden Action-Ablauf: Ein Klick öffnet sofort das endgültige Sheet. Vorbereitung, Serverfehler mit Wiederholen und PDF-Ansicht bleiben in derselben Oberfläche. Es gibt keinen zusätzlichen Bestätigungsdialog und keinen automatischen Tabellen-/Formular-Reload. Neue Berichte benötigen keine eigene Seite oder Sheet-Implementierung.

Der Objektbericht trennt wie s4v2 `BuildPropertyReport` (nur fachliche Projektion), `PropertyReport` (Inhalt), `StructuredPdfReport` (Textfluss, Tabellen, wiederholte Tabellenköpfe, Seitenumbrüche) und `ReportPdfDocument` (FPDF, Kopf/Fuß, Zeichencodierung). Da nextHV noch kein Organisationsprofil besitzt, bleibt der Dokumentfuß auf die bisherige nextHV-Kennung beschränkt.

Backend: `PdfReportAction` setzt Einzelziel und View-Autorisierung. Die konkrete Action implementiert `report(Model $model, ActionFields $fields): DocumentResult`. `CreatePropertyReport` erzeugt eine benutzergebundene, zehn Minuten gültige Signatur für den geschützten Report-Controller. `DocumentResult` validiert lokale API-Quelle, Download-Dateiname und Präsentation und liefert den bestehenden `ui.type = document`-Vertrag:

```php
return new DocumentResult(
    title: 'Objektbericht · '.$model->name,
    url: URL::temporarySignedRoute('properties.report', now()->addMinutes(10), [
        'property' => $model->getKey(), 'user' => request()->user()->id,
    ], absolute: false),
    name: 'objekt-'.$model->getKey().'.pdf',
);
```

Der geschützte Controller prüft View-Policy, Signatur und Benutzerbindung und liefert `application/pdf`, `private, no-store`, `nosniff`. Aufbau: Action → Berichtsdaten (`BuildPropertyReport`) → Renderer (`PropertyReport` / `StructuredPdfReport`) → gemeinsame Vorschau. Der Renderer führt keine Datenbankabfragen aus. Neue Report-Routen müssen dieselbe Autorisierung und Dokumentantwort selbst deklarieren; der Result-DTO ersetzt keine Zugriffskontrolle.

Frontend:

```ts
class PropertyReportAction extends ReportAction {
    id = "report";
    label = "Objektbericht als PDF";
}
```

`ReportAction` nutzt den Resource-DataProvider, das PDF-Icon, `interaction: 'report'`, ein Einzelziel und `refresh: false`. `ReportActionSheet` erstellt eine eigene kurzlebige Query-Sitzung ohne automatische Retries oder Fokus-Refetch. Beim Schließen darf ein verspätetes Action-Ergebnis keine Vorschau erneut öffnen. Bei Wiederholen wird die Action erneut geprüft und eine neue Dokumentfreigabe angefordert. Für parametrisierte Berichte kann `interaction: 'dialog'` mit Action-Feldern verwendet werden; das Dokumentergebnis öffnet anschließend dieselbe Vorschau.

**Aktionen verwenden ausschließlich nextHV-Sheet-Props:** `PdfPreviewSheet` übergibt Aktualisieren, Öffnen und Download an `Overlay.actions`. `bodyInset={false}` und `bodyScroll="managed"` überlassen dem Viewer den Dokumentbereich. Kein eigener Sheet-Header, keine aus s4v2 übernommene Action-Leiste und kein zweiter Download-Balken im Inhalt. Seitennavigation und Zoom sind Werkzeuge des gemeinsamen Viewers.

Der Viewer übernimmt das Canvas-/Lazy-Loading-Prinzip aus s4v2 (`PdfCanvasPreview`, `DocumentPdfPreview`), angepasst an die vorhandenen nextHV-Komponenten. Eine direkte Abhängigkeit `pdfjs-dist` ersetzt die browserabhängige `<object>`-Anzeige; React-PDF und weitere Viewer-Wrapper sind nicht installiert. Engine und lokal gebündelter Worker laden erst beim Öffnen einer PDF-Vorschau.

`usePdfDocument` lädt die geschützte Quelle einmal mit Sitzung und `no-store` und teilt Blob und Objekt-URL zwischen Viewer und Header. Abgebrochene/überholte Antworten werden ignoriert; beim Quellenwechsel oder Schließen werden Fetch, Renderarbeit, Worker und Objekt-URL freigegeben. Ein wiederverwendeter, separat eingebetteter `PdfViewer` nutzt dieselben Bausteine für Ausweisdateien.

`PdfCanvasPreview` zeigt weiße Seiten auf hellem Hintergrund, passt initial an die Breite an und bietet Zoom (25–220 %), Breitenanpassung, Vor-/Zurück-Seiten sowie Ctrl/Cmd+Mausrad. Die realen PDF-Seitengrößen werden berücksichtigt, einschließlich Querformat und gemischter Formate. Nur Seiten im bzw. nahe dem sichtbaren Bereich erhalten einen Canvas; entfernte Canvas-Flächen werden freigegeben. Rasterflächen sind pro Seite auf 8 Millionen Pixel und maximal zweifache Pixeldichte begrenzt. Fehler beim Laden oder Rendern sind innerhalb der vorhandenen Oberfläche wiederholbar. Die Canvas-Vorschau bietet keine Textauswahl oder Annotationsbearbeitung; dafür bleiben Öffnen/Download verfügbar.

Tests prüfen einmalige geschützte Downloads, tatsächliche Seitengrößen, Zoom, Cleanup, veraltete Antworten, Fehler/Wiederholen, zentrale Action-Platzierung und Report-Abbruch. Der Browserablauf wartet auf wirklich gerenderte PDF-Seiten und prüft Zoom und Mobilbreite, statt nur das Vorhandensein eines Browser-Plugins nachzuweisen.
