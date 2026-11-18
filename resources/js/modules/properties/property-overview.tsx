import type { RecordId } from "@/framework/record-id";
import {
    DetailList,
    DynamicList,
    ErrorState,
    ListRow,
    Loading,
    MetricGrid,
    Occupancy,
    SectionCard,
    StatusBadge,
} from "@/components/blocks/content";
import { Split, Stack } from "@/components/blocks/layout";
import { BuildingManagementKeyValues } from "./building-management-key-values";
import { Button } from "@/components/ui/button";
import { useOverview, useResourceList } from "@/framework/data/hooks";
import type { RecordData } from "@/framework/types";
import { useWorkbench } from "@/framework/workbench";
import { date, label, money, number } from "@/lib/format";
import { units } from "@/modules/registry";
import { Building2, CalendarCheck, DoorOpen, Plus } from "lucide-react";
import { useNavigate } from "react-router";
export function OverviewMetrics({
    propertyId,
    compact = false,
}: {
    propertyId?: RecordId;
    compact?: boolean;
}) {
    const overview = useOverview(propertyId);
    if (overview.isPending) return <Loading rows={1} />;
    if (overview.error) return <ErrorState error={overview.error} />;
    const m = overview.data!.data;
    return (
        <MetricGrid
            compact={compact}
            items={[
                {
                    label: "Monatliche Grundmiete",
                    value: money(m.monthly_rent),
                    hint: `${money(m.annual_rent)} auf 12 Monate hochgerechnet`,
                    accent: true,
                },
                {
                    label: "Belegung",
                    value: `${number(m.occupancy, 1)} %`,
                    hint: `${m.rented} von ${m.units} Einheiten vermietet`,
                },
                {
                    label: "Nebenkosten & Heizung",
                    value: money(m.monthly_charges),
                    hint: "Monatlich · laufende Vertragskonditionen",
                },
                {
                    label: "Ø Mietdauer",
                    value:
                        m.average_tenancy_months === null
                            ? "—"
                            : `${number(Number(m.average_tenancy_months) / 12, 1)} Jahre`,
                    hint: "Laufende Verträge · seit Mietbeginn",
                },
            ]}
        />
    );
}
export default function PropertyOverview({
    property,
}: {
    property: RecordData;
}) {
    const navigate = useNavigate();
    const workbench = useWorkbench();
    const metrics = useOverview(property.id);
    const unitList = useResourceList(units, {
        filters: [{ field: "property_id", value: property.id }],
        limit: 10,
    });
    const m = metrics.data?.data;
    return (
        <Split
            main={
                <Stack>
                    <SectionCard appearance="single"
                        title="Einheiten im Blick"
                        description="Schneller Zugriff auf die Räume und Flächen dieses Objekts."
                        actions={
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                    workbench.openForm({
                                        resource: units,
                                        mode: "create",
                                        defaults: { property_id: property.id },
                                        context: {
                                            resource: "properties",
                                            id: property.id,
                                            field: "property_id",
                                        },
                                        reduced: true,
                                    })
                                }
                            >
                                <Plus />
                                Einheit
                            </Button>
                        }
                    >
                        {unitList.isPending ? (
                            <Loading rows={2} />
                        ) : unitList.error ? (
                            <ErrorState error={unitList.error} />
                        ) : (
                            <DynamicList
                                items={unitList.data!.data}
                                search
                                searchText={(r) =>
                                    `${r.code} ${r.name} ${label(r.type)}`
                                }
                                getKey={(r) => r.id}
                                renderItem={(r) => (
                                    <ListRow
                                        title={String(r.name)}
                                        description={`${r.code} · ${label(r.type)} · ${number(r.area, 2)} m²`}
                                        icon={<DoorOpen size={18} />}
                                        trailing={
                                            <StatusBadge value={r.status} />
                                        }
                                        onClick={() =>
                                            navigate(`/units/${r.id}`)
                                        }
                                    />
                                )}
                            />
                        )}
                    </SectionCard>
                    <SectionCard appearance="single" title="Gebäude & Verwaltung">
                        <BuildingManagementKeyValues property={property} />
                    </SectionCard>
                </Stack>
            }
            aside={
                <Stack>
                    <SectionCard appearance="single" title="Auslastung">
                        {m ? (
                            <Occupancy
                                occupied={Number(m.rented)}
                                total={Number(m.units)}
                            />
                        ) : (
                            <Loading rows={1} />
                        )}
                    </SectionCard>
                    <SectionCard appearance="single"
                        title="Nächste Objektprüfung"
                        actions={<CalendarCheck size={18} />}
                    >
                        <DetailList
                            items={[
                                {
                                    label: "Geplant",
                                    value: date(property.next_inspection_on),
                                },
                                {
                                    label: "Status",
                                    value:
                                        property.next_inspection_on &&
                                        String(property.next_inspection_on) <
                                            new Date()
                                                .toISOString()
                                                .slice(0, 10)
                                            ? "Termin prüfen"
                                            : "Im Blick",
                                },
                            ]}
                        />
                    </SectionCard>
                    <SectionCard appearance="single" title="Verantwortlich">
                        <ListRow
                            title={String(
                                property.manager_name ??
                                    "Noch nicht zugeordnet",
                            )}
                            description={String(property.manager_email ?? "")}
                            icon={<Building2 size={18} />}
                        />
                        <p className="mt-4 text-sm text-muted-foreground">
                            {String(property.manager_phone ?? "")}
                        </p>
                    </SectionCard>
                    {!!property.notes && (
                        <SectionCard appearance="single" title="Notizen">
                            <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                                {String(property.notes)}
                            </p>
                        </SectionCard>
                    )}
                </Stack>
            }
        />
    );
}
