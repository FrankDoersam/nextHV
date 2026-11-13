import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { ResourceAction } from "./actions";
export type RecordData = {
    id: number;
    updated_at: string;
    [key: string]: unknown;
};
export type Values = Record<string, unknown>;
export type Presentation = "sheet" | "dialog";
export type Filter =
    | { field: string; operator?: string; value?: unknown; type?: "and" | "or" }
    | { nested: Filter[]; type?: "and" | "or" };
export type FieldKind =
    | "text"
    | "email"
    | "textarea"
    | "number"
    | "currency"
    | "select"
    | "checkbox"
    | "relation"
    | "date"
    | "month"
    | "time"
    | "date-range"
    | "month-range";
export interface FieldDefinition {
    name: string;
    label: string;
    kind?: FieldKind;
    required?: boolean;
    nullable?: boolean;
    default?: unknown;
    options?: { value: string; label: string }[];
    resource?: string;
    labelField?: string;
    filters?: Filter[];
    min?: number;
    max?: number;
    step?: number;
    maxLength?: number;
    group?: string;
    description?: string;
    readonlyOnEdit?: boolean;
    writeOnly?: boolean;
    reduced?: boolean;
    validate?: (value: unknown, values: Values) => string | undefined;
}
export interface ColumnDefinition {
    field: string;
    label: string;
    kind?: "currency" | "date" | "number" | "badge";
    sortable?: boolean;
    render?: (row: RecordData) => ReactNode;
}
export interface ResourceDefinition {
    name: string;
    label: string;
    singular: string;
    description: string;
    icon: LucideIcon;
    titleField: string;
    fields: FieldDefinition[];
    columns: ColumnDefinition[];
    groups?: { id: string; label: string; description?: string }[];
    groupBy?: { value: string; label: string }[];
    filters?: {
        field: string;
        label: string;
        options: { value: string; label: string }[];
    }[];
    includes?: { relation: string; includes?: { relation: string }[] }[];
    aggregates?: { relation: string; type: string; field?: string }[];
    navigation?: boolean;
    actions: ResourceAction[];
    supportsClone?: boolean;
    relations?: RelationDefinition[];
}
export interface RelationDefinition {
    resource: string;
    label: string;
    field: string;
    countRelation?: string;
    description?: string;
}
export interface FormRequest {
    resource: ResourceDefinition;
    mode: "create" | "edit";
    row?: RecordData;
    defaults?: Values;
    presentation?: Presentation;
    wizard?: boolean;
    reduced?: boolean;
    onSaved?: (row: RecordData) => void;
}
export interface ResourceInstance {
    reload: () => Promise<unknown>;
    openForm: (request: FormRequest) => void;
    navigate: (path: string) => void;
    form?: UseFormReturn<Values>;
    refreshForm?: () => Promise<void>;
    table?: unknown;
}
export interface ActionContext {
    rows: RecordData[];
    resource: ResourceDefinition;
    instance: ResourceInstance;
    values: Values;
}
export interface PageResult {
    data: RecordData[];
    total: number;
    current_page: number;
    last_page: number;
}
