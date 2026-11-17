# ReUI Import Wizard HTML reconstruction

The uploaded ReUI preview HTML displays the **first** screen of a five-step CRM
import wizard. This is a standalone **UI demonstration**, not a replacement for
the production CSV import in nextHV.

## Source analysis and component boundaries

| HTML marker/content | nextHV component | Existing primitive |
| --- | --- | --- |
| frame, header, metadata, Contacts badge | ImportWizardDemo | REUI Frame / Badge |
| five step labels and state | ImportWizardDemo | REUI Stepper |
| dashed button/dropzone | ImportFileDropzone | Base UI Button |
| selected file list, Ready badge, delete action | SelectedImportFiles | Badge / Button |
| target combobox | ImportUploadStep | Base UI Select |
| header switch | ImportUploadStep | Base UI Switch |
| Map Columns / Preview / Duplicates / Summary | steps.tsx | Select, Switch, Badge, native table |
| frame footer / Previous / Next | ImportWizardDemo | FrameFooter / Button |

The captured HTML only contains real markup for **Upload**. The other
four screens are independently implemented demo panels based solely on the
visible step titles; they are not represented as recovered proprietary source.

## Usage

Authenticated route: **/import-wizard-demo**, also linked in the sidebar as Demo.

The page starts with screenshot-like sample files
(northstar-contacts.csv, account-logos.png). You can remove them or pick
real local files. CSV is parsed in the browser for a limited preview.
XLS/XLSX, PDF and images may be attached, but the demo does not parse them.
No selected file is transmitted to the server.

Next / Back, column mapping, header toggle, duplicate-preview option and
local completion status are interactive. There is **no server validation,
persistent import, full-file duplicate detection, or production XLSX parser**.
The existing CSV import workflow remains the supported way to import real
nextHV resource records; this demo deliberately does not call its API.

## Testing

Run:

- npm test
- npm run build
- npm run test:e2e

In particular, manual QA should cover drag-and-drop, different CSV separators,
screen widths and keyboard access to the Stepper / Select / Switch controls.
