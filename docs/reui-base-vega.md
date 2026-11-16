# nextHV · REUI Base Vega

**Aktiver Designstil: `base-vega`**, konfiguriert in `components.json`.
Die Registry nutzt `https://reui.io/r/{style}/{name}.json`;
Vega ist ein offiziell unterstützter Stil für den vorhandenen Base-UI-
Stack mit React 19 und Tailwind CSS 4.

## Designsystem

- **Vega-Kontrollen:** Standard-Buttons, allgemeine Textfelder und Selects
  bleiben 36 px; große Varianten sowie die Tabellen-Toolbars bleiben 40 px.
  Ausschließlich die Eingabefelder innerhalb der Ressourcen-Formulare
  (Text, Relation-Combobox, Select, Datum und Zahlen) sind auf **32 px**
  reduziert. Das erfolgt über den einen Token
  `--control-height-field: 2rem` und die schon vorhandene
  `[data-slot="field-control"]`-Variable; Formular-Textareas erhalten
  einen kompakten Mindestwert von 64 px. Die größere Vega-Typografie und
  alle Karten-/Sheet-Stile bleiben unverändert.
- **Radius:** zentraler `--radius: 0.625rem`. Dialoge, Sheets,
  Karten, Badge, Tabs, Popover, Dropdowns und Inputs verwenden
  Vega-Typografie, Fokuszustände und Abstände. Die
  blaue nextHV-Primärfarbe und Statusfarben bleiben erhalten.
- **REUI Frame:** verwendet den offiziellen Vega-Radius
  `[--frame-radius:var(--radius-xl)]`.
- **Data Grid:** Headless-Tabellenlogik, Pagination und eigene
  Editing-Erweiterungen bleiben erhalten. Sie übernehmen die
  Vega-Dichte über die zentralen UI-Primitives und Tokens.
- **Objekte:** In der Übersicht zeigt „Gebäude & Verwaltung“
  `EditableKeyValueList` statt einer Read-only-`DetailList`.
  Sieben freigegebene Eigenschaften können einzeln bearbeitet
  werden; Edit-Rechte, Validierung und 409-Konflikte laufen
  über den zentralen Framework-Provider.
- **Kompatibilität:** Navigation, Sidebar, Filter, Wizards und
  PDF-Preview behalten ihre bestehende Fachlogik.

`docs/ui-sources.json` dokumentiert weiterhin die **ursprüngliche
Quellprovenienz** installierter Komponenten und verwechselt
projektinterne Vega-Anpassungen nicht mit unverändertem Registry-Code.

## Verifikation

`resources/js/framework/theme-vega.test.tsx` sichert Registry,
Radius, Control-Höhen und zentrale Primitives ab.
`resources/js/modules/properties/building-management-key-values.test.tsx`
prüft Inline-Editing, Feld-Subset und Versionscheck.
PHP-/REST-Tests, Vitest, TypeScript/Vite und Playwright-Screenshots
prüfen die Integration.

Quellen: https://reui.io/docs/registry und
https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/styles/style-vega.css

## Erfassungs-Wizards: einheitliches REUI-Sheet

Mehrstufige ResourceEditor-Wizards und verknüpfte Erfassungs-Flows öffnen
immer ein rechtes, responsives Base-Vega-Sheet. Auch ältere Links mit
`layout=dialog&wizard=1` werden beim Einlesen als Sheet behandelt.
Normale Formular-Dialoge und die getrennte **Änderungen verwerfen?**-
Bestätigung bleiben unverändert möglich.

