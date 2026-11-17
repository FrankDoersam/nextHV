import { ReuiOriginalImportWizard } from "@/modules/import-wizard-demo/original-wizard";

/** Separate ReUI Stepper reference; the line-tabs demo remains unchanged. */
export default function ReuiCsvImportPage() {
    return <section data-slot="reui-csv-import-reference" className="mx-auto flex w-full min-w-0 flex-col items-center gap-4 py-4 sm:px-6 lg:px-10">
        <ReuiOriginalImportWizard />
        <p className="w-full max-w-3xl text-xs text-muted-foreground">
            ReUI Nova / Base UI · Lokale CSV-Demo, keine Übertragung und keine Datenbankänderung.
        </p>
    </section>;
}
