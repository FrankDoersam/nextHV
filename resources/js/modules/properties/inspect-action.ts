import { ResourceAction, ReportAction } from "@/framework/actions";
import { dataProvider } from "@/framework/data/provider";
import type { ActionContext } from "@/framework/types";
/** Server receives the selected model; the result dispatcher chooses the UI. */
export class InspectPropertyAction extends ResourceAction {
    id = "inspect";
    label = "Objekt-Steckbrief";
    location = "row" as const;
    async execute({ resource, rows, values }: ActionContext) {
        return dataProvider.action(resource.name, this.id, rows, values);
    }
}
export class PropertyReportAction extends ReportAction {
    id = "report";
    label = "Objektbericht als PDF";
}
