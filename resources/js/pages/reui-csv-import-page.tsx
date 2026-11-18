import { ReuiOriginalImportWizard } from "@/modules/import-wizard-demo/original-wizard";

export default function ReuiCsvImportPage() {
    return <section data-slot="reui-csv-import-reference" className="flex min-h-svh w-full items-start justify-center bg-background p-4 text-foreground sm:p-6 lg:p-10">
        <ReuiOriginalImportWizard />
    </section>;
}
