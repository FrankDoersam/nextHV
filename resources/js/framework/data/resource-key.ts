import type { ResourceDefinition } from "../types";
import type { ListParams } from "./provider";

/** Preserve legacy cache keys for Laravel while isolating named backend namespaces. */
export const resourceKey = (resource: string | ResourceDefinition) =>
    typeof resource === "string" ||
    !resource.dataProvider ||
    resource.dataProvider === "default"
        ? ["resources", typeof resource === "string" ? resource : resource.name]
        : ["providers", resource.dataProvider, "resources", resource.name];

/** The effective response shape is part of the key, including schema-provided defaults. */
export function resourceListParams(
    resource: ResourceDefinition,
    params: ListParams,
): ListParams {
    return {
        ...params,
        includes: params.includes ?? resource.includes,
        aggregates: params.aggregates ?? resource.aggregates,
    };
}
