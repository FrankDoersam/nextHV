import { parseRecordId } from "@/framework/record-id";
import { ChoicePicker } from "@/components/fields/choice-picker";
import { RelationPicker } from "@/components/fields/entity-picker";
import type { FilterDefinition } from "../types";
import { filterOperators, type GridFilters } from "./filter-rules";
export function supportsDirectFilter(field: FilterDefinition) {
    return (
        ["choice", "relation", undefined].includes(field.kind) &&
        filterOperators(field).some(
            (operator) => operator === "in" || operator === "=",
        )
    );
}
/** Direct controls reuse existing filter definitions and the same URL state as builder chips. */
export function DirectFilters({
    definitions,
    value,
    onChange,
}: {
    definitions: FilterDefinition[];
    value: GridFilters;
    onChange: (filters: GridFilters) => void;
}) {
    return (
        <>
            {definitions.map((field) => {
                if (!supportsDirectFilter(field)) return null;
                const operator = filterOperators(field).includes("in")
                    ? "in"
                    : "=";
                const multiple = operator === "in" && (field.multiple ?? false);
                const selected = value[field.field]?.values ?? [];
                const update = (next: unknown) => {
                    const values = (
                        Array.isArray(next) ? next : next == null ? [] : [next]
                    ).map(String);
                    const filters = { ...value };
                    if (values.length)
                        filters[field.field] = { operator, values };
                    else delete filters[field.field];
                    onChange(filters);
                };
                const shared = {
                    "aria-label": `${field.label} filtern`,
                    placeholder: `Alle · ${field.label}`,
                    clearable: field.clearable ?? true,
                    multiple,
                    onChange: update,
                };
                return (
                    <div key={field.field} className="w-full min-w-0 sm:w-48">
                        {field.kind === "relation" && field.resource ? (
                            <RelationPicker
                                {...shared}
                                resource={field.resource}
                                labelField={field.labelField}
                                filters={field.filters}
                                creatable={false}
                                value={
                                    multiple
                                        ? selected.map(parseRecordId)
                                        : selected[0]
                                          ? parseRecordId(selected[0])
                                          : null
                                }
                            />
                        ) : (
                            <ChoicePicker
                                {...shared}
                                presentation="menu"
                                options={field.options}
                                value={
                                    multiple ? selected : (selected[0] ?? null)
                                }
                            />
                        )}
                    </div>
                );
            })}
        </>
    );
}
