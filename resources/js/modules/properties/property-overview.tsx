import {
    DetailList,
    EmptyState,
    ErrorState,
    Loading,
    MetricGrid,
    Occupancy,
    StatusBadge,
} from "@/components/blocks/content";
import { PropertyKeyValues } from "./building-management-key-values";
import { properties } from "./properties-resource";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardAction,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    ItemActions,
    ItemButton,
    ItemContent,
    ItemDescription,
    ItemGroup,
    ItemMedia,
    ItemTitle,
} from "@/components/ui/item";
import { useOverview, useResourceList } from "@/framework/data/hooks";
import { can, usePermissionRevision } from "@/framework/permissions";
import type { RecordData } from "@/framework/types";
import { useWorkbench } from "@/framework/workbench";
import { date, label, money, number } from "@/lib/format";
import { units } from "@/modules/registry";
import { DoorOpen, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";
export function OverviewMetrics({
    propertyId,
    compact = false,
}: {
    propertyId?: number;
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
    const [, setParams] = useSearchParams();
    const workbench = useWorkbench();
    usePermissionRevision();
    const [unitQuery, setUnitQuery] = useState("");
    const metrics = useOverview(property.id);
    const unitList = useResourceList(units, {
        filters: [{ field: "property_id", value: property.id }],
        limit: 10,
    });
    const m = metrics.data?.data;
    const unitRelation = properties.relations?.find(
        (relation) => relation.resource === units.name,
    );
    const visibleUnits = (unitList.data?.data ?? []).filter((unit) =>
        `${unit.code} ${unit.name} ${label(unit.type)}`
            .toLocaleLowerCase("de")
            .includes(unitQuery.toLocaleLowerCase("de")),
    );
    const inspectionStatus = !property.next_inspection_on
        ? "Nicht geplant"
        : String(property.next_inspection_on) <
            new Date().toISOString().slice(0, 10)
          ? "Termin prüfen"
          : "Im Blick";
    const openUnits = () => {
        if (!unitRelation) return;
        setParams((current) => {
            const next = new URLSearchParams(current);
            next.set("tab", unitRelation.resource + unitRelation.field);
            return next;
        });
    };
    return (
        <div
            data-slot="property-detail-sections"
            className="@container/property-detail flex min-w-0 flex-col gap-4"
        >
            <div className="grid min-w-0 items-start gap-4 @min-[44rem]/property-detail:grid-cols-2 @min-[66rem]/property-detail:grid-cols-3">
                <PropertySection title="Stammdaten">
                    <PropertyKeyValues property={property} section="general" />
                </PropertySection>
                <PropertySection
                    title="Verwaltung"
                    footer={`Objektprüfung · ${inspectionStatus}`}
                >
                    <PropertyKeyValues
                        property={property}
                        section="management"
                    />
                </PropertySection>
                <div className="flex min-w-0 flex-col gap-4">
                    <PropertySection title="Gebäude">
                        <PropertyKeyValues
                            property={property}
                            section="building"
                        />
                    </PropertySection>
                    <PropertySection title="Notizen">
                        <div
                            data-slot="property-notes-values"
                            className="whitespace-pre-wrap break-words text-sm leading-5"
                        >
                            {String(property.notes || "—")}
                        </div>
                    </PropertySection>
                </div>
            </div>
            <div className="grid min-w-0 items-start gap-4 @min-[44rem]/property-detail:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
                <PropertySection
                    title="Einheiten im Blick"
                    actions={
                        can(units.name, "create") && (
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
                        )
                    }
                    footer={
                        unitList.data && (
                            <div className="flex w-full flex-wrap items-center justify-between gap-2">
                                <span>
                                    {unitQuery
                                        ? `${visibleUnits.length} von ${unitList.data.data.length} geladenen Einheiten`
                                        : `${unitList.data.data.length} von ${unitList.data.total} Einheiten geladen`}
                                </span>
                                {unitRelation && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={openUnits}
                                    >
                                        Alle Einheiten anzeigen
                                    </Button>
                                )}
                            </div>
                        )
                    }
                >
                    {unitList.isPending ? (
                        <Loading rows={2} />
                    ) : unitList.error ? (
                        <ErrorState error={unitList.error} />
                    ) : (
                        <div className="flex min-w-0 flex-col gap-3">
                            <Input
                                aria-label="Angezeigte Einheiten durchsuchen"
                                placeholder="Angezeigte Einheiten durchsuchen …"
                                value={unitQuery}
                                onChange={(event) =>
                                    setUnitQuery(event.target.value)
                                }
                            />
                            <ItemGroup
                                role="list"
                                aria-label="Einheiten im Objekt"
                            >
                                {visibleUnits.map((unit) => (
                                    <div key={unit.id} role="listitem">
                                        <ItemButton
                                            size="sm"
                                            type="button"
                                            onClick={() =>
                                                navigate(`/units/${unit.id}`)
                                            }
                                        >
                                            <ItemMedia>
                                                <DoorOpen size={16} />
                                            </ItemMedia>
                                            <ItemContent>
                                                <ItemTitle>
                                                    {String(unit.name)}
                                                </ItemTitle>
                                                <ItemDescription>
                                                    {String(unit.code)} ·{" "}
                                                    {label(unit.type)} ·{" "}
                                                    {number(unit.area, 2)} m²
                                                </ItemDescription>
                                            </ItemContent>
                                            <ItemActions>
                                                <StatusBadge
                                                    value={unit.status}
                                                />
                                            </ItemActions>
                                        </ItemButton>
                                    </div>
                                ))}
                            </ItemGroup>
                            {!visibleUnits.length && (
                                <EmptyState
                                    title={
                                        unitQuery
                                            ? "Keine passenden Einheiten"
                                            : "Noch keine Einheiten"
                                    }
                                    description={
                                        unitQuery
                                            ? "Passe die Suche an."
                                            : "Die Einheiten dieses Objekts werden hier angezeigt."
                                    }
                                />
                            )}
                        </div>
                    )}
                </PropertySection>
                <div className="flex min-w-0 flex-col gap-4">
                    <PropertySection title="Auslastung">
                        {metrics.error ? (
                            <ErrorState error={metrics.error} />
                        ) : m ? (
                            <Occupancy
                                occupied={Number(m.rented)}
                                total={Number(m.units)}
                            />
                        ) : (
                            <Loading rows={1} />
                        )}
                    </PropertySection>
                    <PropertySection title="Datensatz">
                        <DetailList
                            items={[
                                {
                                    label: "Angelegt",
                                    value: date(property.created_at),
                                },
                                {
                                    label: "Aktualisiert",
                                    value: date(property.updated_at),
                                },
                            ]}
                        />
                    </PropertySection>
                </div>
            </div>
        </div>
    );
}

/** Domain composition uses the unchanged Nova Card slots and size variant. */
function PropertySection({
    title,
    actions,
    footer,
    children,
}: {
    title: string;
    actions?: ReactNode;
    footer?: ReactNode;
    children: ReactNode;
}) {
    return (
        <Card size="sm" data-slot="content-card">
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                {actions && <CardAction>{actions}</CardAction>}
            </CardHeader>
            <CardContent>{children}</CardContent>
            {footer && <CardFooter>{footer}</CardFooter>}
        </Card>
    );
}
