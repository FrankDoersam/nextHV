import { getResource } from "@/modules/registry";
import { patchRecord } from "./record-cache";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { ResourceDefinition } from "../types";
import { dataProvider, type ListParams } from "./provider";
import { resolveDataProvider } from "./provider-registry";
import type { TableQueryOptions } from "../tables/table-contract";
import { resourceKey, resourceListParams } from "./resource-key";
export { resourceKey } from "./resource-key";
export function useResourceList(
    resource: ResourceDefinition,
    params: ListParams = {},
    enabled = true,
    retainPrevious = false,
    staleTime?: number,
    queryOptions?: TableQueryOptions,
) {
    const provider = resolveDataProvider(resource);
    params = resourceListParams(resource, params);
    return useQuery({
        ...(staleTime === undefined ? {} : { staleTime }),
        ...(queryOptions ?? {}),
        enabled: enabled && (queryOptions?.enabled ?? true),
        queryKey: [...resourceKey(resource), "list", params],
        queryFn: ({ signal }) => provider.list(resource, params, signal),
        placeholderData: retainPrevious
            ? (previous, query) =>
                  query?.queryKey.slice(0, -2).join(".") ===
                  resourceKey(resource).join(".")
                      ? previous
                      : undefined
            : undefined,
    });
}
export function useCollectionSummary(
    resource: ResourceDefinition,
    params: Pick<ListParams, "query" | "filters">,
    enabled = true,
) {
    return useQuery({
        queryKey: [
            ...resourceKey(resource),
            "metric",
            resource.summary?.metric,
            params,
        ],
        queryFn: ({ signal }) =>
            resolveDataProvider(resource).summary(
                resource,
                resource.summary!.metric,
                params,
                signal,
            ),
        enabled: enabled && !!resource.summary,
    });
}
export function useResource(resource: ResourceDefinition, id: number) {
    return useQuery({
        queryKey: [...resourceKey(resource), "detail", id],
        queryFn: ({ signal }) =>
            resolveDataProvider(resource).one(resource, id, signal),
        enabled: Number.isFinite(id) && id > 0,
    });
}
export function useOverview(id?: number) {
    return useQuery({
        queryKey: ["overview", id],
        queryFn: ({ signal }) => dataProvider.overview(id, signal),
    });
}
export function useReload() {
    const client = useQueryClient();
    return () =>
        Promise.all([
            client.invalidateQueries({ queryKey: ["resources"] }),
            client.invalidateQueries({ queryKey: ["providers"] }),
            client.invalidateQueries({ queryKey: ["overview"] }),
        ]);
}
export function useDebounced<T>(value: T, delay = 250) {
    const [result, setResult] = useState(value);
    useEffect(() => {
        const id = setTimeout(() => setResult(value), delay);
        return () => clearTimeout(id);
    }, [value, delay]);
    return result;
}

/** Standard save path for full editors and inline mutations. Never reload all tables. */
export function useSaveRecord(resource: ResourceDefinition) {
    const client = useQueryClient();
    return async (
        values: import("../types").Values,
        previous?: import("../types").RecordData,
    ) => {
        const saved = await resolveDataProvider(resource).save(
            resource,
            values,
            previous,
        );
        await client.cancelQueries({ queryKey: resourceKey(resource) });
        patchRecord(client, resource, saved);
        await client.invalidateQueries({
            queryKey: [...resourceKey(resource), "audit", saved.id],
        });
        await client.invalidateQueries({
            queryKey: [...resourceKey(resource), "infinite"],
            refetchType: previous ? "none" : "active",
        });
        if (previous) {
            // Preserve the current viewport/order. Re-evaluate server sort/filter on next visit or explicit refresh.
            await client.invalidateQueries({
                queryKey: [...resourceKey(resource), "list"],
                refetchType: "none",
            });
        } else {
            await client.invalidateQueries({
                queryKey: [...resourceKey(resource), "list"],
            });
        }
        await client.invalidateQueries({
            queryKey: [...resourceKey(resource), "metric"],
        });
        await client.invalidateQueries({
            queryKey: [...resourceKey(resource), "groups"],
        });
        // Recount only cached foreign-key parents (e.g. contract after adding a condition).
        const countResources = new Map([[resource.name, resource]]);
        const parents = new Map<
            string,
            { resource: ResourceDefinition; id: number }
        >();
        for (const field of resource.fields) {
            if (field.kind !== "relation" || !field.resource) continue;
            for (const id of new Set([
                saved[field.name],
                previous?.[field.name],
            ])) {
                if (typeof id !== "number" || id <= 0) continue;
                countResources.set(field.resource, getResource(field.resource));
                const cached = client
                    .getQueriesData({
                        queryKey: resourceKey(getResource(field.resource)),
                    })
                    .some(([, value]) => {
                        const entry = value as
                            | { id?: number; data?: { id: number }[] }
                            | undefined;
                        return (
                            entry?.id === id ||
                            entry?.data?.some((row) => row.id === id)
                        );
                    });
                if (cached)
                    parents.set(`${field.resource}:${id}`, {
                        resource: getResource(field.resource),
                        id,
                    });
            }
        }
        await Promise.all(
            [...parents.values()].map(async (parent) => {
                try {
                    const refreshed = await resolveDataProvider(
                        parent.resource,
                    ).one(parent.resource, parent.id);
                    await client.cancelQueries({
                        queryKey: resourceKey(parent.resource),
                    });
                    patchRecord(client, parent.resource, refreshed);
                    await client.invalidateQueries({
                        queryKey: [...resourceKey(parent.resource), "metric"],
                    });
                    await client.invalidateQueries({
                        queryKey: [...resourceKey(parent.resource), "groups"],
                    });
                } catch {
                    // The mutation already succeeded. A failed optional parent refresh must not invite resubmission.
                    await client.invalidateQueries({
                        queryKey: resourceKey(parent.resource),
                        refetchType: "none",
                    });
                }
            }),
        );
        // Tab counts can change independently of visible rows; refresh only these cheap queries.
        await Promise.all(
            [...countResources.values()].map((definition) =>
                client.invalidateQueries({
                    queryKey: [...resourceKey(definition), "view-count"],
                }),
            ),
        );
        await client.invalidateQueries({
            queryKey: ["overview"],
            refetchType: "none",
        });
        return saved;
    };
}
