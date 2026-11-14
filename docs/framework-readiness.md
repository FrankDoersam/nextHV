# Framework-Konzept und Refine-Vergleich

Stand: 14.11.2026. Ausgangspunkt: `b57a6e5`. Dieses Dokument unterscheidet vorhandene Funktionen, nachgewiesene Fehler und Freigabekriterien. Es ist keine Zertifizierung der Produktionsreife.

## Ziel und Architekturentscheidung

nextHV bleibt ein Laravel-/React-Framework mit PHP als Quelle für Felder, Validierung, Relationen und fachliche Aktionen. REUI/Base UI bilden die Oberflächen; TanStack Query und Table bleiben Daten- und Tabellenkern. Refine wird nicht zusätzlich installiert. Eine zweite Abstraktionsschicht würde derzeit mehr Pflege als Nutzen bringen.

Abhängigkeiten: `Module → ResourceDefinition → Framework-Hooks → DataProvider → Laravel REST → Actions/Policies/Models`. Komponenten kennen keine konkreten Hausverwaltungsmodelle. Fachliche Regeln und Autorisierung bleiben im Backend. UI-Berechtigungen verbessern Bedienung, schützen aber keine API.

## Vergleich mit Refine v5

| Bereich               | Refine                                                                             | nextHV vor dieser Überarbeitung                                                                    | Entscheidung                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Tabellen              | Headless `useTable`, URL-Zustand, initiale/permanente Filter und Sortierung        | Bereits vorhanden, einschließlich serverseitiger Gruppenmetriken und begrenzter Gesamtauswahl      | Vorhandenen Kern absichern; kein zweites Grid                                                         |
| Datenprovider         | Einheitlicher CRUD-Vertrag, benannte Provider, viele fertige Integrationen         | Benannte Provider vorhanden; einzelne Picker-/Cachepfade noch nicht durchgängig isoliert           | Provider und Antwortprojektion in jedem Lesepfad berücksichtigen                                      |
| Performance           | TanStack Query, anpassbare Abfrageoptionen, deduplizierte Abfragen                 | Gleicher Query-Unterbau; Detail-/Panelabfragen ohne vollständige Abbruchweitergabe                 | AbortSignal durchreichen; alte Antworten bei Kontextwechsel verwerfen                                 |
| Cache nach Mutation   | Zentrale Invalidierung und Mutationshooks                                          | Zeilen-Patch für Tabellen vorhanden; Infinite-Seiten fehlen                                        | Unveränderte Zeilen referenzstabil halten, alle geladenen Listentypen konsistent patchen              |
| Berechtigungen        | Asynchrones `can`, Cache, Gründe, `CanAccess`, UI-Integrationen                    | Synchroner, nicht reaktiver Adapter; direkte Routen/Formlinks nicht zentral abgeschirmt            | Optionalen Adapter erweitern, sichere Lade-/Fehlerzustände und zentrale Zugriffsgrenzen               |
| Formulare             | RHF-Integration, Serverfehler, Dirty-Warnung, Mutationzustände, optional Auto-Save | RHF, Servervalidierung, Wizard, verschachtelte Flows, Dirty-Warnung, Versionsprüfung vorhanden     | Doppelte Übermittlung verhindern; fehlgeschlagenen Folgeschritt von erfolgtem Speichern unterscheiden |
| Komponenten           | Integrationen für mehrere UI-Systeme, headless nutzbar                             | Spezialisierte REUI-Felder, RelationPicker, Repeater, Cards, Tabs, Sheet/Dialog, PDF, Action-Menüs | Bestehende Komponenten härten statt fremde UI parallel einzubauen                                     |
| Realtime              | Austauschbarer Live-Provider, automatische/manuelle Ereignisbehandlung             | Kein durchgängiger Live-Provider                                                                   | Für spätere Mehrbenutzersynchronisierung separater Vertrag; keine simulierte Realtime-Funktion        |
| Audit                 | Provider/Hooks; Refine empfiehlt sicherheitsrelevante Logs im Backend              | Fachliche Aktionen/Versionsprüfung, kein vollständiger revisionssicherer Auditdienst               | Produktionslücke explizit benennen; keine Browserlogs als revisionssicher verkaufen                   |
| Internationalisierung | Eigener i18n-Provider                                                              | Deutsche Geschäftsanwendung und globale Fehlerbeschriftung                                         | Übersetzungsvertrag vor allgemeiner Framework-Paketveröffentlichung                                   |
| Ökosystem             | Adapter, Beispiele, dokumentierte Erweiterungspunkte                               | Anwendungsrepository mit integrierter Framework-Schicht                                            | Stabilen Erweiterungsvertrag dokumentieren; Paketaufteilung erst nach bewiesener Wiederverwendung     |

