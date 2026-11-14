import type {
    ColumnDefinition,
    FieldDefinition,
    Filter,
    FilterDefinition,
    ResourceDefinition,
} from "../types";
import { registerLabels } from "@/lib/format";
import { request } from "./http";

type Option = { value: string | number; label: string };
interface NativeField {
    name: string;
    type: string;
    nullable: boolean;
    select: boolean;
    sort: boolean;
    create: boolean;
    update: boolean;
    filter: { operators: string[] };
    rules: { all: string[]; create: string[]; update: string[] };
}
interface RelationMetadata {
    relation: string;
    responseKey: string;
    resource: string;
    labelField: string;
    filters: Filter[];
    /** A form may limit assignments while collection filters still include historic records. */
    filterFilters?: Filter[];
    creatable: boolean;
    multiple?: boolean;
    clearable?: boolean;
}
export interface ResourceSchema {
    fields: NativeField[];
    meta: {
        ui: {
            version: 1;
            picker?: ResourceDefinition["picker"];
            fields: Record<
                string,
                {
                    options: Option[];
                    offeredOptions: Option[];
                    default?: unknown;
                }
            >;
            relations: Record<string, RelationMetadata>;
            labels: Record<string, string>;
        };
    };
}
const DETAILS =
    "?with=fields.capabilities,fields.filter,fields.rules,fields.meta,relations";
const CACHE_PREFIX = "nexthv:resource-schema:v1:";
const CACHE_TTL = 5 * 60 * 1000;
const isObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
const strings = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((entry) => typeof entry === "string");
const choices = (value: unknown): value is Option[] =>
    Array.isArray(value) &&
    value.every(
        (option) =>
            isObject(option) &&
            ["string", "number"].includes(typeof option.value) &&
            typeof option.label === "string",
    );

/** Validate the contract, including persisted metadata. Never render an empty fallback schema. */
export function parseResourceSchema(raw: unknown): ResourceSchema {
    const ui = isObject(raw) && isObject(raw.meta) && raw.meta.ui;
    if (
        !isObject(raw) ||
        !Array.isArray(raw.fields) ||
        !isObject(ui) ||
        ui.version !== 1 ||
        (ui.picker !== undefined &&
            (!isObject(ui.picker) ||
                !strings(ui.picker.secondaryFields) ||
                (ui.picker.includes !== undefined &&
                    (!Array.isArray(ui.picker.includes) ||
                        !ui.picker.includes.every(
                            (include) =>
                                isObject(include) &&
                                typeof include.relation === "string",
                        ))))) ||
        !isObject(ui.fields) ||
        !isObject(ui.relations) ||
        !isObject(ui.labels) ||
        !Object.values(ui.labels).every((value) => typeof value === "string") ||
        !Object.values(ui.fields).every(
            (field) =>
                isObject(field) &&
                choices(field.options) &&
                choices(field.offeredOptions),
        ) ||
        !Object.values(ui.relations).every(
            (relation) =>
                isObject(relation) &&
                [
                    relation.relation,
                    relation.responseKey,
                    relation.resource,
                    relation.labelField,
                ].every((value) => typeof value === "string") &&
                Array.isArray(relation.filters) &&
                typeof relation.creatable === "boolean",
        ) ||
        !raw.fields.every(
            (field) =>
                isObject(field) &&
                typeof field.name === "string" &&
                typeof field.type === "string" &&
                [
                    field.nullable,
                    field.select,
                    field.sort,
                    field.create,
                    field.update,
                ].every((value) => typeof value === "boolean") &&
                isObject(field.filter) &&
                strings(field.filter.operators) &&
                isObject(field.rules) &&
                strings(field.rules.all) &&
                strings(field.rules.create) &&
                strings(field.rules.update),
        )
    ) {
        throw new Error(
            "Die Ressourcenbeschreibung ist unvollständig. Bitte erneut laden.",
        );
    }
    return raw as unknown as ResourceSchema;
}

