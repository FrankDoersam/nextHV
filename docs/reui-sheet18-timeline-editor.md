# ReUI Sheet 18 · zentraler Timeline-Editor

## Quellabgleich

Die originale öffentliche Vorschau `https://reui.io/preview/base/sheet-18` wurde am 17.11.2026 in Chromium über GitHub Actions geöffnet und der gerenderte DOM untersucht. Die Referenz ist ein Firewall-Regel-Editor, kein Bauprojekt-Editor. Die Gestaltung ist adaptiert, nicht die fachlichen WAF-Filter, Logs oder Regeln.

Bestätigte Originalstruktur:
- `[data-slot=sheet-content]` rechts eingerückt, `inset-y-4 right-4`, `w-[min(36rem,calc(100vw-2rem))]`, `h-[calc(100svh-2rem)]`, `rounded-xl`
- Header `flex shrink-0 flex-col gap-1 border-b px-5 py-3.5`: Kennung mit Kopieraktion, Schließen, Titel/Badge, Metadaten
- Line-Tabs über `Tabs`/`TabsList`/`TabsTrigger`, `gap-5 border-b px-5 py-0`
- Eigenständiger vertikal scrollender Content-Bereich
- Footer `bg-muted flex shrink-0 ... gap-2 border-t px-5 py-3`: Destruktive Aktion links, Abbrechen/Speichern rechts

## Zentrale Komponenten

`resources/js/components/reui/sheet-18-layout.tsx` enthält die vollständige wiederverwendbare Struktur. Relevante Props:
`open`, `onOpenChange`, `reference`, `title`, `badge`, `description`, `tabs`, `initialTab`, `primaryLabel`, `primaryDisabled`, `onSubmit`, `onCancel`, `destructiveAction`, `headerAction`.

`tabs` ist eine Liste aus `{value,label,content,count?,disabled?}`. Kein Layout wird im Projekt-Controller gerendert.

`resources/js/components/reui/renovation/task-sheet.tsx` liefert die Felder als Props:
- **Vorgang**: Bezeichnung, Leistungsbeschreibung, Gewerk, Status, Dauer, frühester Start, Kontakt, Arbeitstage
- **Abhängigkeiten**: vorhandene Vorgänger, frei wählbare ReUI-Checkboxen
- Footer: Löschen (AlertDialog), Abbrechen, Speichern; für neue Vorgänge statt Speichern „Anlegen“

Der originale ReUI-Base-UI-Sheet-Primitive bleibt unverfälscht; `resources/js/components/ui/sheet.tsx` erweitert ihn nur um die optionale, lokale Overlay-Klasse, sodass andere Sheets nicht beeinflusst werden.

## Grenzen

Die ursprünglichen WAF-Komponenten `Filters`, `CodeBlock`, Anfrage-Logs und Firewall-Aktionen wären in einem Renovierungsvorgang fachlich falsch und werden daher nicht verwendet. Die UI-Hierarchie wird vom tatsächlich gerenderten Referenz-HTML abgeleitet; es wird kein urheberrechtlich geschützter Premium-Quellcode kopiert. Die Task-Daten bleiben in der Demo lokal, ohne Produktionspersistenz.
