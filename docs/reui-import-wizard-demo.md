# ReUI Nova Default / Import Wizard

This branch moves nextHV from base-maia to base-nova, matching the five
provided ReUI HTML exports for solution-crm-6. Global CSS color tokens use
the supplied Neutral light/dark theme; controls, cards, menus and dialogs are
changed to Nova's denser radii. The registered ReUI namespace continues
to use the project's selected style in components.json.

## Five source-based screens

1. Upload Files: source dropzone, selected Items, Ready badges, target Select,
   and first-row Switch.
2. Map Columns: 8-row Table, required-field Alert, and per-field Base UI Select.
3. Preview Rows: five-row Table with Valid/Warning/Error Badges, statistics,
   and unique-key Select.
4. Duplicate Handling: Base UI RadioGroup with Skip/Update/Create policies.
5. Run Import: Ready Alert and Import plan summary.

The component tree uses existing ReUI Frame, Stepper, Badge and Base UI
Button/Select/Input/Switch, plus reusable Alert, Item, Table, RadioGroup
primitives. It does not transplant Next.js scripts or DOM markup from ReUI.

The initial northstar-contacts.csv and account-logos.png are visual fixtures.
Displayed 1,248-row and quality/duplicate numbers come from the uploaded
HTML and are not measured server results. User-selected CSV files are only
read into a local sample. No files are uploaded, and the final Import button
never changes Laravel data.

Route: /import-wizard-demo, in the authenticated demo navigation.

## Verification

- npm test
- npm run build
- npm run test:e2e
- Compare screenshots at desktop/tablet/mobile widths against the five HTML
  exports and check keyboard operation of Select, RadioGroup and Stepper.

Global Nova changes intentionally affect every page. Run full UI regression
before merging to production; this is not merely a wizard-scoped theme.
