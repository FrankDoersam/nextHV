import { PageHeader } from "@/components/blocks/layout";
import { ReuiContactsDemo } from "@/modules/reui-grid-demo/contacts-grid";

/** Authenticated design playground; intentionally no Laravel CRUD integration. */
export default function ReuiGridDemoPage() {
    return (
        <section data-slot="reui-grid-demo-page" className="flex min-w-0 flex-col gap-5">
            <PageHeader
                eyebrow="ReUI · Base UI · Demo"
                title="CRM Data Grid"
                description="Demo-Tabelle mit Suche, Facettenfiltern, Sortierung, Spalten, Auswahl und Aktionen."
            />
            <ReuiContactsDemo />
        </section>
    );
}
