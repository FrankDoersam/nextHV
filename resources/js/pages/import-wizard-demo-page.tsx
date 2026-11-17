import { PageHeader } from "@/components/blocks/layout";
import { ImportWizardDemo } from "@/modules/import-wizard-demo/import-wizard";

export default function ImportWizardDemoPage() {
    return (
        <div data-slot="import-wizard-demo-page" className="flex min-w-0 flex-col gap-5">
            <PageHeader
                title="ReUI Import Wizard"
                description="Component-Demo nach dem bereitgestellten HTML · Frame, Stepper und Base UI."
            />
            <p className="mx-auto w-full max-w-3xl text-sm text-muted-foreground">
                Isolierte Design-Demo mit Beispiel-Daten. CSV wird nur lokal als Vorschau gelesen;
                Excel, PDF und Bilder werden nicht verarbeitet. Keine Datei wird hochgeladen,
                keine bestehenden Import-Endpunkte oder Datensätze werden verändert.
            </p>
            <ImportWizardDemo />
        </div>
    );
}
