import type { ChoiceOption } from "@/components/fields/choice-picker";

export interface ImportField {
    name: string;
    label: string;
    type: string;
    nullable: boolean;
    required: boolean;
    aliases: string[];
    options: ChoiceOption[];
    match: string[];
    matchOptions: ChoiceOption[];
    relation: { name: string; label: string } | null;
}
export interface ImportMapping {
    field: string;
    column: number;
    match?: string;
    values?: { from: string; to: string | number }[];
}
export interface ImportSchema {
    fields: ImportField[];
    template: string;
    limits: { rows: number; bytes: number };
}
export interface ImportInspection {
    fields: ImportField[];
    headers: string[];
    sample: string[][];
    count: number;
    mapping: ImportMapping[];
    values: string[][];
}
export interface ImportPreview {
    valid: boolean;
    token: string | null;
    expires_at: string | null;
    rows: {
        row: number;
        values: Record<string, string>;
        errors: Record<string, string[]>;
    }[];
}
export const normalizeImportValue = (value: string) =>
    value.trim().toLocaleLowerCase();

export function automaticImportOption(value: string, options: ChoiceOption[]) {
    const exact = options.find((option) => String(option.value) === value);
    if (exact) return exact.value;
    const normalized = normalizeImportValue(value);
    const matches = options.filter((option) =>
        [String(option.value), option.label].some(
            (text) => normalizeImportValue(text) === normalized,
        ),
    );
    return matches.length === 1 ? matches[0].value : null;
}
export function importTypeLabel(field: ImportField) {
    if (field.relation) return `Beziehung · ${field.relation.label}`;
    if (field.options.length) return "Auswahl";
    return (
        (
            {
                integer: "Ganze Zahl",
                number: "Zahl",
                boolean: "Ja / Nein",
                date: "Datum",
                datetime: "Datum und Uhrzeit",
            } as Record<string, string>
        )[field.type] ?? "Text"
    );
}
