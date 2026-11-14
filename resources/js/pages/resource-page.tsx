import { PageHeader, CollectionPage } from "@/components/blocks/layout";
import { ResourceCollection } from "@/framework/tables/resource-collection";
import type { ResourceDefinition } from "@/framework/types";
export default function ResourcePage({
    resource,
}: {
    resource: ResourceDefinition;
}) {
    return (
        <CollectionPage>
            <PageHeader eyebrow="Verwaltung" title={resource.label} />
            <ResourceCollection resource={resource} {...resource.collection} />
        </CollectionPage>
    );
}
