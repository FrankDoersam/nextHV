import type {
    Filter,
    PageResult,
    RecordData,
    ResourceDefinition,
    Values,
} from "../types";
import { request } from "./http";
export interface ListParams {
    page?: number;
    limit?: number;
    query?: string;
    filters?: Filter[];
    sort?: { field: string; direction: "asc" | "desc" }[];
}
export function searchPayload(
    resource: ResourceDefinition,
    params: ListParams = {},
) {
    // A unique tie-breaker keeps equal dates/statuses deterministic across pages.
    const sorts = params.sort ?? [];
    return {
        search: {
            page: params.page ?? 1,
            limit: params.limit ?? 25,
            filters: params.filters ?? [],
            sorts: sorts.some((sort) => sort.field === "id")
                ? sorts
                : [...sorts, { field: "id", direction: "desc" }],
            ...(params.query ? { text: { value: params.query } } : {}),
            ...(resource.includes ? { includes: resource.includes } : {}),
            ...(resource.aggregates ? { aggregates: resource.aggregates } : {}),
        },
    };
}
/** Use exactly the same native REST payload for validation, single saves and atomic bulk updates. */
export function mutationPayload(
    resource: ResourceDefinition,
    values: Values,
    rows?: RecordData[],
) {
    const attributes = Object.fromEntries(
        resource.fields
            .filter(
                (f) =>
                    !(rows && f.readonlyOnEdit) && values[f.name] !== undefined,
            )
            .map((f) => [
                f.name,
                values[f.name] === "" && f.nullable ? null : values[f.name],
            ]),
    );
    return {
        mutate: (rows ?? [undefined]).map((row) => ({
            operation: row ? "update" : "create",
            ...(row ? { key: row.id, version: row.updated_at } : {}),
            attributes,
        })),
        response: {
            ...(resource.includes ? { includes: resource.includes } : {}),
            ...(resource.aggregates ? { aggregates: resource.aggregates } : {}),
        },
    };
}
export const dataProvider = {
    list: (
        resource: ResourceDefinition,
        params: ListParams = {},
        signal?: AbortSignal,
    ) =>
        request<PageResult>(
            `/api/v1/${resource.name}/search`,
            searchPayload(resource, params),
            "POST",
            signal,
        ),
    async one(resource: ResourceDefinition, id: number) {
        const result = await this.list(resource, {
            filters: [{ field: "id", value: id }],
            limit: 10,
        });
        if (!result.data[0]) throw new Error("Datensatz nicht gefunden.");
        return result.data[0];
    },
    async save(resource: ResourceDefinition, values: Values, row?: RecordData) {
        const result = await request<{ records: RecordData[] }>(
            `/api/v1/${resource.name}/mutate`,
            mutationPayload(resource, values, row ? [row] : undefined),
        );
        return result.records[0];
    },
    validate: (
        resource: ResourceDefinition,
        values: Values,
        row?: RecordData,
        only?: string[],
    ) =>
        request<void>(
            `/api/v1/${resource.name}/mutate`,
            mutationPayload(resource, values, row ? [row] : undefined),
            "POST",
            undefined,
            {
                Precognition: "true",
                ...(only?.length
                    ? {
                          "Precognition-Validate-Only": only
                              .map((name) => `mutate.0.attributes.${name}`)
                              .join(","),
                      }
                    : {}),
            },
        ),
    saveMany: (
        resource: ResourceDefinition,
        values: Values,
        rows: RecordData[],
    ) =>
        request<{ records: RecordData[] }>(
            `/api/v1/${resource.name}/mutate`,
            mutationPayload(resource, values, rows),
        ),
    destroy: (resource: string, rows: RecordData[], confirmation?: string) =>
        request(
            `/api/v1/${resource}`,
            {
                resources: rows.map((r) => r.id),
                ...(confirmation ? { confirmation } : {}),
            },
            "DELETE",
        ),
    action: (
        resource: string,
        action: string,
        rows: RecordData[],
        values: Values = {},
        confirmation?: string,
    ) =>
        request<{
            data: { impacted: number; result?: { data?: { ids: number[] } } };
        }>(`/api/v1/${resource}/actions/${action}`, {
            resources: rows.map((r) => r.id),
            fields: Object.entries(values).map(([name, value]) => ({
                name,
                value,
            })),
            ...(confirmation ? { confirmation } : {}),
        }),
    overview: (id?: number) =>
        request<{ data: Record<string, number | null> }>(
            "/api/v1/properties/metrics/overview",
            { search: { filters: id ? [{ field: "id", value: id }] : [] } },
        ),
};
export function normalizeValidationErrors(
    errors: Record<string, string[]>,
): Record<string, string> {
    return Object.fromEntries(
        Object.entries(errors).map(([key, value]) => [
            key
                .replace(/^mutate\.\d+\.attributes\./, "")
                .replace(/^fields\./, ""),
            value[0],
        ]),
    );
}
