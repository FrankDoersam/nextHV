import { BooleanPropertyList } from "@/framework/forms/editable-key-value-list";
import {
    DetailList,
    EmptyState,
    ErrorState,
    Loading,
    SectionCard,
    StatusBadge,
} from "@/components/blocks/content";
import { Inline, PageHeader, Stack } from "@/components/blocks/layout";
import { LazyTabs, type LazyTab } from "@/components/blocks/lazy-tabs";
import { Button } from "@/components/ui/button";
import { useResource } from "@/framework/data/hooks";
import { RelationCollection } from "@/framework/tables/relation-collection";
import { RowActions } from "@/framework/tables/resource-collection";
import type { RecordData, ResourceDefinition } from "@/framework/types";
import { useWorkbench } from "@/framework/workbench";
import { date, label, money } from "@/lib/format";
import { OverviewMetrics } from "@/modules/properties/property-overview";
import { ArrowLeft, Pencil, RefreshCw } from "lucide-react";
import { lazy, Suspense } from "react";
import { useNavigate, useParams } from "react-router";
const PropertyOverview = lazy(
    () => import("@/modules/properties/property-overview"),
);
const RelationPanel = lazy(() => import("@/modules/relations/relation-panel"));
const DocumentFile = lazy(() => import("@/modules/documents/document-file"));
const futureTabs = ["Zähler", "Prüfungen", "Projekte", "Zahlungen"];
export default function DetailPage({
    resource,
}: {
    resource: ResourceDefinition;
}) {
    const { id } = useParams();
    const result = useResource(resource, Number(id));
    const navigate = useNavigate();
    const w = useWorkbench();
    if (result.isPending) return <Loading />;
    if (result.error)
        return (
            <ErrorState error={result.error} retry={() => result.refetch()} />
        );
    const record = result.data!;
    const tabs: LazyTab[] = [
        {
            id: "overview",
            label: "Übersicht",
            render: () =>
                resource.name === "properties" ? (
                    <PropertyOverview property={record} />
                ) : (
                    <GenericOverview resource={resource} record={record} />
                ),
        },
    ];
    for (const relation of resource.relations ?? [])
        tabs.push({
            id: relation.resource + relation.field,
            label: relation.label,
            count: relation.countRelation
                ? Number(record[relation.countRelation + "_count"])
                : undefined,
            render: () => (
                <RelationCollection
                    relation={relation}
                    parent={{ resource: resource.name, id: record.id }}
                />
            ),
        });
    if (resource.name === "properties") {
        tabs.push({
            id: "contracts",
            label: "Verträge",
            render: () => (
                <RelationPanel
                    resource="contracts"
                    title="Verträge im Objekt"
                    filters={[{ field: "unit.property_id", value: record.id }]}
                />
            ),
        });
        for (const name of futureTabs)
            tabs.push({
                id: name,
                label: name,
                count: null,
                render: () => (
                    <SectionCard title={name}>
                        <EmptyState
                            title={`${name} · vorbereitet`}
                            description="Dieses Fachmodul ist noch nicht eingerichtet. Hier werden später die zugehörigen Daten dieses Objekts geladen."
                        />
                    </SectionCard>
                ),
            });
    }
    if (resource.name === "contracts")
        tabs.push({
            id: "incoming-links",
            label: "Eingehende Verknüpfungen",
            count: Number(record.incoming_links_count ?? 0),
            render: () => (
                <RelationPanel
                    resource="contract-links"
                    title="Mit diesem Vertrag verknüpft"
                    filters={[
                        { field: "related_contract_id", value: record.id },
                    ]}
                />
            ),
        });
    if (resource.name === "identity-documents")
        tabs.push({
            id: "file",
            label: "Datei",
            render: () => <DocumentFile record={record} />,
        });
    return (
        <Stack>
            <Inline>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate("/" + resource.name)}
                >
                    <ArrowLeft />
                    {resource.label}
                </Button>
                {!!record.status && <StatusBadge value={record.status} />}
            </Inline>
            <PageHeader
                eyebrow={String(record.code ?? resource.singular)}
                title={String(record[resource.titleField] ?? resource.singular)}
                description={
                    resource.name === "properties"
                        ? `${record.street} ${record.house_number} · ${record.postal_code} ${record.city}`
                        : resource.description
                }
                actions={
                    <>
                        <Button
                            variant="outline"
                            aria-label="Datensatz aktualisieren"
                            onClick={() => result.refetch()}
                        >
                            <RefreshCw />
                        </Button>
                        <Button
                            onClick={() =>
                                w.openForm({
                                    resource,
                                    mode: "edit",
                                    row: record,
                                })
                            }
                        >
                            <Pencil />
                            Bearbeiten
                        </Button>
                        <RowActions resource={resource} row={record} />
                    </>
                }
            />
            {resource.name === "properties" && (
                <OverviewMetrics propertyId={record.id} />
            )}
            <Suspense fallback={<Loading />}>
                <LazyTabs tabs={tabs} />
            </Suspense>
        </Stack>
    );
}
function GenericOverview({
    resource,
    record,
}: {
    resource: ResourceDefinition;
    record: RecordData;
}) {
    const groups = resource.groups ?? [{ id: "general", label: "Grunddaten" }];
    return (
        <Stack>
            {groups.map((g) => (
                <SectionCard key={g.id} title={g.label}>
                    <DetailList
                        items={resource.fields
                            .filter(
                                (f) =>
                                    (f.group ?? "general") === g.id &&
                                    f.name !== "document_number",
                            )
                            .map((f) => ({
                                label: f.label,
                                value:
                                    f.kind === "currency"
                                        ? money(record[f.name])
                                        : f.kind === "date"
                                          ? date(record[f.name])
                                          : f.kind === "checkbox"
                                            ? record[f.name]
                                                ? "Ja"
                                                : "Nein"
                                            : f.kind === "relation"
                                              ? `#${record[f.name]}`
                                              : f.kind === "select"
                                                ? label(record[f.name])
                                                : String(record[f.name] ?? "—"),
                            }))}
                    />
                </SectionCard>
            ))}
            {resource.name === "identity-documents" && (
                <SectionCard title="Ausweisnummer">
                    <DetailList
                        items={[
                            {
                                label: "Letzte vier Zeichen",
                                value: String(record.number_last_four ?? "—"),
                            },
                        ]}
                    />
                </SectionCard>
            )}
            {resource.name === "units" && (
                <SectionCard title="Ausstattung direkt ändern">
                    <BooleanPropertyList
                        resource={resource}
                        record={record}
                        names={["has_balcony", "barrier_free"]}
                    />
                </SectionCard>
            )}
            <SectionCard title="Datensatz">
                <DetailList
                    items={[
                        { label: "Angelegt", value: date(record.created_at) },
                        {
                            label: "Zuletzt aktualisiert",
                            value: date(record.updated_at),
                        },
                    ]}
                />
            </SectionCard>
        </Stack>
    );
}
