import { ResourceAction } from "@/framework/actions";
import { dataProvider } from "@/framework/data/provider";
import type { ActionContext, FieldDefinition } from "@/framework/types";
import { dateField } from "@/modules/fields";
export class ConfirmTerminationAction extends ResourceAction {
    id = "confirm";
    label = "Kündigung bestätigen";
    location = "row" as const;
    fields: FieldDefinition[] = [
        dateField(
            "confirmed_end_on",
            "Bestätigtes Vertragsende",
            "general",
            true,
        ),
    ];
    visible(row?: import("@/framework/types").RecordData) {
        return row?.status === "received";
    }
    execute({ resource, rows, values }: ActionContext, confirmation?: string) {
        return dataProvider.action(
            resource.name,
            this.id,
            rows,
            values,
            confirmation,
        );
    }
}
