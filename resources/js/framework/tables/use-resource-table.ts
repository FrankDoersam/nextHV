import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hashKey, useQuery } from "@tanstack/react-query";
import type { SortingState, Updater } from "@tanstack/react-table";
import type {
    CollectionViewDefinition,
    Filter,
    PageResult,
    RecordData,
    ResourceDefinition,
} from "../types";
import { resolveDataProvider } from "../data/provider-registry";
import { useDebounced, resourceKey } from "../data/hooks";
import { resourceListParams } from "../data/resource-key";
import {
    columnFilters,
    compileGridFilters,
    sanitizeGridFilters,
    type GridFilters,
} from "./filter-rules";
import { useGridState } from "./grid-state";
import {
    mergeTableFilters,
    tablePagination,
    SAFE_FULL_FETCH_LIMIT,
    type TableFilterPresets,
    type TablePaginationOptions,
    type TableQueryOptions,
    type TableSort,
    type TableSortPresets,
} from "./table-contract";

const EMPTY_VIEWS: CollectionViewDefinition[] = [];
const EMPTY_FILTERS: Filter[] = [];

export interface ResourceTableOptions<TRecord extends RecordData = RecordData> {
    resource: ResourceDefinition;
    fixedFilters?: Filter[];
    views?: CollectionViewDefinition[] | false;
    pagination?: boolean | TablePaginationOptions;
    filters?: TableFilterPresets;
    sorters?: TableSortPresets;
    queryOptions?: TableQueryOptions;
    compact?: boolean;
    syncWithLocation?: boolean;
    urlKey?: string;
    searchable?: boolean;
    filterable?: boolean;
    groupable?: boolean;
    toolbarFilters?: string[];
    enabled?: boolean;
}

export type ResourceGroupCount = {
    value: string | number | null;
    count: number;
};
export type ResourceGroupResult = {
    data: { field: string; total: number; groups: ResourceGroupCount[] };
};

