import { parseRecordId, type RecordId } from "@/framework/record-id";
import { useCallback } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { ResourceDefinition } from "../types";
import { resourceKey } from "./resource-key";
export type ResourceQueryKind =
    | "list"
    | "infinite"
    | "many"
    | "detail"
    | "metric"
    | "groups"
    | "view-count"
    | "panel"
    | "audit";
export interface InvalidateResourceOptions {
    kinds?: ResourceQueryKind[];
    ids?: RecordId[];
    refetchType?: "active" | "inactive" | "all" | "none";
}
/** Custom actions can refresh their affected data without reloading the application. */
export function invalidateResource(
    client: QueryClient,
    resource: ResourceDefinition,
    options: InvalidateResourceOptions = {},
) {
    const base = resourceKey(resource);
    const { kinds, ids, refetchType = "active" } = options;
    return client.invalidateQueries({
        refetchType,
        predicate: (query) => {
            const key = query.queryKey;
            const panel =
                key[0] === "panel" &&
                key[2] === resource.name &&
                (key[7] ?? "default") === (resource.dataProvider ?? "default");
            if (panel)
                return (
                    !!kinds?.includes("panel") &&
                    (!ids || ids.some((id) => id === parseRecordId(key[3])))
                );
            if (!base.every((part, index) => key[index] === part)) return false;
            const kind = key[base.length] as ResourceQueryKind;
            if (kinds && !kinds.includes(kind)) return false;
            if (ids && !ids.length) return false;
            if (ids && (kind === "detail" || kind === "audit"))
                return ids.some((id) => id === parseRecordId(key[base.length + 1]));
            if (ids && kind === "many") {
                const selected = (key[base.length + 1] as { ids?: RecordId[] })
                    ?.ids;
                return !!selected?.some((id) => ids.includes(id));
            }
            return true;
        },
    });
}
export function useInvalidateResource() {
    const client = useQueryClient();
    return useCallback(
        (resource: ResourceDefinition, options?: InvalidateResourceOptions) =>
            invalidateResource(client, resource, options),
        [client],
    );
}
