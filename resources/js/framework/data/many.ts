import { parseRecordId, type RecordId } from "@/framework/record-id";
import { useQuery } from "@tanstack/react-query";
import type { RecordData, ResourceDefinition } from "../types";
import type { TableQueryOptions } from "../tables/table-contract";
import type { ListParams } from "./provider";
import { resolveDataProvider } from "./provider-registry";
import { resourceKey, resourceListParams } from "./resource-key";

/** Bounded batch reader; no N+1 requests and no cross-provider detail-cache reuse. */
export function useResourceMany(
    resource: ResourceDefinition,
    ids: RecordId[],
    options: TableQueryOptions &
        Pick<ListParams, "includes" | "aggregates"> = {},
) {
    const orderedIds = [...new Set(ids)];
    const invalid =
        orderedIds.some((id) => parseRecordId(id) === undefined) ||
        orderedIds.length > 1000;
    const canonical = [...orderedIds].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
    const params = resourceListParams(resource, {
        includes: options.includes,
        aggregates: options.aggregates,
    });
    const query = useQuery({
        queryKey: [
            ...resourceKey(resource),
            "many",
            { ids: canonical, ...params },
        ],
        enabled: (options.enabled ?? true) && canonical.length > 0,
        staleTime: options.staleTime ?? 30_000,
        retry: options.retry ?? false,
        refetchOnWindowFocus: options.refetchOnWindowFocus,
        queryFn: async ({ signal }) => {
            if (invalid)
                throw new Error(
                    "Es sind maximal 1.000 gültige Datensatz-IDs erlaubt.",
                );
            const provider = resolveDataProvider(resource);
            const records = new Map<RecordId, RecordData>();
            for (let index = 0; index < canonical.length; index += 100) {
                signal.throwIfAborted();
                const batch = canonical.slice(index, index + 100);
                const page = await provider.list(
                    resource,
                    {
                        ...params,
                        limit: 100,
                        filters: [
                            { field: "id", operator: "in", value: batch },
                        ],
                    },
                    signal,
                );
                for (const row of page.data)
                    if (batch.includes(row.id)) records.set(row.id, row);
            }
            return [...records.values()];
        },
    });
    const byId = new Map(query.data?.map((record) => [record.id, record]));
    const records = orderedIds.flatMap((id) =>
        byId.has(id) ? [byId.get(id)!] : [],
    );
    return {
        ...query,
        records,
        missingIds: query.isSuccess
            ? orderedIds.filter((id) => !byId.has(id))
            : [],
    };
}
