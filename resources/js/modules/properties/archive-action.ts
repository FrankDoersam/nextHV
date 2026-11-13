import { ResourceAction } from "@/framework/actions";
import { dataProvider } from "@/framework/data/provider";
import type { ActionContext, RecordData } from "@/framework/types";
export class ArchiveAction extends ResourceAction {
    id = "archive";
    label = "Archivieren";
    bulk = true;
    visible(row?: RecordData) {
        return !row || row.status !== "archived";
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
