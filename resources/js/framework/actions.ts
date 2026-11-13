import { request } from "./data/http";
import { dataProvider } from "./data/provider";
import type { ActionContext, FieldDefinition, RecordData } from "./types";
export abstract class ResourceAction {
    abstract id: string;
    abstract label: string;
    bulk = false;
    destructive = false;
    location: "row" | "toolbar" | "both" = "both";
    fields: FieldDefinition[] = [];
    async prepare(_context: ActionContext): Promise<
        | {
              defaults?: import("./types").Values;
              blockers?: { label: string; reasons: string[] }[];
          }
        | undefined
    > {
        return undefined;
    }
    visible(_row?: RecordData): boolean {
        return true;
    }
    abstract execute(
        context: ActionContext,
        confirmation?: string,
    ): Promise<unknown>;
}
export class EditAction extends ResourceAction {
    id = "edit";
    label = "Bearbeiten";
    location = "row" as const;
    async execute({ rows, resource, instance }: ActionContext) {
        instance.openForm({
            resource,
            mode: "edit",
            row: rows[0],
            onSaved: () => {
                void instance.refreshForm?.();
            },
        });
    }
}

export class DeleteAction extends ResourceAction {
    id = "delete";
    label = "Löschen";
    bulk = true;
    destructive = true;
    async prepare({ resource, rows }: ActionContext) {
        if (!resource.deletionCheck) return;
        const result = await request<{
            data: { label: string; allowed: boolean; reasons: string[] }[];
        }>(`/api/v1/${resource.name}/deletion-check`, {
            resources: rows.map((r) => r.id),
        });
        return { blockers: result.data.filter((r) => !r.allowed) };
    }
    async execute({ rows, resource }: ActionContext, confirmation?: string) {
        return dataProvider.destroy(resource.name, rows, confirmation);
    }
}
