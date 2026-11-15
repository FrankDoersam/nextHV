# Framework-Ausbau: Konzept und Freigabekriterien

Stand: 15.11.2026. Fortsetzung des [Refine-Vergleichs](framework-readiness.md). Keine Live-Schnittstelle. Jeder Funktionsbereich erhält einen eigenen Commit; der gemeinsam genutzte Formular-/Datenkern wird vorab separat abgesichert.

## Dreifache Prüfung des Konzepts

| Feature                | Fachlicher Ablauf                                                                                   | Architektur und Grenzen                                                                                                                                                          | Bedienung und Fehlerfälle                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| i18n                   | Locale wechseln, fachliche Begriffe erhalten, fehlende Übersetzung auf Standardsprache zurückführen | Austauschbarer Provider, keine Pflichtbibliothek; Übersetzungen und Zahlen-/Datumsformate zentral; Serverfehler bleiben Serververantwortung                                      | Keine technischen Übersetzungsschlüssel anzeigen; Interpolation als React-Text; Sprache persistent, Bedienung per Tastatur                      |
| Globale Datensatzsuche | Objekte, Einheiten, Partner und Verträge wirklich durchsuchen, gruppierte Treffer direkt öffnen     | Nur ausdrücklich aktivierte Ressourcen/Felder; dieselben nativen Such- und Policy-Grenzen; kurze Queries, begrenzte Treffer, keine Ausweis-/Kontodaten                           | Zentraler Dialog aus AppShell; Debounce, Abbruch, Lade-/Leer-/Fehlerzustand; keine Navigationstitel-Suche als Datensatzsuche verkaufen          |
| Audit-Timeline         | Erstellung und Änderungen mit Zeitpunkt, Akteur und verständlichen Änderungen nachvollziehen        | Serverseitige Erfassung in derselben Transaktion, explizite Feldfreigabe, keine Geheimnisse; lesender Endpoint mit View-Policy                                                   | Wiederverwendbare paginierte Timeline pro freigegebenem Modell; alte Datensätze haben keine rückwirkend erfundene Historie                      |
| CSV-Import             | Datei wählen → Spalten zuordnen → Relationen eindeutig auflösen → Vorschau/Fehler → bestätigen      | Opt-in pro Ressource, dieselben REST-Regeln/Observer/Policies; begrenzte Dateigröße/Zeilen, kein beliebiges Mass Assignment; atomarer Import, keine Duplikate durch Wiederholung | Gemeinsamer Dialog je Tabelle, deutsche Feldnamen, Relationstitel in Vorschau; fehlende/mehrdeutige Bezüge blockieren, Vorschau schreibt nichts |
| PDF-Vorschau           | Objektaktion öffnet geschützten Bericht im Sheet                                                    | s4v2 als Architekturvorbild: Action → Berichtsdaten → Renderer → gemeinsame Vorschau; vorhandenen Renderer und geschützte URL nutzen                                             | Einheitlicher Header, klarer Dateiname, Download/Öffnen, Lade-/Fehlerzustände, responsive Fläche; keine zusätzliche PDF-Bibliothek              |

## Bewertung gegenüber Refine

Refine bietet weiterhin mehr fertige Provider-, Auth- und UI-Integrationen, optimistische/undoable Mutationen, Import/Export-Hooks, Übersetzungs- und Audit-Verträge. nextHV hat bereits PHP-Metadaten, Servervalidierung, verschachtelte Formularabläufe, Relation-Repeater, REST-Aktionen, gezielte Zeilenpatches, direkte Formularlinks, permanente Filter, Gruppenmetriken und einen optionalen Rechteadapter. Das ist kein belegter Geschwindigkeitsvorteil; Performance muss mit gleicher Datenmenge gemessen werden.

Optimistische Vertrags-/Konditionsänderungen und Auto-Save werden nicht pauschal eingeschaltet: bestehende Transaktions-, Versions- und Bestätigungsregeln bleiben maßgeblich. Live ist ausdrücklich ausgeschlossen. Externe Auth-Adapter, ein allgemeines Audit-Backend mit Unveränderbarkeitsgarantie, globale Mandantentrennung und vollständige Übersetzungen aller Fachmodule sind separate Fähigkeiten, keine automatisch durch einen UI-Provider erfüllten Versprechen.

## Nachweise

Pro Feature: fokussierte Tests für den Erfolgsweg und relevante Fehler-/Autorisierungsfälle; TypeScript und Build bei Frontendänderungen; PHP-Tests und Formatierung bei Backendänderungen. Abschließend bestehende Gesamtsuite und Browserprüfung. Dokumentation und Aktivierungsbeispiele werden im jeweiligen Feature-Commit ergänzt.

## Umsetzung und Betrieb

Alle fünf Erweiterungen sind separat committet und im [Framework-Handbuch, Abschnitte 41–45](framework.md), mit Aktivierung, Beispielen und Grenzen dokumentiert. Capability-Interfaces trennen Resource-Suche/Import von Model-Audit; die frühere `config/resource_features.php` wurde entfernt; PHP-REST-Felder bleiben die Quelle für fachliche Validierung. Das Audit-Protokoll und die kurzlebigen Importvorschauen benötigen die neuen Migrationen (`php artisan migrate --force`). Für die tägliche Bereinigung verschlüsselter Importvorschauen muss der Laravel-Scheduler betrieben werden.

