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
                description={resource.description}
                actions={<PresentationToggle />}
            />
            {resource.name === "properties" && <OverviewMetrics compact />}
            <SectionCard
                grow
                title={`${resource.label} verwalten`}
                description="Finde Datensätze, passe die Ansicht an und bearbeite mehrere Einträge gemeinsam."
            >
                <ResourceCollection resource={resource} />
            </SectionCard>
        </CollectionPage>
    );
}
