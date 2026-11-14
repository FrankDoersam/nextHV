import type { ResourceDefinition } from "../types";

/** Preserve legacy cache keys for Laravel while isolating named backend namespaces. */
export const resourceKey = (resource: string | ResourceDefinition) =>
    typeof resource === "string" || !resource.dataProvider
        ? ["resources", typeof resource === "string" ? resource : resource.name]
        : ["providers", resource.dataProvider, "resources", resource.name];
