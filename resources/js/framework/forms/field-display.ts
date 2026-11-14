import type { FieldDefinition, RecordData } from "../types";
import { date, label, money } from "@/lib/format";
/** Shared read presentation for detail cards and editable properties. */
export function formatFieldValue(
    field: FieldDefinition,
    record: RecordData,
): string {
    const value = record[field.name];
    if (value == null || value === "") return "—";
    if (field.kind === "date") return date(value);
    if (field.kind === "currency") return money(value);
    if (field.kind === "checkbox") return value ? "Ja" : "Nein";
    const option = (item: unknown) =>
        field.options?.find((o) => o.value === item)?.label ?? label(item);
    if (Array.isArray(value)) return value.map(option).join(", ");
    if (field.kind === "relation") {
        const related = record[field.name.replace(/_id$/, "")] as
            Record<string, unknown> | undefined;
        return String(
            related?.display_name ??
                related?.name ??
                related?.code ??
                `#${value}`,
        );
    }
    return option(value);
}
