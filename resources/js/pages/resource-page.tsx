import { PresentationToggle } from "@/framework/presentation-toggle";
import { OverviewMetrics } from "@/modules/properties/property-overview";
import { SectionCard } from "@/components/blocks/content";
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
            <PageHeader
                eyebrow="Verwaltung"
                title={resource.label}
                actions={
                    resource.presentationToggle !== false ? (
                        <PresentationToggle />
                    ) : undefined
                }
            />
            {resource.name === "properties" && <OverviewMetrics compact />}
            <SectionCard grow>
                <ResourceCollection resource={resource} />
            </SectionCard>
        </CollectionPage>
    );
}
