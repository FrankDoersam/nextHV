import { ReuiOriginalImportWizard } from "@/modules/import-wizard-demo/original-wizard";

export default function ReuiCsvImportPage() {
    return <section data-slot="reui-csv-import-reference" className="mx-auto flex w-full min-w-0 flex-col items-center py-4 sm:px-6 lg:px-10">
        <ReuiOriginalImportWizard />
    </section>;
}
