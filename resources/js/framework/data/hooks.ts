import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { ResourceDefinition } from "../types";
import { dataProvider, type ListParams } from "./provider";
export const resourceKey = (name: string) => ["resources", name] as const;
export function useResourceList(
    resource: ResourceDefinition,
    params: ListParams = {},
    enabled = true,
) {
    return useQuery({
        enabled,
        queryKey: [...resourceKey(resource.name), "list", params],
        queryFn: () => dataProvider.list(resource, params),
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