Der Sheet-Wizard basiert **konkret auf `@reui/c-stepper-10`** (ReUI:
[Stepper with content for each step](https://reui.io/components/stepper/c-stepper-10)).
Das Beispiel wurde mit dem Originalbefehl
`pnpm dlx shadcn@latest add @reui/c-stepper-10 --yes` in GitHub Actions
installiert (Run `43838496953`) und an den bereits vorhandenen
`@/components/reui/stepper` sowie die Laravel-/React-Projektstruktur
angepasst. Die angepasste Source liegt unter
`resources/js/components/examples/c-stepper-10.tsx`.

Die Navigation ist **horizontal** mit `StepperNav`, nummerierten
`StepperIndicator`, `StepperTitle`, `StepperDescription` und
`StepperSeparator`. Der aktive Schritt wird mit dem gefüllten Indikator,
nicht mit einer zusätzlichen Hintergrundkarte, hervorgehoben.
Der Fortschrittszähler steht nur einmal beim Formular-Titel.
Im `StepperPanel` hält je ein `StepperContent` die Felder eines Schritts
(auch ausgeblendete Felder bleiben gemountet, damit Werte und Repeater beim
Zurückgehen nicht verloren gehen). Wizard-Formulare stehen auf einer klaren
Fläche ohne zusätzliche verschachtelte Frame-Karten. Auf Desktop passen auch
sechs Schritte ohne rechts abgeschnittene Labels in das kompaktere Sheet;
mobil scrollt die Navigation unabhängig horizontal.
Die separate bisherige `VerticalWizardProgress`-Komponente
(`components/blocks/wizard-progress.tsx`) bleibt zur alternativen Nutzung
erhalten, wird aber **nicht** mehr im Objekt-/Vertrags-Sheet gerendert.

Abgeschlossene Schritte sind direkt erreichbar, künftige gesperrt.
Eine zweite rein dekorative Fortschrittsleiste entfällt.

Nur der Formular-Body scrollt vertikal und springt bei Schrittwechsel an
den Anfang. Der Footer bleibt mit Zurück (anfangs deaktiviert), Abbrechen
und Weiter bzw. Speichern erreichbar. Der eigentliche Server-Validierungs-/
Persistenzablauf wird nicht verändert. Es entsteht kein Dialogwechsel
zwischen Schritten.

REUI-Orientierung: https://reui.io/components/sheet und
https://reui.io/components/stepper. Die fachliche Validierung und
Server-Persistenz bleiben in den bestehenden nextHV-Form-Hooks.

### Randbündige Wizard-Oberfläche

Anders als gewöhnliche, bewusst schwebende Bearbeitungs-Sheets reichen Wizard-
Sheets auf Desktop bis an den rechten Bildschirmrand und von oben bis unten.
Sie haben dort keine Dialog-artigen Außenabstände oder Rundungen. Auf Mobil-
geräten belegt das Sheet die volle verfügbare Breite. Der Formularinhalt scrollt
weiterhin unabhängig von Stepper und Footer.

Jeder `StepperTrigger` hat eine eindeutige ID und ist mit dem eigenen
`StepperContent`-Tabpanel verbunden. Nur erreichte Schritte sind rückwärts
anwählbar; zukünftige bleiben bis zur Validierung deaktiviert. Mehrteilige
Erfassungs-Flows zeigen ihren Fortschritt nichtinteraktiv an. Längere Titel
brechen innerhalb der horizontalen Schrittzeile um.

### Dynamische Navigation und gemeinsame Footer-Controls

`useCStepper10Navigation({ active, count, onChange, validate, canBack,
canNext, canFinish, busy, onValidationError })` bildet die einzige
Navigationslogik. Ein `validate(currentStep, targetStep)` gibt
`boolean | Promise<boolean>` zurück: Ohne Erfolg bleibt der aktive
Schritt unverändert. Rückwärts geht es ohne erneute Servervalidierung;
vorwärts nur genau einen Schritt und nur nach erfolgreicher Prüfung.
Eine synchrone Sperre verhindert Doppelwechsel bei schnellen Klicks.

`CStepper10` akzeptiert denselben `navigation`-Controller wie die
Footer-Buttons. `canBack`, `canNext`, `canFinish` steuern die
Freigaben – auch während `busy`/`validating`; Enter im Formular,
Stepper-Tab und Footer »Weiter« verwenden denselben Wechsel.
Standalone bleibt `CStepper10` mit `onSelect`, `validate`,
`canBack` und `canNext` nutzbar.

Bei mehr als vier Schritten verwendet die Stepper-Navigation eine
kompakte minimale Schrittlänge und wächst nur so weit wie möglich.
Bei Überlauf erscheint eine tastaturbedienbare Scroll-Steuerung.
Bei Schrittwechsel wird nur die *horizontale* Schrittnavigation
nachgeführt, nicht das ganze Sheet. Auf schmalen Viewports kann
`shortLabel` pro Schritt zusätzlich Platz sparen; der vollständige
zugängliche Name bleibt immer erhalten.

`canNavigate(currentStep, targetStep)` ist ein zusätzlicher optionaler
Zugriffs-Callback für geschützte Einzelschritte und wirkt auf den direkten
Stepper-Klick ebenso wie auf die Footer-Freigaben. `canFinish` steuert
die finale Speichern-Aktion. `FormGroupDefinition.stepShortLabel` kann
in den Resource-Definitionen ein kompaktes Mobil-Label vorgeben, ohne
den vollständigen Screenreader-Namen oder das Desktop-Label zu ersetzen.