**Performance-Bewertung:** Aus Bibliotheksnamen lässt sich kein Geschwindigkeitsvorteil ableiten. Beide verwenden TanStack Query. Ein seriöser Vergleich braucht identische Daten, Geräte, API-Latenzen und Messungen. Hier werden nachweisbare unnötige Arbeit und Race Conditions beseitigt, keine erfundenen Prozentwerte behauptet.

## Vor Umsetzung dreifach hinterfragter Plan

### 1. Daten und Tabellen

- Fachlich: Ein Wechsel von Objekt/Provider darf niemals kurz die vorherigen Datensätze als aktuelle Auswahl zeigen.
- Technisch: Cache-Schlüssel müssen Provider, Ressource, Abfrage und Antwortprojektion unterscheiden. Permanente Einschränkungen dürfen nicht durch Placeholder-Daten überbrückt werden. Alte GET-/Suchanfragen müssen abbrechbar sein.
- Bedienung: Beim normalen Seitenwechsel bleiben Zeilen während des Ladens erhalten; bei geändertem fachlichem Kontext erscheint der vorhandene Skeleton. Ein Save aktualisiert die betroffene Zeile auch in Infinite-Listen, ohne alle Listen neu zu laden.

### 2. Berechtigungen

- Fachlich: Die frühere Entscheidung bleibt bestehen: Organisationsgrenzen und aktivierte Rechteprüfung werden nicht heimlich eingeführt.
- Technisch: Der Adapter bleibt standardmäßig aus. Wenn eingeschaltet, unterstützen dieselben UI-Punkte synchrone und asynchrone Entscheidungen. Während Prüfung/Fehler wird kein Zugriff angenommen; Entscheidungen werden pro Datensatz und Sitzung getrennt. Direkte URLs und verschachtelte Formularlinks erhalten eine zentrale Grenze.
- Bedienung: Gründe und Ladezustand sind nachvollziehbar. Navigation, Aktionen und Formulare reagieren auf Änderungen der Konfiguration. Backend-Policies bleiben für jede echte Freigabe erforderlich.

### 3. Formulare und Komponenten

- Fachlich: Ein bereits gespeicherter Vertrag darf nicht nochmals angelegt werden, nur weil danach ein Picker oder Callback fehlschlägt.
- Technisch: Submit bekommt eine synchrone Sperre; Persistieren und Nachverarbeitung werden getrennt. Eine Wiederholung betrifft ausschließlich die Nachverarbeitung. Serverfehler bleiben feldbezogen, Dirty-Daten werden nicht unbemerkt ersetzt.
- Bedienung: „Gespeichert, Folgeschritt fehlgeschlagen“ wird im vorhandenen Fehlerbereich mit Wiederholung/Schließen angeboten. RelationPicker verwendet für Nachladen denselben Provider wie für Suche und Speichern.

## Umfang dieser Umsetzung

1. Alle neun zusätzlichen Remote-Branches entfernen, `main` erhalten. Einmaligen Bereinigungsjob danach entfernen.
2. Abfrageabbruch und Cache-Isolation zentral verbessern, Infinite-Listen in Zeilenaktualisierung aufnehmen.
3. Optionalen Berechtigungsadapter mit asynchronen Entscheidungen, Cache, Sitzungsreset und Routen-/Panelgrenzen ausbauen.
4. Editor vor Doppel-Submit und irreführenden Fehlern nach erfolgreichem Save schützen; RelationPicker durchgängig an den Provider binden.
5. Verhalten mit gezielten Regressionstests, anschließend Build und bestehender CI prüfen. Keine neuen Laufzeitpakete.

