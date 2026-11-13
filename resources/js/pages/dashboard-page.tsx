import { useState } from "react";
import { useNavigate } from "react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Stack } from "@/components/blocks/layout";
import { LazyTabs } from "@/components/blocks/lazy-tabs";
import { SectionCard } from "@/components/blocks/content";
import { WorkspaceColumns } from "@/components/blocks/workspace-card";
import {
    AgendaCard,
    DashboardControls,
    DashboardMetric,
    PreviewNotice,
    RevenueCard,
} from "@/components/blocks/dashboard-blocks";
import { ResourceCollection } from "@/framework/tables/resource-collection";
import { useWorkbench } from "@/framework/workbench";
import { useAuth } from "@/framework/auth";
import { OverviewMetrics } from "@/modules/properties/property-overview";
import { properties } from "@/modules/registry";
import {
    monthlyPreview,
    agendaPreview,
} from "@/modules/dashboard/preview-data";
import { money } from "@/lib/format";
export default function DashboardPage() {
    const navigate = useNavigate();
    const workbench = useWorkbench();
    const { user } = useAuth();
    const [period, setPeriod] = useState("month");
    const [widgets, setWidgets] = useState<Record<string, boolean>>({
        Finanzen: true,
        Tagesplan: true,
        Kennzahlen: true,
    });
    return (
        <Stack>
            <PageHeader
                title={`Willkommen, ${user?.name.split(" ")[0] ?? "zurück"}.`}
                description="Dein Bestand, deine Menschen und das, was heute zählt."
                actions={
                    <>
                        <DashboardControls
                            period={period}
                            onPeriod={setPeriod}
                            widgets={widgets}
                            onWidget={(key, value) =>
                                setWidgets((w) => ({ ...w, [key]: value }))
                            }
                        />
                        <Button
                            onClick={() =>
                                workbench.openForm({
                                    resource: properties,
                                    mode: "create",
                                    wizard: true,
                                })
                            }
                        >
                            <Plus /> Objekt anlegen
                        </Button>
                    </>
                }
            />
            <LazyTabs
                urlKey="dashboard"
                tabs={[
                    {
                        id: "overview",
                        label: "Übersicht",
                        render: () => (
                            <Stack>
                                <PreviewNotice />
                                <WorkspaceColumns>
                                    {widgets.Finanzen && (
                                        <RevenueCard
                                            bars={monthlyPreview}
                                            period={period}
                                            onOpen={() =>
                                                navigate("/contracts")
                                            }
                                        />
                                    )}
                                    {widgets.Tagesplan && (
                                        <AgendaCard
                                            entries={agendaPreview}
                                            onOpen={() =>
                                                navigate("/properties")
                                            }
                                        />
                                    )}
                                </WorkspaceColumns>
                                {widgets.Kennzahlen && (
                                    <WorkspaceColumns variant="metrics">
                                        <DashboardMetric
                                            title="Offene Forderungen"
                                            value="8.250 €"
                                            change="6 Vorgänge · 2 überfällig · Beispiel"
                                            footer="Zahlungsübersicht · Vorschau"
                                            bars={monthlyPreview.map((d) => ({
                                                ...d,
                                                value: Math.round(d.value / 7),
                                            }))}
                                            formatValue={money}
                                        />
                                        <DashboardMetric
                                            title="Vermietungsquote"
                                            value="92 %"
                                            change="46 von 50 Einheiten · Beispiel"
                                            footer="Belegung · Vorschau"
                                            bars={monthlyPreview.map(
                                                (d, i) => ({
                                                    ...d,
                                                    value: 80 + i,
                                                }),
                                            )}
                                            formatValue={(v) => `${v} %`}
                                        />
                                        <DashboardMetric
                                            title="Instandhaltung"
                                            value="12"
                                            change="Offene Vorgänge · Beispiel"
                                            footer="4 in Bearbeitung · Vorschau"
                                            bars={monthlyPreview.map(
                                                (d, i) => ({
                                                    ...d,
                                                    value: 2 + i,
                                                }),
                                            )}
                                        />
                                        <DashboardMetric
                                            title="Liquidität"
                                            value="214.380 €"
                                            change="Verfügbare Mittel · Beispiel"
                                            footer="Kontenübersicht · Vorschau"
                                            bars={monthlyPreview.map((d) => ({
                                                ...d,
                                                value: d.value * 4,
                                            }))}
                                            formatValue={money}
                                        />
                                    </WorkspaceColumns>
                                )}
                            </Stack>
                        ),
                    },
                    {
                        id: "portfolio",
                        label: "Bestand",
                        render: () => (
                            <Stack>
                                <OverviewMetrics />
                                <SectionCard
                                    title="Objekte im Bestand"
                                    description="Aktuelle Daten aus deiner Verwaltung"
                                >
                                    <ResourceCollection
                                        resource={properties}
                                        compact
                                        rowSelection={false}
                                        exportable={false}
                                    />
                                </SectionCard>
                            </Stack>
                        ),
                    },
                ]}
            />
        </Stack>
    );
}
