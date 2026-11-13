import {
    DetailList,
    DynamicList,
    ListRow,
    SectionCard,
    WelcomeBanner,
} from "@/components/blocks/content";
import { PageHeader, Split, Stack } from "@/components/blocks/layout";
import { Button } from "@/components/ui/button";
import { useOverview } from "@/framework/data/hooks";
import { ResourceCollection } from "@/framework/tables/resource-collection";
import { useWorkbench } from "@/framework/workbench";
import { OverviewMetrics } from "@/modules/properties/property-overview";
import { properties } from "@/modules/registry";
import { ArrowRight, Plus } from "lucide-react";
import { useNavigate } from "react-router";
export default function DashboardPage() {
    const navigate = useNavigate();
    const workbench = useWorkbench();
    const metrics = useOverview();
    return (
        <Stack>
            <PageHeader
                eyebrow="Dein Portfolio"
                title="Ein klarer Blick auf deine Immobilien."
                description="Was läuft, was ansteht und wo du als Nächstes ansetzen kannst."
                actions={
                    <Button
                        onClick={() =>
                            workbench.openForm({
                                resource: properties,
                                mode: "create",
                                wizard: true,
                            })
                        }
                    >
                        <Plus />
                        Objekt anlegen
                    </Button>
                }
            />
            <OverviewMetrics />
            <WelcomeBanner
                title="Zusammenhänge statt einzelner Datensätze."
                description="Objekte, Einheiten, Geschäftspartner und Verträge greifen ineinander. Neue Konditionen ergänzen die Historie, ohne bisherige Vereinbarungen zu überschreiben."
                action={
                    <Button
                        variant="outline"
                        onClick={() => navigate("/contracts")}
                    >
                        Verträge öffnen
                        <ArrowRight />
                    </Button>
                }
            />
            <Split
                main={
                    <SectionCard
                        title="Deine Objekte"
                        description="Portfolio verwalten und direkt in die Objektdetails einsteigen."
                    >
                        <ResourceCollection resource={properties} compact />
                    </SectionCard>
                }
                aside={
                    <Stack>
                        <SectionCard title="Heute im Blick">
                            <DetailList
                                items={[
                                    {
                                        label: "Objekte",
                                        value:
                                            metrics.data?.data.properties ??
                                            "—",
                                    },
                                    {
                                        label: "Einheiten ohne laufenden Vertrag",
                                        value: metrics.data?.data.vacant ?? "—",
                                    },
                                    {
                                        label: "Instandhaltung",
                                        value:
                                            metrics.data?.data.maintenance ??
                                            "—",
                                    },
                                    {
                                        label: "Objektprüfungen dieses Jahr",
                                        value:
                                            metrics.data?.data
                                                .inspections_this_year ?? "—",
                                    },
                                    {
                                        label: "Überfällige Prüfungen",
                                        value:
                                            metrics.data?.data
                                                .overdue_inspections ?? "—",
                                    },
                                ]}
                            />
                        </SectionCard>
                        <SectionCard title="Schnellzugriff">
                            <DynamicList
                                items={[
                                    {
                                        id: "business-partners",
                                        title: "Geschäftspartner",
                                        description:
                                            "Mieter, Eigentümer und Dienstleister",
                                    },
                                    {
                                        id: "contracts",
                                        title: "Verträge",
                                        description:
                                            "Laufzeiten, Beteiligte und Konditionen",
                                    },
                                    {
                                        id: "termination-notices",
                                        title: "Kündigungen",
                                        description:
                                            "Eingänge und bestätigte Termine",
                                    },
                                ]}
                                searchText={(r) => r.title}
                                getKey={(r) => r.id}
                                renderItem={(r) => (
                                    <ListRow
                                        title={r.title}
                                        description={r.description}
                                        onClick={() => navigate("/" + r.id)}
                                        trailing={<ArrowRight size={15} />}
                                    />
                                )}
                            />
                        </SectionCard>
                    </Stack>
                }
            />
        </Stack>
    );
}
