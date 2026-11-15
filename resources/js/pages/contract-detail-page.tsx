import { auditTabs } from "@/components/blocks/audit-timeline";
import { lazy, Suspense } from "react";
import { useParams } from "react-router";
import { Pencil, RefreshCw, LayoutDashboard, Link2 } from "lucide-react";
import { DetailPageLayout, PageHeader } from "@/components/blocks/layout";
import { ErrorState, Loading } from "@/components/blocks/content";
import { LazyTabs } from "@/components/blocks/lazy-tabs";
import { Button } from "@/components/ui/button";
import { useResource } from "@/framework/data/hooks";
import { useWorkbench } from "@/framework/workbench";
import { RowActions } from "@/framework/tables/resource-collection";
import { RelationCollection } from "@/framework/tables/relation-collection";
import { getResource } from "@/modules/registry";
import { contracts } from "@/modules/contracts/contracts-resource";
import { label } from "@/lib/format";
const ContractOverview = lazy(
    () => import("@/modules/contracts/contract-overview"),
);
export default function ContractDetailPage() {
    const { id } = useParams();
    const result = useResource(contracts, Number(id));
    const workbench = useWorkbench();
    if (result.isPending) return <Loading />;
    if (result.error)
        return (
            <ErrorState error={result.error} retry={() => result.refetch()} />
        );
    const record = result.data!;
    const parent = { resource: contracts.name, id: record.id };
    return (
        <DetailPageLayout>
            <PageHeader
                eyebrow="Vertragsakte"
                title={String(record.code)}
                description={`${label(record.type)} · Laufzeit, Beteiligte und Konditionshistorie`}
                actions={
                    <>
                        <Button
                            variant="outline"
                            aria-label="Vertrag aktualisieren"
                            onClick={() => result.refetch()}
                        >
                            <RefreshCw />
                        </Button>
                        <Button
                            onClick={() =>
                                workbench.openForm({
                                    resource: contracts,
                                    mode: "edit",
                                    row: record,
                                })
                            }
                        >
                            <Pencil /> Bearbeiten
                        </Button>
                        <RowActions
                            placement="detail"
                            resource={contracts}
                            row={record}
                            exclude={["edit"]}
                        />
                    </>
                }
            />
            <Suspense fallback={<Loading />}>
                <LazyTabs
                    tabs={[
                        {
                            id: "overview",
                            icon: LayoutDashboard,
                            label: "Übersicht",
                            render: () => <ContractOverview record={record} />,
                        },
                        ...auditTabs(contracts, record.id),
                        ...contracts.relations!.map((relation) => ({
                            id: relation.resource,
                            label: relation.navigationLabel ?? relation.label,
                            icon:
                                relation.icon ??
                                getResource(relation.resource).icon,
                            count: Number(
                                record[`${relation.countRelation}_count`] ?? 0,
                            ),
                            render: () => (
                                <RelationCollection
                                    relation={relation}
                                    parent={parent}
                                />
                            ),
                        })),
                        {
                            id: "incoming-links",
                            icon: Link2,
                            label: "Eingehende Links",
                            count: Number(record.incoming_links_count ?? 0),
                            render: () => (
                                <RelationCollection
                                    relation={{
                                        resource: "contract-links",
                                        field: "related_contract_id",
                                        label: "Eingehende Verknüpfungen",
                                        collection: {
                                            create: false,
                                            pagination: false,
                                            rowSelection: false,
                                        },
                                    }}
                                    parent={parent}
                                />
                            ),
                        },
                    ]}
                />
            </Suspense>
        </DetailPageLayout>
    );
}
