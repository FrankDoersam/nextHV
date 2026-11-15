import type {
    Filter,
    PageResult,
    RecordData,
    ResourceDefinition,
    Values,
} from "../types";
import { ApiError, request } from "./http";
import { creationFields } from "../forms/create-relations";
export interface ListParams {
    page?: number;
    limit?: number;
    query?: string;
    includes?: ResourceDefinition["includes"];
    aggregates?: ResourceDefinition["aggregates"];
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
            ...((params.includes ?? resource.includes)
                ? { includes: params.includes ?? resource.includes }
                : {}),
            ...((params.aggregates ?? resource.aggregates)
                ? { aggregates: params.aggregates ?? resource.aggregates }
                : {}),
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
    const relations = !rows
        ? Object.fromEntries(
              (resource.createRelations ?? [])
                  .filter((definition) =>
                      Array.isArray(values[definition.relation]),
                  )
                  .map((definition) => [
                      definition.relation,
                      (values[definition.relation] as Values[]).map(
                          (entry) => ({
                              operation: "create",
                              attributes: Object.fromEntries(
                                  creationFields(definition)
                                      .filter(
                                          (field) =>
                                              entry[field.name] !== undefined,
                                      )
                                      .map((field) => [
                                          field.name,
                                          entry[field.name] === "" &&
                                          field.nullable
                                              ? null
                                              : entry[field.name],
                                      ]),
                              ),
                          }),
                      ),
                  ]),
          )
        : {};
    return {
        mutate: (rows ?? [undefined]).map((row) => ({
            operation: row ? "update" : "create",
            ...(row ? { key: row.id, version: row.updated_at } : {}),
            attributes,
            ...(Object.keys(relations).length ? { relations } : {}),
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
    async one(resource: ResourceDefinition, id: number, signal?: AbortSignal) {
        const result = await this.list(
            resource,
            {
                filters: [{ field: "id", value: id }],
                limit: 10,
            },
            signal,
        );
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
                              .map((name) => validationPath(resource, name))
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
    destroy: (resource: string, rows: RecordData[]) =>
        request(
            `/api/v1/${resource}`,
            {
                resources: rows.map((r) => r.id),
            },
            "DELETE",
        ),
    action: async (
        resource: string,
        action: string,
        rows: RecordData[],
        values: Values = {},
        signal?: AbortSignal,
    ) => {
        const path = `/api/v1/${resource}/actions/${action}`;
        const body = {
            resources: rows.map((r) => r.id),
            fields: Object.entries(values).map(([name, value]) => ({
                name,
                value,
            })),
        };
        type ActionResponse = {
            data: { impacted: number; result?: { data?: { ids: number[] } } };
        };
        try {
            return await request<ActionResponse>(path, body, "POST", signal);
        } catch (error) {
            // Only domain actions can require a signed handshake after the user's submit.
            // DELETE is a single request and never enters this path.
            if (
                !(error instanceof ApiError) ||
                error.status !== 428 ||
                !error.confirmation?.token
            )
                throw error;
            return request<ActionResponse>(path, {
                ...body,
                confirmation: error.confirmation.token,
            }, "POST", signal);
        }
    },
    summary: (
        resource: ResourceDefinition,
        metric: string,
        params: Pick<ListParams, "query" | "filters">,
        signal?: AbortSignal,
    ) =>
        request<{ data: Record<string, number | null> }>(
            `/api/v1/${resource.name}/metrics/${metric}`,
            {
                search: {
                    filters: params.filters ?? [],
                    ...(params.query ? { text: { value: params.query } } : {}),
                },
            },
            "POST",
            signal,
        ),
    /** A native Lomkit metric counts groups on the full authorized/filter-scoped query. */
    groups: (
        resource: ResourceDefinition,
        group: string,
        params: Pick<ListParams, "query" | "filters">,
        signal?: AbortSignal,
    ) =>
        request<{
            data: {
                field: string;
                total: number;
                groups: { value: string | number | null; count: number }[];
            };
        }>(
            `/api/v1/${resource.name}/metrics/groups`,
            {
                group,
                search: {
                    filters: params.filters ?? [],
                    ...(params.query ? { text: { value: params.query } } : {}),
                },
            },
            "POST",
            signal,
        ),
    overview: (id?: number, signal?: AbortSignal) =>
        request<{ data: Record<string, number | null> }>(
            "/api/v1/properties/metrics/overview",
            { search: { filters: id ? [{ field: "id", value: id }] : [] } },
            "POST",
            signal,
        ),
};
export function normalizeValidationErrors(
    errors: Record<string, string[]>,
): Record<string, string> {
    return Object.fromEntries(
        Object.entries(errors).map(([key, value]) => [
            key
                .replace(/^mutate\.\d+\./, "")
                .replace(/^relations\./, "")
                .replace(/(?:^|\.)attributes\./g, (match) =>
                    match.startsWith(".") ? "." : "",
                )
                .replace(/^fields\./, ""),
            value[0],
        ]),
    );
}
function validationPath(resource: ResourceDefinition, name: string): string {
    const relation = resource.createRelations?.find((entry) =>
        name.startsWith(`${entry.relation}.`),
    );
    if (!relation) return `mutate.0.attributes.${name}`;
    const [, index, ...field] = name.split(".");
    return `mutate.0.relations.${relation.relation}.${index}.attributes.${field.join(".")}`;
}
