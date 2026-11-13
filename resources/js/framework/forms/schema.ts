import { z } from "zod";
import type { FieldDefinition, Values } from "../types";
function validDate(value: unknown, month = false): boolean {
    const text = String(value);
    if (month) return /^\d{4}-(0[1-9]|1[0-2])$/.test(text);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
    const parsed = new Date(text + "T00:00:00Z");
    return (
        Number.isFinite(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === text
    );
}
export function schemaFor(fields: FieldDefinition[]) {
    return z.record(z.string(), z.unknown()).superRefine((values, ctx) => {
        for (const field of fields) {
            const value = values[field.name];
            const empty =
                value == null ||
                value === "" ||
                (Array.isArray(value) && value.length === 0);
            let error: string | undefined;
            if (field.required && empty)
                error = "Dieses Feld ist erforderlich.";
            if (!empty) {
                if (
                    ["number", "currency", "relation"].includes(
                        field.kind ?? "",
                    )
                ) {
                    if (typeof value !== "number" || !Number.isFinite(value))
                        error = "Bitte eine gültige Zahl eingeben.";
                    else if (field.min !== undefined && value < field.min)
                        error = `Mindestens ${field.min}.`;
                    else if (field.max !== undefined && value > field.max)
                        error = `Höchstens ${field.max}.`;
                    else if (
                        field.kind === "currency" &&
                        Math.abs(value * 100 - Math.round(value * 100)) >
                            0.00001
                    )
                        error = "Höchstens zwei Nachkommastellen.";
                }
                if (field.minLength && String(value).length < field.minLength)
                    error = `Mindestens ${field.minLength} Zeichen.`;
                if (field.maxLength && String(value).length > field.maxLength)
                    error = `Höchstens ${field.maxLength} Zeichen.`;
                if (
                    field.kind === "email" &&
                    !z.email().safeParse(value).success
                )
                    error = "Bitte eine gültige E-Mail-Adresse eingeben.";
                if (
                    field.options &&
                    !(Array.isArray(value)
                        ? value.every((v) =>
                              field.options!.some((o) => o.value === v),
                          )
                        : field.options.some((o) => o.value === value))
                )
                    error = "Bitte einen gültigen Eintrag auswählen.";
                if (field.kind === "date" && !validDate(value))
                    error = "Bitte ein Datum auswählen.";
                if (field.kind === "month" && !validDate(value, true))
                    error = "Bitte einen gültigen Monat auswählen.";
                if (
                    field.kind === "time" &&
                    !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(
                        String(value),
                    )
                )
                    error = "Bitte eine gültige Uhrzeit eingeben.";
                if (field.kind?.endsWith("-range")) {
                    const r = value as { from?: string; to?: string };
                    const month = field.kind === "month-range";
                    if (
                        !r ||
                        typeof r !== "object" ||
                        !validDate(r.from, month) ||
                        !validDate(r.to, month)
                    )
                        error = "Bitte Beginn und Ende auswählen.";
                    else if (r.from! > r.to!)
                        error = "Das Ende muss nach dem Beginn liegen.";
                }
                error ??= field.validate?.(value, values);
            }
            if (error)
                ctx.addIssue({
                    code: "custom",
                    path: [field.name],
                    message: error,
                });
        }
    });
}
export function initialValues(
    fields: FieldDefinition[],
    row?: Values,
    defaults?: Values,
): Values {
    return Object.fromEntries(
        fields.map((f) => {
            let value = f.writeOnly
                ? undefined
                : (defaults?.[f.name] ??
                  row?.[f.name] ??
                  f.default ??
                  (["multiselect", "checkbox-group"].includes(f.kind ?? "")
                      ? []
                      : f.kind === "checkbox"
                        ? false
                        : f.nullable
                          ? null
                          : ""));
            if (f.kind === "date" && typeof value === "string")
                value = value.slice(0, 10);
            return [f.name, value];
        }),
    );
}
