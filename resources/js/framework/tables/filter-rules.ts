import type { Filter, FilterDefinition, ResourceDefinition } from "../types";
export type GridFilterOperator = NonNullable<
    FilterDefinition["operators"]
>[number];
export interface GridFilter {
    operator: GridFilterOperator;
    values: string[];
}
export type GridFilters = Record<string, GridFilter>;
export type GridFilterDefinition = FilterDefinition;

/** Table columns are the UI schema. Explicit definitions extend or override inferred ones. */
export function columnFilters(
    resource: ResourceDefinition,
): GridFilterDefinition[] {
    const definitions = new Map<string, GridFilterDefinition>();
    for (const column of resource.columns) {
        if (column.filter === false) continue;
        const field = resource.fields.find((f) => f.name === column.field);
        if (field?.writeOnly) continue;
        const options = field?.options?.map((o) => ({
            value: String(o.value),
            label: o.label,
        }));
        const kind = options?.length
            ? "choice"
            : column.kind === "date" || field?.kind === "date"
              ? "date"
              : ["number", "currency"].includes(
                      column.kind ?? field?.kind ?? "",
                  )
                ? "number"
                : "text";
        const definition: GridFilterDefinition = {
            field: column.field,
            label: column.label,
            kind,
            options,
            nullable: field?.nullable ?? kind === "date",
            ...column.filter,
        };
        definitions.set(definition.field, definition);
    }
    for (const definition of resource.filters ?? [])
        definitions.set(definition.field, definition);
    return [...definitions.values()];
}
export function filterOperators(
    field: GridFilterDefinition,
): GridFilterOperator[] {
    if (field.operators) return field.operators;
    const operators: GridFilterOperator[] =
        !field.kind || field.kind === "choice"
            ? ["in", "not in"]
            : field.kind === "text"
              ? ["=", "!=", "contains", "not contains"]
              : ["=", "!=", ">", ">=", "<", "<=", "between"];
    return field.nullable
        ? [...operators, "is null", "is not null"]
        : operators;
}
export const nullOperator = (operator: GridFilterOperator) =>
    operator === "is null" || operator === "is not null";
const validDate = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
export function sanitizeGridFilters(
    raw: unknown,
    definitions: GridFilterDefinition[] = [],
): GridFilters {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return Object.fromEntries(
        definitions.flatMap((definition) => {
            const entry = (raw as Record<string, unknown>)[definition.field];
            const rule =
                entry && typeof entry === "object" && !Array.isArray(entry)
                    ? (entry as Record<string, unknown>)
                    : undefined;
            const allowed = filterOperators(definition);
            const operator = (rule?.operator ??
                allowed[0]) as GridFilterOperator;
            if (!allowed.includes(operator)) return [];
            if (rule && nullOperator(operator))
                return [[definition.field, { operator, values: [] }]];
            const candidates = rule
                ? rule.values
                : typeof entry === "string"
                  ? [entry]
                  : entry;
            const checked = Array.isArray(candidates)
                ? candidates.filter((v): v is string => {
                      if (typeof v !== "string" || !v.trim() || v.length > 200)
                          return false;
                      if (definition.kind === "number")
                          return (
                              /^-?(?:\d+\.?\d*|\.\d+)$/.test(v) &&
                              Number.isFinite(Number(v))
                          );
                      if (definition.kind === "date") return validDate(v);
                      return (
                          definition.kind === "text" ||
                          !!definition.options?.some((o) => o.value === v)
                      );
                  })
                : [];
            const values =
                operator === "between" ? checked : [...new Set(checked)];
            const count =
                operator === "between"
                    ? 2
                    : ["in", "not in"].includes(operator)
                      ? 100
                      : 1;
            if (
                !values.length ||
                (operator === "between" &&
                    (values.length !== 2 ||
                        (definition.kind === "number"
                            ? Number(values[0]) > Number(values[1])
                            : values[0] > values[1])))
            )
                return [];
            return [
                [
                    definition.field,
                    { operator, values: values.slice(0, count) },
                ],
            ];
        }),
    );
}
/** OR within options, AND across columns. Values remain bound parameters on the API. */
export function compileGridFilters(
    filters: GridFilters,
    definitions: GridFilterDefinition[] = [],
): Filter[] {
    return Object.entries(filters).flatMap<Filter>(([field, rule]) => {
        if (nullOperator(rule.operator))
            return [{ field, operator: rule.operator }];
        if (!rule.values.length) return [];
        const kind = definitions.find((d) => d.field === field)?.kind;
        const values = rule.values.map((v) =>
            kind === "number" ? Number(v) : v,
        );
        const pattern = ["contains", "not contains"].includes(rule.operator);
        return [
            {
                field,
                operator: pattern
                    ? rule.operator === "contains"
                        ? "like"
                        : "not like"
                    : rule.operator,
                value: pattern
                    ? `%${rule.values[0]}%`
                    : ["in", "not in", "between"].includes(rule.operator)
                      ? values
                      : values[0],
            },
        ];
    });
}
