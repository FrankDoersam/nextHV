import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { PageResult, RecordData, ResourceDefinition } from "../types";
import type { ListParams } from "./provider";
import { resolveDataProvider } from "./provider-registry";
import { resourceKey, resourceListParams } from "./resource-key";
import type { TableQueryOptions } from "../tables/table-contract";

/**
 * Headless infinite resource reader. Page offsets stay server-side and use
 * native Lomkit search; callers decide whether to render a feed, cards or a grid.
 */
export function useInfiniteResourceList<
    TRecord extends RecordData = RecordData,
>(
    resource: ResourceDefinition,
    params: Omit<ListParams, "page"> = {},
    options: TableQueryOptions = {},
) {
    const provider = resolveDataProvider(resource);
    params = resourceListParams(resource, params);
    const pageSize = params.limit ?? 25;
    if (![10, 25, 50, 100].includes(pageSize)) {
        throw new Error(
            "Infinite-Listen verwenden Seitengrößen von 10, 25, 50 oder 100.",
        );
    }
    const query = useInfiniteQuery<PageResult<TRecord>, Error>({
        queryKey: [...resourceKey(resource), "infinite", params],
        initialPageParam: 1,
        queryFn: ({ pageParam, signal }) =>
            provider.list(
                resource,
                { ...params, page: Number(pageParam) },
                signal,
            ) as Promise<PageResult<TRecord>>,
        getNextPageParam: (page) =>
            page.current_page < page.last_page
                ? page.current_page + 1
                : undefined,
        enabled: options.enabled ?? true,
        retry: options.retry,
        staleTime: options.staleTime,
        refetchOnWindowFocus: options.refetchOnWindowFocus,
    });
    const records = useMemo(
        () => query.data?.pages.flatMap((page) => page.data) ?? [],
        [query.data],
    );
    return { ...query, records, total: query.data?.pages[0]?.total ?? 0 };
}
