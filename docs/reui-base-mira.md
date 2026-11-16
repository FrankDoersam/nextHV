# nextHV · zentraler REUI-Designstil

**Aktiver Designstil: `base-mira`**, konfiguriert in `components.json`.
Der REUI-Registry-Einstieg bleibt `https://reui.io/r/{style}/{name}.json`,
die Primitives basieren weiter auf **Base UI**, React 19 und Tailwind 4.

## Implementierung

- `resources/css/app.css`: zentrale semantische Farbwerte (nextHV Blau und
  neutrale Flächen bleiben erhalten) sowie Mira-Eckradius von `0.5rem`.
- `resources/js/components/ui`: die existierenden Button-, Input-, Textarea-,
  InputGroup-, Select-, Badge-, Card-, Tabs-, Label-, Dialog-, Sheet-, Popover-
  und Dropdown-Primitives wurden auf die Mira-Größen, Textstufen, Ringstärken
  und Rundungen abgestimmt. Default-Buttons und Inputs sind in Mira 28 px hoch;
  die kompakte Auswahl hat 28/24 px und Menü-Items verwenden Text in 12 px.
- `resources/js/components/reui/frame.tsx`: REUIs offizieller Mira-Frame
  verwendet `--radius-lg` statt `--radius-xl` der Nova-Version.
- Das installierte REUI-DataGrid übernimmt die nachgewiesenen Mira-Unterschiede
  an der Header-Aktion, den Grid-Actions und Pagination, ohne den
  angepassten, getesteten Tabellen-/Editing-Code zu überschreiben.
- Die Sidebar verwendet kompaktere Mira-Zeilen, behält aber das einheitliche
  Berechtigungs-/Navigationsmodell. Layouts mit explizit größeren Touch-Zielen,
  Formularaktionen und die PDF-Vorschau dürfen ihre fachlich begründeten
  Größen behalten.

Diese Migration **ersetzt keine React-Primitives**, führt keinen zweiten
Design-Stack und keinen neuen Runtime-Import ein. ReUI folgt dem
Copy-and-own-Modell: zentral installierte Komponenten gehören zum Projekt.
Regeln für `className`-Overrides und integrierte Fachkomponenten bleiben
unverändert.

## Verifikation

`resources/js/framework/theme-mira.test.tsx` sichert den Registry-Stil und die
gemeinsamen Standardabmessungen ab. Die vorhandenen Vitest-/PHP-Tests,
Browserabläufe und Screenshot-Suite prüfen Navigation, Dropdowns, Tabellen,
Formular- und PDF-Sheets weiterhin über echte DOM-/Browseraktionen.

Quellen:
- REUI Registry / supported variants: https://reui.io/docs/registry
- Shadcn offizieller Mira-Stil:
  https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/styles/style-mira.css
- REUI Base-Mira Frame und Grid:
  https://github.com/keenthemes/reui/tree/main/public/r/styles/base-mira

**Hinweis zum Quellenmanifest:** `docs/ui-sources.json` dokumentiert die
Upstream-Herkunft. Bei angepassten Komponenten ist dies kein Anspruch
auf Byte-identische Registry-Kopien; unveränderte Nova-Einträge dokumentieren
ihre ursprüngliche Quelle.


## Höhenvertrag für Controls

`--control-height` (28 px im Mira-Standard), `--control-height-sm`
(24 px), `--control-height-lg` (32 px) und `--control-height-field`
(36 px) werden zentral in `app.css` definiert. Die Tabellen-Toolbar
setzt `--control-height` auf 32 px, das gemeinsame
`BaseField`-Kontrollfeld auf 36 px:
Textfelder, Base-UI-Select, die durchsuchbare ChoicePicker-Combobox und
Standard-Buttons verwenden denselben Token. Die Toolbar-Aktionen `lg`
und `icon-lg` entsprechen ebenfalls 32 px. So sind die Steuerelemente
tatsächlich gleich hoch – nicht nur mittig ausgerichtet. Im Formular sind
dadurch beispielsweise Einheiten-Combobox und Vertragsnummer gleich hoch.
Ein bewusst mehrzeiliges, reichhaltiges Auswahlfeld bleibt als Ausnahme höher.

## Erfassungs-Wizards: einheitliches REUI-Sheet

Mehrstufige ResourceEditor-Wizards und verknüpfte Erfassungs-Flows öffnen
immer ein rechtes, responsives Base-Mira-Sheet. Auch ältere Links mit
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
