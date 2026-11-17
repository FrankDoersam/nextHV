# ReUI CRM Data Grid demo

This is a new authenticated demonstration page at /reui-grid-demo with
84 deterministic fake CRM contacts (@example.test). It intentionally
does not read, mutate, or reuse the real nextHV business-partner data.

## Component composition

| Responsibility | Component | Core primitive |
| --- | --- | --- |
| Page and navigation | ReuiGridDemoPage | Existing PageHeader + application router |
| Heading and content shell | ReuiContactsDemo | ReUI Frame / FrameHeader / FramePanel |
| Table | ReuiContactsDemo | ReUI DataGrid + DataGridTable |
| Sort, pin, resize, move | ReuiContactsDemo | ReUI DataGridColumnHeader |
| Facet filters | ReuiContactsDemo | ReUI DataGridColumnFilter |
| Column visibility | ReuiContactsDemo | ReUI DataGridColumnVisibility |
| Page size and pagination | ReuiContactsDemo | ReUI DataGridPagination |
| Selection | ReuiContactsDemo | ReUI DataGridTableRowSelect + SelectAll |
| Row menu | ContactRowActions | Base UI DropdownMenu + Button |
| Add/edit form | ContactEditor | Base UI Dialog / Input / Select |
| Delete confirmation | DemoDeleteConfirmation | Base UI Dialog |

The UI is composed from already installed primitives rather than copying
rendered HTML. Filtering, sorting, paging, row editing, duplicates,
archiving, bulk actions, resetting, and CSV export operate only on
local React state. The row-selection control selects the current page;
selection may persist while paging until filters or search change.
The CSV export protects spreadsheet formula prefixes.

The previous HTML capture only contained the Upload step of a CSV
wizard; this CRM grid is an additional independent demo, not an
unverified reconstruction of unseen HTML.

## Verify

- npm test
- npm run build
- npm run test:e2e
- Open /reui-grid-demo authenticated and test keyboard menu, selection,
  hidden columns, filter reset, pagination, editor/dialog and CSV export.

Nothing here is production import functionality, and no new API endpoint,
database migration, library or external service is required.
