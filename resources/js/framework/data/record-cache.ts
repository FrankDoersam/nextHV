import type { QueryClient } from "@tanstack/react-query";
import type { PageResult, RecordData } from "../types";

/** Keep unrelated rows and pages referentially stable, including filtered lists. */
export function patchRecord(
    client: QueryClient,
    resource: string,
    record: RecordData,
) {
    client.setQueryData(["resources", resource, "detail", record.id], record);
    client.setQueriesData<PageResult>(
        { queryKey: ["resources", resource, "list"] },
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
                query.queryKey[2] === resource &&
                query.queryKey[3] === record.id,
        },
        () => record,
    );
}
