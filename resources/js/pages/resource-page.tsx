import { PageHeader, CollectionPage } from "@/components/blocks/layout";
import { ResourceCollection } from "@/framework/tables/resource-collection";
import { ResourceGrid } from "@/framework/tables/resource-grid";
import type { ResourceDefinition } from "@/framework/types";
export default function ResourcePage({
    resource,
}: {
    resource: ResourceDefinition;
}) {
    if (resource.collection?.renderer === "grid")
        return (
            <section
                data-slot="resource-grid-page"
                data-resource={resource.name}
                className="flex min-h-0 min-w-0 flex-1 flex-col gap-4"
            >
                <ResourceGrid resource={resource} {...resource.collection} />
            </section>
        );
    return (
        <CollectionPage>
            <PageHeader eyebrow="Verwaltung" title={resource.label} />
            <ResourceCollection resource={resource} {...resource.collection} />
        </CollectionPage>
    );
}
