import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import type {
    ColumnVisibilityState,
    PaginationState,
    SortingState,
    Updater,
} from "@tanstack/react-table";
import type { ResourceDefinition } from "../types";
import {
    columnFilters,
    sanitizeGridFilters,
    type GridFilters,
} from "./filter-rules";
export interface GridState {
    search: string;
    view: string;
    pagination: PaginationState;
    sorting: SortingState;
    columnVisibility: ColumnVisibilityState;
    filters: GridFilters;
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
export function defaultColumnVisibility(
    resource: ResourceDefinition,
): ColumnVisibilityState {
    return Object.fromEntries(
        resource.columns
            .filter(
                (column) =>
                    column.defaultVisible === false &&
                    column.hideable !== false,
            )
            .map((column) => [column.field, false]),
    );
}
export function readGridState(
    url: URLSearchParams,
    resource: ResourceDefinition,
    prefix = "",
    pageSize = 25,
    defaults: Partial<GridState> = {},
): GridState {
    const value = (name: string) => url.get(prefix + name);
    const columns = new Set(resource.columns.map((c) => c.field));
    const rawSort = json(value("sort"), defaults.sorting ?? []);
    const rawFilters = json(value("filters"), defaults.filters ?? {});
    const rawColumns = json(value("columns"), defaults.columnVisibility ?? {});
    const page = Number(
        value("page") ?? (defaults.pagination?.pageIndex ?? 0) + 1,
    );
    const size = Number(
        value("perPage") ?? defaults.pagination?.pageSize ?? pageSize,
    );
    return {
        view: resource.views?.some((view) => view.id === value("view"))
            ? value("view")!
            : "",
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
                              (c) =>
                                  c.field === s.id &&
                                  c.sortable !== false &&
                                  !c.computed &&
                                  (!c.input ||
                                      (c.input.mode === "record" &&
                                          resource.fields.some(
                                              (field) => field.name === c.field,
                                          ))),
                          ),
                  )
                  .map((s) => ({ id: s.id, desc: !!s.desc }))
                  .slice(0, 3)
            : [],
        filters: sanitizeGridFilters(rawFilters, columnFilters(resource)),
        columnVisibility: {
            ...defaultColumnVisibility(resource),
            ...Object.fromEntries(
                rawColumns && typeof rawColumns === "object"
                    ? Object.entries(rawColumns).filter(
                          ([key, v]) =>
                              columns.has(key) &&
                              typeof v === "boolean" &&
                              resource.columns.find((c) => c.field === key)
                                  ?.hideable !== false,
                      )
                    : [],
            ),
        } as ColumnVisibilityState,
        group: resource.groupBy?.some(
            (g) => g.value === (value("group") ?? defaults.group),
        )
            ? (value("group") ?? defaults.group)!
            : "none",
        dense:
            value("dense") === "1" ||
            (value("dense") === null && defaults.dense === true),
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
        view: state.view || undefined,
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
        defaults = {},
    }: {
        sync?: boolean;
        prefix?: string;
        pageSize?: number;
        defaults?: Partial<GridState>;
    } = {},
) {
    const [url, setUrl] = useSearchParams();
    const [local, setLocal] = useState(() =>
        readGridState(new URLSearchParams(), resource, "", pageSize, defaults),
    );
    const state = useMemo(
        () =>
            sync
                ? readGridState(url, resource, prefix, pageSize, defaults)
                : local,
        [sync, url, resource, prefix, pageSize, defaults, local],
    );
    function commit(
        change: (current: GridState) => GridState,
        replace = false,
    ) {
        if (sync)
            setUrl(
                (prev) =>
                    writeGridState(
                        prev,
                        change(
                            readGridState(
                                prev,
                                resource,
                                prefix,
                                pageSize,
                                defaults,
                            ),
                        ),
                        prefix,
                    ),
                { replace },
            );
        else setLocal(change);
    }
    function clearQuery() {
        commit((current) => ({
            ...current,
            search: "",
            filters: {},
            pagination: { ...current.pagination, pageIndex: 0 },
        }));
    }
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
        commit(change, key === "search");
    }
    return { state, update, clearQuery };
}
