import { ResourceAction } from "@/framework/actions";
import { dataProvider } from "@/framework/data/provider";
import type { ActionContext, FieldDefinition } from "@/framework/types";

export class PartnerSummaryAction extends ResourceAction {
    id = "summary";
    label = "Geschäftspartnerübersicht";
    location = "row" as const;
    fields: FieldDefinition[] = [
        {
            name: "include_roles",
            label: "Rollen anzeigen",
            kind: "checkbox",
            default: true,
        },
    ];

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
