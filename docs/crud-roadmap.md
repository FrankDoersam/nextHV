# Nächste sinnvolle Core-/UI-Funktionen (Ideenschmiede)

## Priorität 1: Berechtigungen und sichtbare Ablehnungsgründe

**Core:** `can(action, record)` mit Policy-Checks und optionalen Gründen,
`canDelete` inklusive deklarativer DeleteFilter; Autorisierung bei jeder
Mutation und Action, auch Bulk und Relation-Klonen. Multi-Tenancy / Row Scoping
muss vor einem produktiven Mehrnutzerbetrieb geklärt werden.

**UI:** Aktionen ausgegraut mit Begründung oder ausgeblendet; bei
Statusabhängigkeit nach jeder Mutation aktualisieren. Eine UI-Vorschau darf
nicht als serverseitige Berechtigungskontrolle missverstanden werden.

## Priorität 2: Transparente Aktionen und Resultate

**Core:** Einheitlicher Action-Response-Vertrag (Meldung, strukturierter
Datensatz, optionale Navigation), bestätigungsfähige Actions,
idempotente Mutationen und bei Bulkoperationen explizite Policy
„alles oder nichts“ vs. „teilweiser Erfolg“.

**UI:** Fortschritt, Ladezustand, verständliche Fehler, Ergebnisansicht
mit Datensatzlink; nach serverseitiger Mutation Listen/Details
invalidieren; bei Bulk-Actions Auswirkungen vorher anzeigen.

## Priorität 3: Audit und Wiederherstellung

**Core:** Revisionsprotokoll inkl. actor/old/new und Domain-Events,
Soft-Delete-Restore/Papierkorb, Datenschutzregeln für Dokumente,
Ansprechpartnerdaten und verschlüsselte Felder; atomare Datenbanktransaktionen.

**UI:** Änderungshistorie je Datensatz, „Wiederherstellen“, optionale
Kommentierung von sensiblen Änderungen, Anzeige „zuletzt geändert von“.

## Priorität 4: Durchgängige Schema-Metadaten

**Core:** Für Feldtypen, Schreib-/Leserechte, berechnete Werte, Default,
Validierungsregeln und bedingte Sichtbarkeit konsistente
maschinenlesbare Definitionen. Keine dynamischen PHP-Closures im JSON.

**UI:** Aus einem beschreibenden Schema generierte Forms, Infolists,
Suchfelder, relationale Picker und Clone-Optionen. Individuelle Layouts
bleiben als Ergänzung verfügbar.

## Später: Import/Export, Async Actions und Workflow

CSV-Import mit Validierung/Vorschau, Hintergrundjobs mit Jobstatus,
Export mit Feldberechtigung, Optimistic-Locking bei Bulk, nachvollziehbare
State-Machine (Entwurf → aktiv → beendet) mit versionierten Konditionen.

**Bewusst nicht automatisch:** Komplexe rechtliche Fristen,
vertragsabhängige Klonbeziehungen oder fachlich nicht deklarierte
Löschbedingungen. Dafür benötigt das Modell eigene Domain-Actions.
