import type { Filter, ResourceDefinition } from "../types";

export type GridFilterOperator = "in" | "not in" | "=" | "!=";
export interface GridFilter {
    operator: GridFilterOperator;
    values: string[];
}
export type GridFilters = Record<string, GridFilter>;
export type GridFilterDefinition = NonNullable<
    ResourceDefinition["filters"]
>[number];

/** Read old faceted URLs too; only registered fields, operators and values survive. */
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
            const allowed =
                definition.kind === "text" ? ["=", "!="] : ["in", "not in"];
            if (rule && !allowed.includes(String(rule.operator))) return [];
            const candidates = rule
                ? rule.values
                : typeof entry === "string"
                  ? [entry]
                  : entry;
            const values = Array.isArray(candidates)
                ? [
                      ...new Set(
                          candidates.filter(
                              (value): value is string =>
                                  typeof value === "string" &&
                                  (definition.kind === "text"
                                      ? value.trim().length > 0 &&
                                        value.length <= 200
                                      : !!definition.options?.some(
                                            (option) => option.value === value,
                                        )),
                          ),
                      ),
                  ]
                : [];
            return values.length
                ? [
                      [
                          definition.field,
                          {
                              operator: (rule?.operator ??
                                  (definition.kind === "text"
                                      ? "="
                                      : "in")) as GridFilterOperator,
                              values:
                                  definition.kind === "text"
                                      ? values.slice(0, 1)
                                      : values,
                          },
                      ],
                  ]
                : [];
        }),
    );
}

/** OR within a value set, AND between fields. Incomplete chips never constrain a query. */
export function compileGridFilters(filters: GridFilters): Filter[] {
    return Object.entries(filters).flatMap(([field, rule]) =>
        rule.values.length
            ? [
                  {
                      field,
                      operator: rule.operator,
                      value: ["=", "!="].includes(rule.operator)
                          ? rule.values[0]
                          : rule.values,
                  },
              ]
            : [],
    );
}
