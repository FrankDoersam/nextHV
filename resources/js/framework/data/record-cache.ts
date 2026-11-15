import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { PageResult, RecordData, ResourceDefinition } from "../types";
import { resourceKey } from "./resource-key";

/** Keep unrelated rows and pages referentially stable, including filtered lists. */
export function patchRecord(
    client: QueryClient,
    resource: string | ResourceDefinition,
    record: RecordData,
) {
    const name = typeof resource === "string" ? resource : resource.name;
    const base = resourceKey(resource);
    client.setQueryData([...base, "detail", record.id], record);
    client.setQueriesData<PageResult>(
        { queryKey: [...base, "list"] },
        (page) => {
            if (!page?.data.some((row) => row.id === record.id)) return page;
            return {
                ...page,
                data: page.data.map((row) =>
                    row.id === record.id ? record : row,
                ),
            };
        },
    );
    client.setQueriesData<InfiniteData<PageResult>>(
        { queryKey: [...base, "infinite"] },
        (result) => {
            if (
                !result?.pages.some((page) =>
                    page.data.some((row) => row.id === record.id),
                )
            )
                return result;
            return {
                ...result,
                pages: result.pages.map((page) =>
                    page.data.some((row) => row.id === record.id)
                        ? {
                              ...page,
                              data: page.data.map((row) =>
                                  row.id === record.id ? record : row,
                              ),
                          }
                        : page,
                ),
            };
        },
    );
    client.setQueriesData<RecordData[]>(
        { queryKey: [...base, "many"] },
        (records) =>
            records?.some((row) => row.id === record.id)
                ? records.map((row) => (row.id === record.id ? record : row))
                : records,
    );
    // Do not overwrite a mounted editor's local form. On remount it hydrates fresh.
    client.setQueriesData<RecordData>(
        {
            predicate: (query) =>
                query.queryKey[0] === "panel" &&
                (query.queryKey[7] ?? "default") ===
                    (typeof resource === "string"
                        ? "default"
                        : (resource.dataProvider ?? "default")) &&
                query.queryKey[2] === name &&
                query.queryKey[3] === record.id,
        },
        () => record,
    );
}
