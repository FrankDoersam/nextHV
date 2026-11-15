# Lazy-first UI: PDF, Auswahl und Tabellen

## Architekturentscheidung

Die Liste der Objekte, Einheiten, Verträge und anderer Ressourcen enthält keine
Collection-KPI-Bar oder Collection-Ansichts-Tabs mehr. Dadurch entfallen deren
zusätzliche Metrik- und View-Count-Abfragen beim Seitenaufbau. Die eine sichtbare
Tabelle lädt weiterhin erst beim Aufruf ihrer Seite. Bei Detailansichten werden
Relationen erst beim Aufrufen ihres Tabs gemountet. Die bereits vorhandenen
Sidebar-Badges dürfen weiterhin **ausschließlich Counts** abrufen.

## PDF

Der Bericht öffnet sofort ein Sheet (auch während des dynamischen Code-Imports).
Die Report-Action ist abbrechbar; das heruntergeladene PDF wird nicht in einem
globalen Cache gehalten. PDF.js- und Canvas-Code werden bereits beim Öffnen
der Vorschau geladen, während der Backend-Bericht vorbereitet bzw. die PDF
übertragen wird. Der geschützte Fetch verwendet weiterhin Same-Origin,
Authentifizierung, `no-store`, MIME-Prüfung und Abbruch bei Schließen.
Bei bekanntem `Content-Length` wird ein nativer Stream mit gedrosselter
Fortschrittsanzeige verwendet; ohne Größenangabe gibt es einen neutralen
Ladezustand. Vorschau und Download verwenden denselben Blob, der nach
Schließen freigegeben wird. Es findet kein zweiter PDF-Fetch statt.

## Selects und Relationen

Die gespeicherte Auswahl ist von der Such-Eingabe getrennt. Fokus,
Öffnen, Escape und Suchtext-Löschen dürfen den Wert nicht verändern;
Änderungen erfolgen durch explizite Auswahl oder den klar beschrifteten
Löschen-Button. Statische Auswahlfelder filtern nur nach **eingegebenem
Suchtext**, nicht nach ihrer gespeicherten Beschriftung. Relationen laden
nur die gespeicherten IDs zur Anzeige und holen die begrenzte Trefferliste
(25 Elemente) erst beim Öffnen, mit 250-ms-Debounce und Abbruchsignal.

## Orientierung

- Filament: deferred filter/form updates und lazy Komponenten statt unnötiger
  Server-Roundtrips: https://filamentphp.com/docs/5.x/forms/overview
- Refine `useSelect`: `defaultValue` sorgt für Hydration außerhalb des
  Suchfensters; `debounce` und `queryOptions` trennen Suche und Anzeige:
  https://refine.dev/core/docs/data/hooks/use-select/
- Base UI: kontrollierter ausgewählter `value` und unabhängiger
  `inputValue`: https://base-ui.com/react/components/combobox
- TanStack Query: bedingte Abfragen und konsistente AbortSignals:
  https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation

Filament oder Refine werden **nicht** als zweite UI-Bibliothek installiert;
die Muster werden in den vorhandenen nextHV-Stack integriert.