function cacheKey(userId: number) {
    // Vite's hashed module URL invalidates metadata when a new frontend build is deployed.
    return `${CACHE_PREFIX}${userId}:${import.meta.url}`;
}
export function clearResourceSchemaCache() {
    try {
        for (const key of Object.keys(sessionStorage))
            if (key.startsWith(CACHE_PREFIX)) sessionStorage.removeItem(key);
    } catch {
        /* Storage can be disabled; the in-memory QueryClient is cleared by AuthProvider. */
    }
}
export async function loadResourceSchemas(
    resources: ResourceDefinition[],
    userId: number,
    signal?: AbortSignal,
): Promise<Record<string, ResourceSchema>> {
    try {
        const cache = JSON.parse(
            sessionStorage.getItem(cacheKey(userId)) ?? "null",
        );
        if (
            isObject(cache) &&
            typeof cache.expires === "number" &&
            cache.expires > Date.now() &&
            isObject(cache.schemas)
        ) {
            return Object.fromEntries(
                resources.map(({ name }) => [
                    name,
                    parseResourceSchema(
                        (cache.schemas as Record<string, unknown>)[name],
                    ),
                ]),
            );
        }
    } catch {
        /* Missing, expired or invalid metadata is refetched as one bootstrap operation. */
    }
    const entries = await Promise.all(
        resources.map(async ({ name }) => {
            const response = await request<{ data: unknown }>(
                `/api/v1/${name}${DETAILS}`,
                undefined,
                "GET",
                signal,
            );
            return [name, parseResourceSchema(response.data)] as const;
        }),
    );
    const schemas = Object.fromEntries(entries);
    try {
        sessionStorage.setItem(
            cacheKey(userId),
            JSON.stringify({ expires: Date.now() + CACHE_TTL, schemas }),
        );
    } catch {
        /* Storage is optional, correctness is not. */
    }
    return schemas;
}

type Operator = NonNullable<FilterDefinition["operators"]>[number];
const supported: Operator[] = [
    "in",
    "not in",
    "=",
    "!=",
    "contains",
    "not contains",
    ">",
    ">=",
    "<",
    "<=",
    "between",
    "is null",
    "is not null",
];
function operators(native: NativeField, requested?: Operator[]): Operator[] {
    const allowed = native.filter.operators.map((operator) =>
        operator === "like"
            ? "contains"
            : operator === "not like"
              ? "not contains"
              : operator,
    );
    return (requested ?? supported).filter((operator) =>
        allowed.includes(operator),
    );
}
function inferFilterKind(field: NativeField): FilterDefinition["kind"] {
    if (["number", "integer", "float", "decimal"].includes(field.type))
        return "number";
    if (["date", "datetime"].includes(field.type)) return "date";
    return "text";
}
function nativeField(schema: ResourceSchema, name: string) {
    return schema.fields.find((field) => field.name === name);
}
/** A relation column can sort only when explicitly opted in and its exposed target field allows sorting.
 *  The server checks the relation type and permission again on every search. */
function columnSort(
    column: ColumnDefinition,
    schema: ResourceSchema,
    schemas: Record<string, ResourceSchema>,
): Pick<ColumnDefinition, "sortable" | "sortField"> {
    if (column.sortable === false) return { sortable: false };
    const direct = nativeField(schema, column.field);
    if (direct) return { sortable: direct.sort };
    if (column.sortable !== true) return { sortable: false };
    const [prefix, field, ...remaining] = column.field.split(".");
    if (!field || remaining.length) return { sortable: false };
    const relation = Object.values(schema.meta.ui.relations).find(
        (entry) => [entry.relation, entry.responseKey].includes(prefix),
    );
    const target = relation && schemas[relation.resource];
    const relatedField = target && nativeField(target, field);
    return relatedField?.sort
        ? { sortable: true, sortField: `${relation!.relation}.${field}` }
        : { sortable: false };
}
function hydrateField(
    field: FieldDefinition,
    schema: ResourceSchema,
): FieldDefinition {
    const native = nativeField(schema, field.name);
    if (!native)
        throw new Error(
            `Das Formularfeld ${field.name} fehlt in der REST-Beschreibung.`,
        );
    const choice = schema.meta.ui.fields[field.name];
    const relation = schema.meta.ui.relations[field.name];
    if (field.kind === "relation" && !relation && !field.resource)
        throw new Error(
            `Der Relationsbezug für ${field.label} fehlt in der REST-Beschreibung.`,
        );
    if (
        [
            "select",
            "multiselect",
            "choice-buttons",
            "checkbox-group",
            "checkbox-cards",
        ].includes(field.kind ?? "") &&
        !choice &&
        !field.options
    )
        throw new Error(
            `Die Auswahlwerte für ${field.label} fehlen in der REST-Beschreibung.`,
        );
    const result: FieldDefinition = {
        ...field,
        nullable: native.nullable,
        readonlyOnEdit: field.readonlyOnEdit || !native.update,
        disabled: field.disabled || (!native.create && !native.update),
    };
    if (choice) {
        result.options = choice.offeredOptions.map((option) => ({
            ...field.options?.find(
                (presentation) => presentation.value === option.value,
            ),
            ...option,
        }));
        if (field.default === undefined) result.default = choice.default;
    }
    if (relation)
        Object.assign(result, {
            resource: relation.resource,
            labelField: field.labelField ?? relation.labelField,
            filters: relation.filters,
            creatable: relation.creatable,
            multiple: field.multiple ?? relation.multiple,
            clearable: field.clearable ?? relation.clearable,
        });
    // Rules remain server-side. These hints only control required markers and input affordances.
    const rules = [...native.rules.all, ...native.rules.create];
    result.required =
        rules.includes("required") || (field.required && !native.nullable);
    for (const rule of native.rules.all) {
        const match = /^(min|max):(\d+(?:\.\d+)?)$/.exec(rule);
        if (!match) continue;
        const key = ["number", "integer", "float", "decimal"].includes(
            native.type,
        )
            ? (match[1] as "min" | "max")
            : ["text", "string"].includes(native.type)
              ? (`${match[1]}Length` as "minLength" | "maxLength")
              : undefined;
        if (key) result[key] = Number(match[2]);
    }
    return result;
}

