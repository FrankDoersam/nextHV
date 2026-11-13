import type {
    Filter,
    PageResult,
    RecordData,
    ResourceDefinition,
    CrudMetadata,
    Values,
} from "../types";
import { request } from "./http";
import type { ActionFeedback } from "../action-feedback";
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
    return {
        search: {
            page: params.page ?? 1,
            limit: params.limit ?? 25,
            filters: params.filters ?? [],
            sorts: params.sort ?? [{ field: "id", direction: "desc" }],
            ...(params.query ? { text: { value: params.query } } : {}),
            ...(resource.includes ? { includes: resource.includes } : {}),
            ...(resource.aggregates ? { aggregates: resource.aggregates } : {}),
        },
    };
}
export const dataProvider = {
    metadata: (resource: string) =>
        request<{ data: CrudMetadata }>("/api/v1/_meta/resources/" + encodeURIComponent(resource)),
    list: (resource: ResourceDefinition, params: ListParams = {}) =>
        request<PageResult>(
            `/api/v1/${resource.name}/search`,
            searchPayload(resource, params),
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
        const attributes = Object.fromEntries(
            resource.fields
                .filter((f) => !f.readOnly && !(row && f.readonlyOnEdit))
                .filter((f) => values[f.name] !== undefined)
                .map((f) => [
                    f.name,
                    values[f.name] === "" && f.nullable ? null : values[f.name],
                ]),
        );
        const result = await request<{ records: RecordData[] }>(
            `/api/v1/${resource.name}/mutate`,
            {
                mutate: [
                    {
                        operation: row ? "update" : "create",
                        ...(row
                            ? { key: row.id, version: row.updated_at }
                            : {}),
                        attributes,
                    },
                ],
                response: {},
            },
        );
        return result.records[0];
    },
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
            data: { impacted: number; result?: { data?: ActionFeedback } };
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
                .replace(/^mutate\.0\.attributes\./, "")
                .replace(/^fields\./, ""),
            value[0],
        ]),
    );
}
