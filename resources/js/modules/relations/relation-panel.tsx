import { SectionCard } from "@/components/blocks/content";
import { ResourceCollection } from "@/framework/tables/resource-collection";
import type { Filter, Values } from "@/framework/types";
import { getResource } from "@/modules/registry";
export default function RelationPanel({
    resource,
    title,
    filters,
    defaults,
    description,
}: {
    resource: string;
    title: string;
    filters: Filter[];
    defaults?: Values;
    description?: string;
}) {
    return (
        <SectionCard title={title} description={description}>
            <ResourceCollection
                resource={getResource(resource)}
                fixedFilters={filters}
                defaults={defaults}
                compact
            />
        </SectionCard>
    );
}
