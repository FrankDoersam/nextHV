import { getResource } from "@/modules/registry";
import { patchRecord } from "./record-cache";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { ResourceDefinition } from "../types";
import { dataProvider, type ListParams } from "./provider";
export const resourceKey = (name: string) => ["resources", name] as const;
export function useResourceList(
    resource: ResourceDefinition,
    params: ListParams = {},
    enabled = true,
    retainPrevious = false,
) {
    return useQuery({
        enabled,
        queryKey: [...resourceKey(resource.name), "list", params],
        queryFn: ({ signal }) => dataProvider.list(resource, params, signal),
        placeholderData: retainPrevious
            ? (previous, query) =>
                  query?.queryKey[1] === resource.name ? previous : undefined
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
            ...resourceKey(resource.name),
            "metric",
            resource.summary?.metric,
            params,
        ],
        queryFn: ({ signal }) =>
            dataProvider.summary(
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
        queryKey: [...resourceKey(resource.name), "detail", id],
        queryFn: () => dataProvider.one(resource, id),
        enabled: Number.isFinite(id) && id > 0,
    });
}
export function useOverview(id?: number) {
    return useQuery({
        queryKey: ["overview", id],
        queryFn: () => dataProvider.overview(id),
    });
}
export function useReload() {
    const client = useQueryClient();
    return () =>
        Promise.all([
            client.invalidateQueries({ queryKey: ["resources"] }),
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
        const saved = await dataProvider.save(resource, values, previous);
        await client.cancelQueries({ queryKey: resourceKey(resource.name) });
        patchRecord(client, resource.name, saved);
        if (previous) {
            // Preserve the current viewport/order. Re-evaluate server sort/filter on next visit or explicit refresh.
            await client.invalidateQueries({
                queryKey: [...resourceKey(resource.name), "list"],
                refetchType: "none",
            });
        } else {
            await client.invalidateQueries({
                queryKey: [...resourceKey(resource.name), "list"],
            });
        }
        await client.invalidateQueries({
            queryKey: [...resourceKey(resource.name), "metric"],
        });
        // Recount only cached foreign-key parents (e.g. contract after adding a condition).
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
                const cached = client
                    .getQueriesData({ queryKey: resourceKey(field.resource) })
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
                    const refreshed = await dataProvider.one(
                        parent.resource,
                        parent.id,
                    );
                    await client.cancelQueries({
                        queryKey: resourceKey(parent.resource.name),
                    });
                    patchRecord(client, parent.resource.name, refreshed);
                    await client.invalidateQueries({
                        queryKey: [
                            ...resourceKey(parent.resource.name),
                            "metric",
                        ],
                    });
                } catch {
                    // The mutation already succeeded. A failed optional parent refresh must not invite resubmission.
                    await client.invalidateQueries({
                        queryKey: resourceKey(parent.resource.name),
                        refetchType: "none",
                    });
                }
            }),
        );
        await client.invalidateQueries({
            queryKey: ["overview"],
            refetchType: "none",
        });
        return saved;
    };
}
