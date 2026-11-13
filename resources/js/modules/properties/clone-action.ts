import { request } from "@/framework/data/http";
import { ResourceAction } from "@/framework/actions";
import { dataProvider } from "@/framework/data/provider";
import type { ActionContext, FieldDefinition } from "@/framework/types";
export class CloneAction extends ResourceAction {
    id = "clone";
    label = "Duplizieren";
    location = "row" as const;
    fields: FieldDefinition[] = [
        { name: "code", label: "Neue Nummer", required: true, maxLength: 40 },
        {
            name: "name",
            label: "Neue Bezeichnung",
            required: true,
            maxLength: 160,
        },
    ];
    constructor(private withUnits = false) {
        super();
        if (withUnits)
            this.fields.push({
                name: "with_units",
                label: "Einheiten mitkopieren (ohne Verträge)",
                kind: "checkbox",
                default: true,
            });
    }
    async prepare({ resource, rows }: ActionContext) {
        const response = await request<{
            data: import("@/framework/types").Values;
        }>(`/api/v1/${resource.name}/${rows[0].id}/clone-defaults`);
        return { defaults: response.data };
    }
    async execute(
        { rows, resource, values }: ActionContext,
        confirmation?: string,
    ) {
        return dataProvider.action(
            resource.name,
            this.id,
            rows,
            values,
            confirmation,
        );
    }
}
