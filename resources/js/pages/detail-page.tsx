import { BooleanPropertyList } from "@/framework/forms/editable-key-value-list";
import {
    DetailList,
    EmptyState,
    ErrorState,
    Loading,
    SectionCard,
} from "@/components/blocks/content";
import {
    DetailPageLayout,
    DetailColumns,
    PageHeader,
} from "@/components/blocks/layout";
import { LazyTabs, type LazyTab } from "@/components/blocks/lazy-tabs";
import { Button } from "@/components/ui/button";
import { useResource } from "@/framework/data/hooks";
import { RelationCollection } from "@/framework/tables/relation-collection";
import { RowActions } from "@/framework/tables/resource-collection";
import type { RecordData, ResourceDefinition } from "@/framework/types";
import { useWorkbench } from "@/framework/workbench";
import { date } from "@/lib/format";
import { formatFieldValue } from "@/framework/forms/field-display";
import { OverviewMetrics } from "@/modules/properties/property-overview";
import { getResource } from "@/modules/registry";
import {
    Pencil,
    RefreshCw,
    LayoutDashboard,
    FileText,
    Gauge,
    ClipboardCheck,
    FolderKanban,
    Wallet,
    Paperclip,
    Link2,
} from "lucide-react";
import { lazy, Suspense } from "react";
import { useParams } from "react-router";
const PropertyOverview = lazy(
    () => import("@/modules/properties/property-overview"),
);
const RelationPanel = lazy(() => import("@/modules/relations/relation-panel"));
const DocumentFile = lazy(() => import("@/modules/documents/document-file"));
const futureTabs = [
    { label: "Zähler", icon: Gauge },
    { label: "Prüfungen", icon: ClipboardCheck },
    { label: "Projekte", icon: FolderKanban },
    { label: "Zahlungen", icon: Wallet },
];
export default function DetailPage({
    resource,
}: {
    resource: ResourceDefinition;
}) {
    const { id } = useParams();
    const result = useResource(resource, Number(id));
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
            icon: LayoutDashboard,
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
            label: relation.navigationLabel ?? relation.label,
            icon: relation.icon ?? getResource(relation.resource).icon,
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
            icon: FileText,
            label: "Verträge",
            render: () => (
                <RelationPanel
                    resource="contracts"
                    title="Verträge im Objekt"
                    filters={[{ field: "unit.property_id", value: record.id }]}
                />
            ),
        });
        for (const { label: name, icon } of futureTabs)
            tabs.push({
                id: name,
                icon,
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
            icon: Link2,
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
            icon: Paperclip,
            label: "Datei",
            render: () => <DocumentFile record={record} />,
        });
    return (
        <DetailPageLayout>
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
                        <RowActions
                            placement="detail"
                            resource={resource}
                            row={record}
                        />
                    </>
                }
            />
            {resource.name === "properties" && (
                <OverviewMetrics propertyId={record.id} />
            )}
            <Suspense fallback={<Loading />}>
                <LazyTabs tabs={tabs} />
            </Suspense>
        </DetailPageLayout>
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
        <DetailColumns
            main={
                <>
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
                                        value: formatFieldValue(f, record),
                                    }))}
                            />
                        </SectionCard>
                    ))}
                </>
            }
            aside={
                <>
                    {resource.name === "identity-documents" && (
                        <SectionCard title="Ausweisnummer">
                            <DetailList
                                items={[
                                    {
                                        label: "Letzte vier Zeichen",
                                        value: String(
                                            record.number_last_four ?? "—",
                                        ),
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
                                {
                                    label: "Angelegt",
                                    value: date(record.created_at),
                                },
                                {
                                    label: "Zuletzt aktualisiert",
                                    value: date(record.updated_at),
                                },
                            ]}
                        />
                    </SectionCard>
                </>
            }
        />
    );
}