function hydrateFilter(
    definition: FilterDefinition,
    schema: ResourceSchema,
    schemas: Record<string, ResourceSchema>,
): FilterDefinition | false {
    const prefix = definition.field.split(".")[0];
    const entry = Object.entries(schema.meta.ui.relations).find(
        ([key, relation]) =>
            key === definition.field ||
            relation.relation === prefix ||
            relation.responseKey === prefix,
    );
    const relation = entry?.[1];
    // An explicit text filter keeps relation.name searchable; the default column becomes an ID picker.
    const relationPicker =
        relation && (!definition.kind || definition.kind === "relation");
    const targetName = relationPicker ? entry![0] : definition.field;
    let native = nativeField(schema, targetName);
    if (!native && relation && definition.field.includes("."))
        native = schemas[relation.resource]?.fields.find(
            (field) =>
                field.name === definition.field.split(".").slice(1).join("."),
        );
    if (!native || !native.filter.operators.length) return false;
    const optionSet = schema.meta.ui.fields[targetName]?.options;
    const kind = relationPicker
        ? "relation"
        : (definition.kind ?? (optionSet ? "choice" : inferFilterKind(native)));
    const result: FilterDefinition = {
        ...definition,
        field: relationPicker
            ? targetName
            : relation
              ? definition.field.replace(
                    `${relation.responseKey}.`,
                    `${relation.relation}.`,
                )
              : definition.field,
        kind,
        nullable: native.nullable,
        options:
            optionSet?.map((option) => ({
                value: String(option.value),
                label: option.label,
            })) ?? definition.options,
        operators: operators(
            native,
            definition.operators ??
                (kind === "choice" || kind === "relation"
                    ? ["in", "not in", "=", "!=", "is null", "is not null"]
                    : kind === "text"
                      ? [
                            "=",
                            "!=",
                            "contains",
                            "not contains",
                            "is null",
                            "is not null",
                        ]
                      : [
                            "=",
                            "!=",
                            ">",
                            ">=",
                            "<",
                            "<=",
                            "between",
                            "is null",
                            "is not null",
                        ]),
        ),
    };
    if (relationPicker)
        Object.assign(result, {
            resource: relation.resource,
            labelField: relation.labelField,
            filters: relation.filterFilters ?? [],
            creatable: false,
            multiple: definition.multiple ?? true,
            clearable: definition.clearable ?? true,
        });
    return result.operators?.length ? result : false;
}

const templates = new WeakMap<ResourceDefinition, ResourceDefinition>();
/** Hydrates the registered singleton definitions atomically, before any form/workbench can mount. */
export function hydrateResources(
    resources: ResourceDefinition[],
    schemas: Record<string, ResourceSchema>,
) {
    const prepared = resources.map((resource) => {
        const schema = schemas[resource.name];
        if (!schema)
            throw new Error(
                `Die Ressourcenbeschreibung für ${resource.label} fehlt.`,
            );
        let template = templates.get(resource);
        if (!template) {
            template = {
                ...resource,
                fields: [...resource.fields],
                columns: [...resource.columns],
                filters: resource.filters && [...resource.filters],
            };
            templates.set(resource, template);
        }
        const columns: ColumnDefinition[] = template.columns.map((column) => ({
            ...column,
            options:
                schema.meta.ui.fields[column.field]?.options ?? column.options,
            ...columnSort(column, schema, schemas),
            filter:
                column.filter === false
                    ? false
                    : hydrateFilter(
                          {
                              field: column.field,
                              label: column.label,
                              ...column.filter,
                          },
                          schema,
                          schemas,
                      ),
        }));
        const filters = template.filters?.flatMap((filter) => {
            const hydrated = hydrateFilter(filter, schema, schemas);
            return hydrated ? [hydrated] : [];
        });
        return {
            resource,
            picker: schema.meta.ui.picker ?? template.picker,
            fields: template.fields.map((field) => hydrateField(field, schema)),
            columns,
            filters,
        };
    });
    registerLabels(
        Object.assign(
            {},
            ...Object.values(schemas).map((schema) => schema.meta.ui.labels),
        ),
    );
    for (const { resource, ...metadata } of prepared)
        Object.assign(resource, metadata);
}
