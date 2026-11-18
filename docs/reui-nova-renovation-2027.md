# ReUI Nova adoption & Kernsanierung Wohnung (2027)

## Source and licensing

ReUI source: https://github.com/keenthemes/reui
Registry (Base UI + Nova): https://github.com/keenthemes/reui/tree/main/public/r/styles/base-nova
License: MIT, stored at resources/js/vendor/reui/LICENSE.md.

The installed source-equivalent primitives have local integration-only changes:
the cn import becomes @/lib/utils and ReUI's site-only IconPlaceholder becomes
@/components/reui/icon-placeholder (Lucide symbols). The actual Gantt engine,
timeline, icon-stack, frame, stepper, alert, badge and file-upload hook are
taken from the public Nova registry. They are not hand-painted Gantt bars.

Third-party stock shadcn/Base UI controls that already existed (Select,
Switch, Field, Table, Button, Badge, Avatar, Sheet, Popover, ScrollArea,
DropdownMenu, Spinner, Input) are reused from nextHV's shared UI. Missing
Base UI controls (ContextMenu, AlertDialog, Collapsible, Empty, Toggle and
ToggleGroup) are added from ReUI's public Base UI source with nextHV styling
adapters. Components preserve the Base UI interaction semantics.

This is NOT the proprietary full source for paid ReUI application blocks
(gantt-1, gantt-3, premium CRM wizards). The uploaded gantt-3 HTML serves as
a visual reference, not the editable original JSX. Without screen-by-screen
comparison of a deployed build we cannot claim pixel parity.

## Architecture

- resources/js/components/reui/gantt/ – public ReUI engine with adapted imports.
- resources/js/components/reui/ – ReUI-specific presentational components.
- resources/js/hooks/use-file-upload.ts – original ReUI hook.
- resources/js/components/ui/ – shared Base UI controls.
- resources/js/modules/import-wizard-demo/ – a horizontal Stepper reference
  at /csv-import-nova.
- resources/js/modules/renovation-demo/plan.ts – pure DAG scheduler, no React
  or Laravel data access.
- resources/js/modules/renovation-demo/renovation-planner.tsx – Gantt, Timeline,
  list view, details, filters, state.
- resources/js/modules/renovation-demo/task-editor.tsx – task editor, input,
  predecessor selection, delete guard.
- resources/js/pages/renovation-project-page.tsx – route adapter.

## Renovation fixture

Project starts Monday, **1 March 2027**. All tasks are demonstrations for
one apartment, not engineer-approved work orders. Key phases:

1. Protect workspace, remove wallpaper (2 working days), old floor,
   old screed and debris.
2. Window measuring/order (parallel lead time), installation and sills.
3. Electrical and plumbing rough-in, prepare substrate, insulation.
4. Underfloor heating plus manifold (2 working days), pressure test.
5. New screed, 21 calendar days of assumed cure/lie time.
6. Functional heating, CM moisture test/approval; only then tile/floor.
7. Wall finishing/paint, fixtures, doors, inspection and handover.

The scheduler uses finish-to-start predecessor edges, topological ordering,
weekdays for trade work and calendar days for drying/lead time.
It rejects cycles, invalid durations and missing predecessors. A task editor
changes durations/trades/dependencies and recomputes the whole schedule.
Gantt arrows come from event dependency ids. Events are deliberately read-only
on the Gantt: free drag/resizing without a predecessor ripple would violate
the schedule. Edit through the task detail dialog instead.

### Important trade safety

21 calendar days are NOT a declaration of screed readiness. Follow
manufacturer/system requirements; functional heating and readiness heating
are separate. CM testing and floor fitter approval gate the floor finish.
Real projects must account for holidays, structural/contaminant issues,
permits, moisture, deliveries, access and crew capacity.

Source: Bundesverband Flaechenheizungen und Flaechenkuehlungen e.V.,
https://www.flaechenheizung.de/schnittstellenkoordination/

## Demo isolation

All mutations (add/edit/delete, choosing predecessors, statuses and date
changes) affect local React state only and disappear on reload. The CSV
wizard parses in-browser previews, never transmits an import. No real
nextHV contracts, tenants, units, or other records are read/updated.

## Verification

Run npm ci, npm test, npm run build, npm run test:e2e.
Manually compare ReUI Nova in Chrome/Firefox, mobile widths, dark mode,
keyboard focus, controls, Gantt week/month views and dependency arrows.
