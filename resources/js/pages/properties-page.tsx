import { PropertyCollection } from "@/modules/properties/property-collection";
import type { ResourceDefinition } from "@/framework/types";

export default function PropertiesPage({
    resource,
}: {
    resource: ResourceDefinition;
}) {
    return (
        <section
            data-slot="properties-page"
            className="flex min-h-0 min-w-0 flex-1 flex-col gap-4"
        >
            <PropertyCollection resource={resource} />
        </section>
    );
}
