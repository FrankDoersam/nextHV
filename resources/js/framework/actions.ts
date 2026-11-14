import {
    Pencil,
    Trash2,
    SlidersHorizontal,
    type LucideIcon,
} from "lucide-react";
import { can } from "./permissions";
import { request } from "./data/http";
import { dataProvider } from "./data/provider";
import type { ActionContext, FieldDefinition, RecordData } from "./types";
export type ActionPlacement =
    "row" | "table" | "detail" | "form" | "field" | "bulk";
export abstract class ResourceAction {
    abstract id: string;
    abstract label: string;
    icon?: LucideIcon;
    description?: string;
    group?: string;
    placements?: ActionPlacement[];
    children: ResourceAction[] = [];
    interaction: "dialog" | "immediate" = "dialog";
    requiresRecord = true;
    refresh = true;
    selectableFields = false;
    bulk = false;
    destructive = false;
    location: "row" | "toolbar" | "both" = "both";
    fields: FieldDefinition[] = [];
    fieldsFor(_context: ActionContext): FieldDefinition[] {
        return this.fields;
    }
    enabled(_context: ActionContext): boolean | string {
        return true;
    }
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
    icon = Pencil;
    interaction = "immediate" as const;
    refresh = false;
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
    icon = Trash2;
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

/** Legacy location remains supported; new definitions can opt into exact surfaces. */
export function actionAt(
    action: ResourceAction,
    placement: ActionPlacement,
): boolean {
    if (action.placements) return action.placements.includes(placement);
    if (placement === "field" || placement === "table") return false;
    return placement === "bulk"
        ? action.location !== "row"
        : action.location !== "toolbar";
}
export function actionVisible(
    action: ResourceAction,
    context: ActionContext,
): boolean {
    if (action.children.length)
        return action.children.some((child) => actionVisible(child, context));
    if (action.requiresRecord && !context.rows.length) return false;
    if (!action.bulk && context.rows.length > 1) return false;
    return context.rows.length
        ? context.rows.every(
              (row) =>
                  action.visible(row) &&
                  can(context.resource.name, action.id, row),
          )
        : action.visible() && can(context.resource.name, action.id);
}
export function actionAvailability(
    action: ResourceAction,
    context: ActionContext,
): boolean | string {
    if (!actionVisible(action, context)) return false;
    return action.enabled(context);
}
export class ActionGroup extends ResourceAction {
    constructor(
        public id: string,
        public label: string,
        children: ResourceAction[],
        public icon?: LucideIcon,
    ) {
        super();
        this.children = children;
    }
    async execute(): Promise<never> {
        throw new Error("Bitte eine Unteraktion auswählen.");
    }
}
/** Explicit resource field allow-list; the native REST batch validates and updates atomically. */
export class BulkEditAction extends ResourceAction {
    id = "bulk-edit";
    label = "Bearbeiten";
    description =
        "Nur aktivierte Felder werden für alle ausgewählten Datensätze geändert.";
    icon = SlidersHorizontal;
    bulk = true;
    placements: ActionPlacement[] = ["bulk"];
    selectableFields = true;
    refresh = false;
    fieldsFor({ resource }: ActionContext) {
        return resource.fields.filter(
            (field) =>
                resource.bulkEditable?.includes(field.name) &&
                !field.readonlyOnEdit &&
                !field.disabled &&
                !field.writeOnly,
        );
    }
    enabled(context: ActionContext) {
        return (
            this.fieldsFor(context).length > 0 ||
            "Keine Felder zur Mehrfachbearbeitung freigegeben."
        );
    }
    async execute(context: ActionContext) {
        const fields = this.fieldsFor(context);
        const values = Object.fromEntries(
            fields
                .filter((field) => Object.hasOwn(context.values, field.name))
                .map((field) => [field.name, context.values[field.name]]),
        );
        if (!Object.keys(values).length)
            throw new Error("Bitte mindestens ein Feld zum Ändern auswählen.");
        return dataProvider.saveMany(context.resource, values, context.rows);
    }
}
