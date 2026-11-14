import type { FieldDefinition, Values } from "../types";
export function initialValues(
    fields: FieldDefinition[],
    row?: Values,
    defaults?: Values,
): Values {
    return Object.fromEntries(
        fields.map((f) => {
            let value = f.writeOnly
                ? undefined
                : defaults?.[f.name] !== undefined
                  ? defaults[f.name]
                  : row?.[f.name] !== undefined
                    ? row[f.name]
                    : (f.default ??
                      (f.multiple ||
                      [
                          "multiselect",
                          "checkbox-group",
                          "checkbox-cards",
                      ].includes(f.kind ?? "")
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
