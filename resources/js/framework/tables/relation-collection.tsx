import { SectionCard } from "@/components/blocks/content";
import { getResource } from "@/modules/registry";
import type { UseFormReturn } from "react-hook-form";
import type { RecordReference } from "../forms/flow";
import type { RelationDefinition, ResourceDefinition, Values } from "../types";
import { ResourceCollection } from "./resource-collection";

/** One relation outlet for detail pages, nested sheets, dialogs and editor cards. */
export function RelationCollection({
    relation,
    parent,
    surface = "page",
    onSaved,
    form,
    formResource,
}: {
    relation: RelationDefinition;
    parent: RecordReference;
    surface?: "page" | "editor";
    onSaved?: () => void | Promise<void>;
    form?: UseFormReturn<Values>;
    formResource?: ResourceDefinition;
}) {
    const options = {
        ...relation.collection,
        ...(surface === "editor" ? relation.editorCollection : {}),
    };
    return (
        <SectionCard title={relation.label} description={relation.description}>
            <ResourceCollection
                resource={getResource(relation.resource)}
                compact
                {...options}
                fixedFilters={[{ field: relation.field, value: parent.id }]}
                context={{ ...parent, field: relation.field }}
                createForm={relation.createForm}
                editForm={relation.editForm}
                onSaved={onSaved}
                form={form}
                formResource={formResource}
            />
        </SectionCard>
    );
}
