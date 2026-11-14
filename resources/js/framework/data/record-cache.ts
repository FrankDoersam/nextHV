import type { QueryClient } from "@tanstack/react-query";
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
    // Do not overwrite a mounted editor's local form. On remount it hydrates fresh.
    client.setQueriesData<RecordData>(
        {
            predicate: (query) =>
                query.queryKey[0] === "panel" &&
                query.queryKey[2] === name &&
                query.queryKey[3] === record.id,
        },
        () => record,
    );
}