/** Headless URL state, query, sorting, filtering, grouping, and safe cross-page selection. */
export function useResourceTable<TRecord extends RecordData = RecordData>({
    resource,
    fixedFilters = EMPTY_FILTERS,
    views: configuredViews,
    pagination: configuredPagination = true,
    filters: filterPresets,
    sorters: sortPresets,
    queryOptions,
    compact = false,
    syncWithLocation = true,
    urlKey,
    searchable = true,
    filterable = !compact,
    groupable = !compact,
    toolbarFilters = resource.toolbarFilters ?? [],
    enabled = true,
}: ResourceTableOptions<TRecord>) {
    const provider = resolveDataProvider(resource);
    const providerName = resource.dataProvider ?? "default";
    const paging = tablePagination(configuredPagination, compact);
    const views =
        configuredViews === false
            ? EMPTY_VIEWS
            : (configuredViews ?? resource.views ?? EMPTY_VIEWS);
    const scopePrefix =
        urlKey ??
        (compact
            ? `${resource.name}.${fixedFilters
                  .map((filter) =>
                      "field" in filter
                          ? `${filter.field}-${filter.value}`
                          : "relation",
                  )
                  .join(".")}.`
            : "");
    const stateResource = useMemo(
        () => ({ ...resource, views }),
        [resource, views],
    );
    const defaults = useMemo(
        () => ({
            pagination: {
                pageIndex: Math.max(0, paging.currentPage - 1),
                pageSize: paging.pageSize,
            },
            filters: filterPresets?.initial ?? {},
            sorting: sortPresets?.initial ?? ([] as SortingState),
        }),
        [
            paging.currentPage,
            paging.pageSize,
            filterPresets?.initial,
            sortPresets?.initial,
        ],
    );
    const { state, update, clearQuery } = useGridState(stateResource, {
        sync: syncWithLocation,
        prefix: scopePrefix,
        pageSize: paging.pageSize,
        defaults,
    });
    const { search, pagination, sorting, filters, view, group } = state;
    const query = useDebounced(searchable ? search : "");
    const activeView =
        views.find((candidate) => candidate.id === view) ?? views[0];
    const scopedQuery = [activeView?.query, query].filter(Boolean).join(" ");
    const filterDefinitions = useMemo(
        () => columnFilters(resource),
        [resource],
    );
    const userFilters = useMemo(
        () =>
            Object.fromEntries(
                Object.entries(filters).filter(
                    ([field]) => filterable || toolbarFilters.includes(field),
                ),
            ),
        [filters, filterable, toolbarFilters],
    );
    const apiFilters = useMemo(
        () => [
            ...(filterPresets?.permanent ?? EMPTY_FILTERS),
            ...fixedFilters,
            ...(activeView?.filters ?? EMPTY_FILTERS),
            ...compileGridFilters(userFilters, filterDefinitions),
        ],
        [
            filterPresets?.permanent,
            fixedFilters,
            activeView?.filters,
            userFilters,
            filterDefinitions,
        ],
    );
    const effectiveGroup = groupable ? group : "none";
    const sort = useMemo(() => {
        const allowed = (sortPresets?.permanent ?? []).filter((entry) =>
            resource.columns.some(
                (column) =>
                    column.sortable !== false &&
                    (column.sortField ?? column.field) === entry.field,
            ),
        );
        const groupSort: TableSort[] =
            effectiveGroup !== "none"
                ? [{ field: effectiveGroup, direction: "asc" }]
                : [];
        const userSort: TableSort[] = sorting.map((entry) => ({
            field:
                resource.columns.find((column) => column.field === entry.id)
                    ?.sortField ?? entry.id,
            direction: entry.desc ? "desc" : "asc",
        }));
        const seen = new Set<string>();
        return [...groupSort, ...allowed, ...userSort].filter((entry) => {
            if (seen.has(entry.field)) return false;
            seen.add(entry.field);
            return true;
        });
    }, [resource, effectiveGroup, sortPresets?.permanent, sorting]);
    const params = resourceListParams(resource, {
        query: scopedQuery,
        page: paging.mode === "server" ? pagination.pageIndex + 1 : 1,
        limit:
            paging.mode === "server"
                ? pagination.pageSize
                : SAFE_FULL_FETCH_LIMIT,
        filters: apiFilters,
        sort: sort.length ? sort : undefined,
    });
    const placeholderScope = hashKey([
        resourceKey(resource),
        paging.mode,
        fixedFilters,
        filterPresets?.permanent,
        activeView?.id,
        params.includes,
        params.aggregates,
    ]);

    const raw = useQuery<PageResult<TRecord>, Error>({
        queryKey: [...resourceKey(resource), "list", params, placeholderScope],
        queryFn: async ({ signal }) => {
            const response = (await provider.list(
                resource,
                params,
                signal,
            )) as PageResult<TRecord>;
            if (
                paging.mode !== "server" &&
                response.total > paging.maxRecords
            ) {
                throw new Error(
                    `Die Liste enthält ${response.total} Datensätze; der ${paging.mode}-Modus erlaubt höchstens ${paging.maxRecords}. Bitte serverseitige Pagination verwenden.`,
                );
            }
            return response;
        },
        enabled: enabled && (queryOptions?.enabled ?? true),
        staleTime: queryOptions?.staleTime,
        retry: queryOptions?.retry,
        refetchOnWindowFocus: queryOptions?.refetchOnWindowFocus,
        placeholderData:
            paging.mode === "server"
                ? (previous, query) =>
                      query?.queryKey.at(-1) === placeholderScope
                          ? previous
                          : undefined
                : undefined,
    });
    const result = useMemo(() => {
        if (paging.mode === "server" || !raw.data) return raw;
        const all = raw.data;
        const data =
            paging.mode === "client"
                ? all.data.slice(
                      pagination.pageIndex * pagination.pageSize,
                      (pagination.pageIndex + 1) * pagination.pageSize,
                  )
                : all.data;
        return {
            ...raw,
            data: {
                ...all,
                data,
                current_page:
                    paging.mode === "client" ? pagination.pageIndex + 1 : 1,
                last_page:
                    paging.mode === "client"
                        ? Math.max(
                              1,
                              Math.ceil(all.total / pagination.pageSize),
                          )
                        : 1,
            },
        };
    }, [raw, pagination.pageIndex, pagination.pageSize, paging.mode]);

    const groupResult = useQuery<ResourceGroupResult["data"], Error>({
        queryKey: [
            ...resourceKey(resource),
            "groups",
            providerName,
            effectiveGroup,
            scopedQuery,
            apiFilters,
        ],
        queryFn: async ({ signal }) => {
            const response = await provider.groups(
                resource,
                effectiveGroup,
                {
                    query: scopedQuery,
                    filters: apiFilters,
                },
                signal,
            );
            return response.data;
        },
        enabled:
            enabled &&
            (queryOptions?.enabled ?? true) &&
            groupable &&
            effectiveGroup !== "none" &&
            !raw.isPlaceholderData,
        staleTime: 30_000,
    });

    const setFilters = useCallback(
        (
            next: GridFilters,
            behavior: "merge" | "replace" = filterPresets?.defaultBehavior ??
                "merge",
        ) => {
            const merged = mergeTableFilters(filters, next, behavior);
            update(
                "filters",
                sanitizeGridFilters(merged, filterDefinitions),
                true,
            );
        },
        [filters, filterPresets?.defaultBehavior, filterDefinitions, update],
    );
    const setSorters = useCallback(
        (next: Updater<SortingState>) => {
            update("sorting", next, true);
        },
        [update],
    );

    const scopeKey = JSON.stringify({
        providerName,
        resource: resource.name,
        scopedQuery,
        apiFilters,
        sort,
    });
    const currentScope = useRef(scopeKey);
    currentScope.current = scopeKey;
    const [globalSelection, setGlobalSelection] = useState<TRecord[]>([]);
    useEffect(() => {
        setGlobalSelection([]);
    }, [scopeKey]);

    const selectAllFiltered = useCallback(async (): Promise<TRecord[]> => {
        if (result.isPending || result.isPlaceholderData || !result.data) {
            throw new Error("Bitte die aktuelle Abfrage zuerst laden.");
        }
        const count = result.data.total;
        if (count > SAFE_FULL_FETCH_LIMIT) {
            throw new Error(
                `Alle ${count} Treffer auszuwählen ist nicht erlaubt. Maximal ${SAFE_FULL_FETCH_LIMIT} Datensätze pro Bulk-Aktion.`,
            );
        }
        const scope = currentScope.current;
        const response = (await provider.list(resource, {
            ...params,
            page: 1,
            limit: SAFE_FULL_FETCH_LIMIT,
        })) as PageResult<TRecord>;
        if (
            scope !== currentScope.current ||
            response.total !== count ||
            response.data.length !== count ||
            new Set(response.data.map((record) => record.id)).size !== count
        ) {
            throw new Error(
                "Die Ergebnismenge hat sich verändert. Bitte die Auswahl erneut starten.",
            );
        }
        setGlobalSelection(response.data);
        return response.data;
    }, [
        result.data,
        result.isPending,
        result.isPlaceholderData,
        resource,
        provider,
        scopeKey,
    ]);

    return {
        resource,
        state,
        update,
        clearQuery,
        setFilters,
        setSorters,
        query,
        activeView,
        views,
        scopedQuery,
        filterDefinitions,
        apiFilters,
        sort,
        result,
        groupResult,
        effectiveGroup,
        paginationMode: paging.mode,
        paginationEnabled: paging.mode !== "off",
        globalSelection,
        clearGlobalSelection: () => setGlobalSelection([]),
        selectAllFiltered,
        maxSelection: SAFE_FULL_FETCH_LIMIT,
    };
}
