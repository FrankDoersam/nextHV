# CRM-6 Wizard – zentrale ReUI-Komponenten

## Architektur

Beide CSV-Import-Demoseiten verwenden dieselben zentralen ReUI-Nova-Komponenten.

| Verantwortung | Speicherort |
| --- | --- |
| Frame, Stepper, Line-Tabs, Wizard-Header und -Footer | `resources/js/components/reui/crm-import/wizard-shell.tsx` |
| Dropzone, Dateiliste, FieldGroup und Switch | `resources/js/components/reui/crm-import/upload-step.tsx` |
| Select mit Subtext | `resources/js/components/reui/crm-import/import-target-select.tsx` |
| Spaltenzuordnung, Preview, Duplicate-Karten, Importplan | `resources/js/components/reui/crm-import/steps.tsx` |
| Tabs-Navigation und Badges | `resources/js/components/reui/crm-import/wizard-tabs.tsx` |
| CSV-Modell, Parser und Beispieldaten | `resources/js/lib/crm-import/model.ts` |
| Zustand, Navigation, Ereignisbehandlung (ohne Styling/DOM) | `resources/js/modules/import-wizard-demo/{original-wizard,import-wizard}.tsx` |

Die bisherigen Modulpfade `upload-step.tsx`, `steps.tsx`, `import-target-select.tsx`, `wizard-tabs.tsx` und `model.ts` sind ausschließlich Kompatibilitäts-Exporte. Die zentralen Komponenten importieren keine Dateien aus dem Wizard-Modul.

## Nachweis

- `resources/js/modules/import-wizard-demo/architecture.test.ts` prüft die Architekturgrenzen.
- `resources/js/modules/import-wizard-demo/original-wizard.test.tsx` prüft die fünf Schritte.
- `tests/e2e/reui-demo-screenshots.spec.ts` prüft die Browserdarstellung und exportiert `csv-import-tab-1-upload.png`.

Die Beispielimporte sind rein lokal. Für echten Importbetrieb sind Persistenz und serverseitige Berechtigungen weiterhin erforderlich.
