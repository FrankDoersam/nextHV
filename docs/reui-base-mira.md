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

Der feste Header zeigt genau einen REUI-Stepper (mit aktivem, erledigtem
und zukünftigem Schritt). Eine zweite, rein dekorative Fortschrittsleiste
wird nicht benötigt. Auf kleinen Bildschirmen bleiben die Schrittsymbole
und der aktive Schrittname sichtbar; vollständige Labels erscheinen
erst bei ausreichender Breite. Zurücknavigation auf erledigte Schritte
erhält Eingaben; vorwärts prüft weiterhin die Felder des aktuellen
Schritts. Nur der Formular-Body scrollt und springt bei Schrittwechsel
an den Anfang. Der Footer bleibt mit Zurück, Abbrechen und Weiter bzw.
Speichern erreichbar. Es entsteht kein Dialogwechsel zwischen Schritten.

REUI-Orientierung: https://reui.io/components/sheet und
https://reui.io/components/stepper. Die fachliche Validierung und
Server-Persistenz bleiben in den bestehenden nextHV-Form-Hooks.
