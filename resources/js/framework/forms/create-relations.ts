import type {
    CreateRelationDefinition,
    ResourceDefinition,
    Values,
} from "../types";
import { initialValues } from "./initial-values";

export function creationFields(definition: CreateRelationDefinition) {
    return definition
        .resource()
        .fields.filter(
            (field) =>
                field.name !== definition.foreignKey &&
                (!definition.fields || definition.fields.includes(field.name)),
        );
}

export function creationRow(
    definition: CreateRelationDefinition,
    parent: Values,
) {
    return initialValues(
        creationFields(definition),
        undefined,
        definition.defaults?.(parent),
    );
}

export function creationDefaults(
    resource: ResourceDefinition,
    parent: Values,
): Values {
    return Object.fromEntries(
        (resource.createRelations ?? []).map((definition) => [
            definition.relation,
            Array.from({ length: definition.initialRows ?? 1 }, () =>
                creationRow(definition, parent),
            ),
        ]),
    );
}

export function creationNames(
    definition: CreateRelationDefinition,
    values: Values,
): string[] {
    const rows = values[definition.relation];
    return Array.isArray(rows)
        ? rows.flatMap((_, index) =>
              creationFields(definition).map(
                  (field) => `${definition.relation}.${index}.${field.name}`,
              ),
          )
        : [];
}
