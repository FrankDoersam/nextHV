import { ImportWizardDemo } from "@/modules/import-wizard-demo/import-wizard";

/** Render the ReUI block as its own preview, without the nextHV page header. */
export default function ImportWizardDemoPage() {
    return (
        <div data-slot="import-wizard-demo-page" className="mx-auto flex w-full min-w-0 flex-col items-center justify-start gap-3 bg-background px-1 py-4 text-foreground sm:px-6 lg:px-10">
            <ImportWizardDemo />
            <p className="w-full max-w-3xl text-xs text-muted-foreground">
                ReUI Nova UI demo · Local CSV preview only. Import is simulated;
                no data is uploaded or written to nextHV.
            </p>
        </div>
    );
}