Der automatisierte Browserpfad prüft die echte globale Suche, Audit-Tab, geschützte PDF-Action und einen CSV-Import mit aufgelöstem Objektbezug zusammen. Zusätzliche Tests prüfen Locale-Wechsel mit ungespeicherten Formularen, transaktionalen Audit-Rollback, Importfehler und Wiederholungen. Die ursprünglichen Freigabekriterien bleiben bestehen; die neuen Features sind keine pauschale Produktionszertifizierung.

## Modell-Konfiguration und Import: erneute Prüfung

| Perspektive              | Schwäche der bisherigen Lösung                                                                     | Umsetzung                                                                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modulentwicklung         | Parallele Feature-Liste neben Model/REST, feste React-Labels für Relationsmerkmale                 | Unveränderliche Capability-Definitionen an Model und Resource; Discovery aus REST-Routen; Typen, Regeln, Enums, Fremdschlüssel und Zielressourcen aus bestehenden Deklarationen             |
| Daten und Berechtigungen | Ungeprüfte Relationskonfiguration, Picker-Filter beim Import nicht übernommen, unklare Enum-Fehler | `framework:check`, explizite Importfreigabe, Prüfung auf versteckte/readonly Felder, gefilterte Relationsauflösung und erneute Prüfung bei Commit, ausschließlich angebotene Enum-Werte |
| Bedienung                | Zu wenig Orientierung zu Format/Pflichtfeldern und kaum Hilfe bei fremden Enum-Bezeichnungen       | Gemeinsamer REUI-Stepper, CSV-Vorlage, Schemahilfe, serverseitige Alias-Zuordnung, Enum-Wertzuordnung, lesbare Vorschau mit Fehlerfilter, stabile Vor-/Zurück-Schritte                  |

Die Suchfelder bleiben in der REST-Ressource (`searchable`/`searchableRelations`), um keine zweite Suchdefinition zu pflegen. Die Resource aktiviert die globale Suche und bestimmt Titel, Unterzeile, Limit und Reihenfolge. Audit definiert erlaubte gespeicherte Felder und Ereignisse; Akteur/Zeitpunkt sind automatisch. Import bleibt atomare Neuanlage bis 100 Zeilen, ohne stille Upserts oder automatische Anlage fehlender Beziehungen.


## Capability-Architektur: fünf Gegenprüfungen

| Prüfung | Verworfenes Problem | Entscheidung / Nachweis |
| --- | --- | --- |
| 1. Zuständigkeit | Ein Model-Sammelbuilder verbindet HTTP-/UI-Verhalten mit Datenhistorie | Kleine `HasGlobalSearch`-/`HasCsvImport`-Interfaces an REST-Resources; `HasAuditTrail` am Model. Audit funktioniert ohne registrierte Route. |
| 2. Erweiterung | Fester zentraler Model-Katalog oder stumme Override-Reihenfolge | REST-Discovery plus optionaler Laravel-Container-Tag; doppelte Identitäten mit verschiedenen Klassen sind Fehler; Bindings sind der explizite Austauschpunkt. |
| 3. Dynamik | Benutzerabhängige Entscheidungen im strukturellen Cache | Getrennter `HasFeatureAvailability`-Hook mit aktuellem Kontext; Tests wechseln Akteur und sperren einen Import zwischen Vorschau und Commit. |
| 4. Performance | Jede Model-Änderung kompiliert sämtliche Ressourcen | Audit liest direkt die Model-Definition. Registry ist scoped, strukturelle Kompilierung einmal pro Klasse, Suchkatalog filtert vor Kompilierung. Tests sichern diese Arbeitseinsparungen; kein pauschaler Laufzeitvorsprung behauptet. |
| 5. Migration und Betrieb | Zwei konkurrierende Konfigurations-APIs oder verlorene Historien | Vollständige Migration der bestehenden Module, stabile Audit-Streams und gleiche React-Metadaten; `framework:check` validiert auch ausgeblendete Fähigkeiten. |

Abgleich am 15.11.2026 mit offiziellen Dokumentationen:

- [Refine: Resource-Registrierung, Identifier, Meta und Provider](https://refine.dev/core/docs/core/refine-component/): Resource-Identität und austauschbare Dienste gehören in die Anwendungsschicht. nextHV nutzt seine bestehende REST-Resource als Quelle, ohne eine zweite vollständige Frontend-Konfiguration einzuführen.
- [Filament: Resources](https://filamentphp.com/docs/5.x/resources/overview): Form-/Tabellen-/Suchkonfiguration ist vom Eloquent-Model getrennt. Dieses Prinzip wird auf die bestehenden PHP-Resources übertragen.
- [Filament: Importer](https://filamentphp.com/docs/5.x/actions/import): komplexe Imports lassen sich in eigene Klassen auslagern. nextHV erlaubt diese Delegation über den Laravel-Container, behält für einfache Importe eine kompakte Definition und leitet Regeln/Enums/Relationen aus dem REST-Schema ab.

Das ist ein dokumentationsbasierter Architekturabgleich, keine Begutachtung oder Freigabe durch die Refine-/Filament-Maintainer. Hintergrundimporte, Upsert, weitere Persistenz-/Audit-Provider und beliebige zusätzliche Capability-Typen sind damit nicht automatisch implementiert. Neue Fähigkeiten erhalten einen expliziten Contract und einen tatsächlichen Consumer, statt beliebiger ungenutzter Meta-Schlüssel.
