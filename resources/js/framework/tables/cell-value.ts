import { label } from "@/lib/format";
import type { ColumnDefinition, RecordData } from "../types";
export function recordValue(
    row: RecordData | Record<string, unknown>,
    path: string,
): unknown {
    if (Object.prototype.hasOwnProperty.call(row, path)) return row[path];
    return path
        .split(".")
        .reduce<unknown>(
            (value, key) =>
                value && typeof value === "object"
                    ? (value as Record<string, unknown>)[key]
                    : undefined,
            row,
        );
}
export function cellText(
    row: RecordData,
    source: string | ((row: RecordData) => string) | undefined,
    fallback?: string,
): string {
    const value =
        typeof source === "function"
            ? source(row)
            : source
              ? recordValue(row, source)
              : fallback
                ? recordValue(row, fallback)
                : undefined;
    return value == null ? "" : String(value);
}
export function cellItems(
    row: RecordData,
    column: ColumnDefinition,
): unknown[] {
    const source = column.cell?.items;
    const value =
        typeof source === "function"
            ? source(row)
            : recordValue(row, source ?? column.field);
    return Array.isArray(value) ? value : value == null ? [] : [value];
}
export function optionLabel(
    value: unknown,
    column: ColumnDefinition,
): string | undefined {
    return (
        (
            column.options ??
            (column.filter ? column.filter.options : undefined)
        )?.find((option) => String(option.value) === String(value))?.label ??
        (column.kind === "badge" ? label(value) : undefined)
    );
}
export function exportColumnValue(
    row: RecordData,
    column: ColumnDefinition,
): unknown {
    if (column.exportValue) return column.exportValue(row);
    if (column.cell?.type === "avatars" || column.cell?.type === "tags")
        return cellItems(row, column)
            .map((item) =>
                typeof item === "object" && item
                    ? ((item as Record<string, unknown>)[
                          column.cell?.nameField ?? "name"
                      ] ??
                      (item as Record<string, unknown>).label ??
                      "")
                    : (optionLabel(item, column) ?? item),
            )
            .join(", ");
    const value = recordValue(row, column.field);
    if (value == null) return "";
    if (typeof value === "boolean") return value ? "Ja" : "Nein";
    return (
        optionLabel(value, column) ??
        (column.cell?.primary
            ? cellText(row, column.cell.primary, column.field)
            : value)
    );
}
