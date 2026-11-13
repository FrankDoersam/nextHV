import { ResourceAction } from "@/framework/actions";
import { dataProvider } from "@/framework/data/provider";
import type { ActionContext, RecordData } from "@/framework/types";
export class ActivateContractAction extends ResourceAction {
    id = "activate";
    label = "Vertrag aktivieren";
    location = "row" as const;
    visible(row?: RecordData) {
        return row?.status === "draft";
    }
    async execute({ rows, resource }: ActionContext, confirmation?: string) {
        return dataProvider.action(
            resource.name,
            this.id,
            rows,
            {},
            confirmation,
        );
    }
}
