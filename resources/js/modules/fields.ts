import { DeleteAction, EditAction } from "@/framework/actions";
import type { ColumnDefinition, FieldDefinition } from "@/framework/types";
import { labels } from "@/lib/format";
export const opts = (values: string[]) =>
    values.map((value) => ({ value, label: labels[value] ?? value }));
export const text = (
    name: string,
    label: string,
    group = "general",
    required = false,
): FieldDefinition => ({
    name,
    label,
    group,
    required,
    maxLength: 160,
    nullable: !required,
});
export const select = (
    name: string,
    label: string,
    values: string[],
    group = "general",
): FieldDefinition => ({
    name,
    label,
    kind: "select",
    required: true,
    clearable: false,
    options: opts(values),
    group,
    default: values[0],
});
export const relation = (
    name: string,
    label: string,
    resource: string,
    group = "general",
): FieldDefinition => ({
    name,
    label,
    kind: "relation",
    resource,
    group,
    required: true,
});
export const currency = (
    name: string,
    label: string,
    group = "finance",
): FieldDefinition => ({
    name,
    label,
    kind: "currency",
    group,
    default: 0,
    min: 0,
    max: 9999999999.99,
});
export const dateField = (
    name: string,
    label: string,
    group = "general",
    required = false,
): FieldDefinition => ({
    name,
    label,
    kind: "date",
    group,
    required,
    nullable: !required,
});
export const numeric = (
    name: string,
    label: string,
    group = "general",
    defaultValue = 0,
): FieldDefinition => ({
    name,
    label,
    kind: "number",
    group,
    default: defaultValue,
    min: 0,
});
export const code: FieldDefinition = {
    name: "code",
    label: "Nummer",
    required: true,
    maxLength: 40,
    group: "general",
};
export const notes: FieldDefinition = {
    name: "notes",
    label: "Notizen",
    kind: "textarea",
    nullable: true,
    maxLength: 10000,
    group: "details",
};
export const crud = () => [new EditAction(), new DeleteAction()];
export const col = (
    field: string,
    label: string,
    kind?: ColumnDefinition["kind"],
): ColumnDefinition => ({ field, label, kind });
