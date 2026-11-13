import { useState } from "react";
import { useSearchParams } from "react-router";
import type {
    ColumnVisibilityState,
    PaginationState,
    SortingState,
    Updater,
} from "@tanstack/react-table";
import type { ResourceDefinition } from "../types";
export interface GridState {
    search: string;
    pagination: PaginationState;
    sorting: SortingState;
    columnVisibility: ColumnVisibilityState;
    filters: Record<string, string[]>;
    group: string;
    dense: boolean;
}
function json(value: string | null, fallback: unknown) {
    try {
        return value ? JSON.parse(value) : fallback;
    } catch {
        return fallback;
    }
}
export function readGridState(
    url: URLSearchParams,
    resource: ResourceDefinition,
    prefix = "",
    pageSize = 25,
): GridState {
    const value = (name: string) => url.get(prefix + name);
    const columns = new Set(resource.columns.map((c) => c.field));
    const rawSort = json(value("sort"), []);
    const rawFilters = json(value("filters"), {});
    const rawColumns = json(value("columns"), {});
    const page = Number(value("page") ?? 1);
    const size = Number(value("perPage") ?? pageSize);
    return {
        search: (value("q") ?? "").slice(0, 200),
        pagination: {
            pageIndex:
                Number.isSafeInteger(page) && page > 0
                    ? Math.min(page - 1, 100000)
                    : 0,
            pageSize: [10, 25, 50, 100].includes(size) ? size : pageSize,
        },
        sorting: Array.isArray(rawSort)
            ? rawSort
                  .filter(
                      (s) =>
                          s &&
                          typeof s.id === "string" &&
                          resource.columns.some(
                              (c) => c.field === s.id && c.sortable !== false,
                          ),
                  )
                  .map((s) => ({ id: s.id, desc: !!s.desc }))
                  .slice(0, 3)
            : [],
        filters: Object.fromEntries(
            (resource.filters ?? []).flatMap((f) => {
                const raw =
                    rawFilters && typeof rawFilters === "object"
                        ? rawFilters[f.field]
                        : undefined;
                const values = [
                    ...new Set(
                        (Array.isArray(raw)
                            ? raw
                            : typeof raw === "string"
                              ? [raw]
                              : []
                        ).filter((v) => f.options.some((o) => o.value === v)),
                    ),
                ];
                return values.length ? [[f.field, values]] : [];
            }),
        ),
        columnVisibility: Object.fromEntries(
            rawColumns && typeof rawColumns === "object"
                ? Object.entries(rawColumns).filter(
                      ([key, v]) => columns.has(key) && typeof v === "boolean",
                  )
                : [],
        ) as ColumnVisibilityState,
        group: resource.groupBy?.some((g) => g.value === value("group"))
            ? value("group")!
            : "none",
        dense: value("dense") === "1",
    };
}
export function writeGridState(
    url: URLSearchParams,
    state: GridState,
    prefix = "",
) {
    const next = new URLSearchParams(url);
    const values: Record<string, string | undefined> = {
        q: state.search || undefined,
        page: state.pagination.pageIndex
            ? String(state.pagination.pageIndex + 1)
            : undefined,
        perPage: String(state.pagination.pageSize),
        sort: state.sorting.length ? JSON.stringify(state.sorting) : undefined,
        filters: Object.keys(state.filters).length
            ? JSON.stringify(state.filters)
            : undefined,
        columns: Object.keys(state.columnVisibility).length
            ? JSON.stringify(state.columnVisibility)
            : undefined,
        group: state.group !== "none" ? state.group : undefined,
        dense: state.dense ? "1" : undefined,
    };
    for (const [key, value] of Object.entries(values)) {
        if (value) next.set(prefix + key, value);
        else next.delete(prefix + key);
    }
    return next;
}
export function useGridState(
    resource: ResourceDefinition,
    {
        sync = true,
        prefix = "",
        pageSize = 25,
    }: { sync?: boolean; prefix?: string; pageSize?: number } = {},
) {
    const [url, setUrl] = useSearchParams();
    const [local, setLocal] = useState(() =>
        readGridState(new URLSearchParams(), resource, "", pageSize),
    );
    const state = sync ? readGridState(url, resource, prefix, pageSize) : local;
    function update<K extends keyof GridState>(
        key: K,
        value: Updater<GridState[K]>,
        resetPage = false,
    ) {
        const change = (current: GridState): GridState => ({
            ...current,
            [key]:
                typeof value === "function"
                    ? (value as (v: GridState[K]) => GridState[K])(current[key])
                    : value,
            ...(resetPage
                ? { pagination: { ...current.pagination, pageIndex: 0 } }
                : {}),
        });
        if (sync)
            setUrl(
                (prev) =>
                    writeGridState(
                        prev,
                        change(readGridState(prev, resource, prefix, pageSize)),
                        prefix,
                    ),
                { replace: key === "search" },
            );
        else setLocal(change);
    }
    return { state, update };
}