## Öffentliche Veröffentlichung: nachvollziehbare Freigabekriterien

| Kriterium                    | Erforderlicher Nachweis                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reproduzierbare Installation | Clean Install, Migration/Seeder, PHP- und Frontendtests, Production Build in CI                                                                                                            |
| CRUD-Zuverlässigkeit         | Validierung, Transaktionen, Konfliktbehandlung, Löschen und gesperrte Relationen getestet                                                                                                  |
| Berechtigungen               | Backend-Policy-Matrix und Organisationsgrenzen implementiert und getestet, bevor Mehrmandantenbetrieb freigegeben wird                                                                     |
| Komponenten                  | Tastaturbedienung, Fokus, Screenreader, Kontrast, iPhone/iPad/Desktop manuell und automatisiert geprüft                                                                                    |
| Performance                  | Reproduzierbare Messung mit großen Datenbeständen; API-p95, Renderzeit, Speicher und SQL-Anzahl dokumentiert                                                                               |
| Betrieb                      | Backup-/Restore-Probe, Monitoring, Fehlerbehandlung, Queue-/Deploymentkonzept                                                                                                              |
| Sicherheit                   | Unabhängige Prüfung insbesondere Identitätsdokumente, Uploads, Auth, Rollen und Datenexport                                                                                                |
| Open Source                  | MIT-Angabe in composer.json durch vollständigen Lizenztext ergänzen und Weiterverteilungsrechte an REUI-Blöcken/Assets klären, Contribution-/Security-Prozess, Versionierung und Changelog |
| Framework-API                | Stabile Adapterverträge, dokumentierte Beispiele, Kompatibilitätspolitik und mindestens ein unabhängiges Folgemodul                                                                        |

Ein grüner Testlauf erfüllt nicht automatisch alle diese Kriterien. Das Repository eignet sich als öffentliches Entwicklungsprojekt; eine allgemeine Produktionsfreigabe oder „best in class“-Behauptung erfordert diese zusätzlichen Nachweise. Premium-REUI-Quellen werden nicht ohne geklärte Weiterverteilungsrechte in ein öffentliches Paket übernommen.

## Primärquellen

- [Refine useTable](https://refine.dev/core/docs/data/hooks/use-table/): Tabellenzustand, Pagination, Filter, Query-Optionen.
- [Refine Data Provider](https://refine.dev/core/docs/data/data-provider/): CRUD-Vertrag und mehrere Provider.
- [Refine Access Control](https://refine.dev/core/docs/authorization/access-control-provider/): asynchrone Entscheidung, Cache, Gründe und notwendige Route-Grenzen.
- [Refine RHF useForm](https://refine.dev/core/docs/packages/react-hook-form/use-form/): Servervalidierung, Dirty-Warnung, Mutationzustände und optionaler Auto-Save.
- [Refine Live Provider](https://refine.dev/core/docs/realtime/live-provider/): Subscription-/Publish-Vertrag.
- [Refine Audit Log Provider](https://refine.dev/core/docs/audit-logs/audit-log-provider/): Audit-Schnittstellen und Empfehlung serverseitiger Logs.

Keine Refine-Quelltexte kopiert; die Vergleiche beschreiben Konzepte. Quellen abgerufen am 14.11.2026.

## Implementierter Stand

Die oben priorisierten Korrekturen wurden im bestehenden Framework umgesetzt. Details und Einrichtungsbeispiele stehen in [Abschnitt 39 des Entwicklerhandbuchs](framework.md#39-verlässliche-abfragen-berechtigungen-und-formularabschluss). Zusätzlich verhindert der AuthProvider, dass eine verspätete Identitätsantwort eine bereits abgelaufene Sitzung wiederherstellt. Es wurden keine neuen Laufzeitabhängigkeiten hinzugefügt.

Der Build meldet weiterhin einen großen Entry-Chunk (rund 540 kB minifiziert). Das ist ein offener Mess- und Optimierungspunkt, kein durch Verschieben einer Warnschwelle gelöstes Performanceproblem. Ebenso ersetzen bestehende Screenshot-/Browsertests keine vollständige WCAG-Prüfung und keine Lasttests auf echten Mobilgeräten.
