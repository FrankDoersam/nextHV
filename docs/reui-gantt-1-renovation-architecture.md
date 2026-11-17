# ReUI Gantt-1 · Kernsanierung 2027

## Herkunft und Zugriff

Die öffentlich zugängliche Originalquelle ist keenthemes/reui: registry-reui/bases/base/components/gantt/c-gantt-1.tsx. Sie verwendet Gantt, GanttNav, GanttToolbar, GanttView, Card, Popover, Tabs, Switch, RadioGroup, Select und Button. Die Original-Gantt-Engine liegt bereits in resources/js/components/reui/gantt/.

Die angefragte Seite https://reui.io/preview/base/gantt-1 war nicht direkt abrufbar. Das öffentliche c-gantt-1 enthält kein fertiges Add-Task-Dialog-/Sheet-Muster. Das neue Task-Sheet verwendet deshalb die ReUI/Base-UI-Sheet-, Field-, Select-, Switch-, Checkbox- und AlertDialog-Primitives. Ein mathematischer 100%-Pixelvergleich mit dem privaten Preview ist nicht bestätigt.

## Zentrale Komponenten

- components/reui/renovation/gantt-workspace.tsx – Gantt-1-Komposition, Toolbar, Resources, Ereignisse
- components/reui/renovation/gantt-settings.tsx – originales Popover/Tabs/Switch/RadioGroup-Muster
- components/reui/renovation/task-sheet.tsx – Task erstellen und bearbeiten im ReUI-Sheet
- components/reui/renovation/finance-sheet.tsx – Budget, Bestellungen und Eingangsrechnungen
- lib/renovation/plan.ts und finance.ts – Modelle, Terminierung und Beispielwerte
- modules/renovation-demo/gantt-interactions.ts – Validierung der ReUI-Drag/Resize-Vorschläge
- modules/renovation-demo/renovation-planner.tsx – Controller ohne DOM/CSS-Klassen

Die bisherigen Modulpfade sind Re-Exports. Abhängige Nachfolger werden bei Änderungen neu terminiert; Wochenenden und Vorgängerprüfungen bleiben aktiv. Freigabepunkte für Estrich/CM-Messung sind vor direktem Drag geschützt. Der Zustand bleibt eine lokale Demonstration ohne Serverpersistenz.

## Verifikation

Vitest prüft Terminierung, Interaktionen und Architektur. Playwright rendert Gantt, Gantt-Einstellungen, Add-Task-Sheet und die bestehenden Finanz-/CSV-Oberflächen aus GitHub Actions.
