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
    | "multiselect"
    | "checkbox-group"
    | "checkbox-cards"
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
    options?: {
        value: string;
        label: string;
        description?: string;
        icon?: ReactNode;
        badge?: string;
        disabled?: boolean;
    }[];
    resource?: string;
    labelField?: string;
    displayText?: (row: RecordData) => string;
    secondaryText?: (row: RecordData) => string;
    multiple?: boolean;
    clearable?: boolean;
    creatable?: boolean;
    maxSelected?: number;
    searchable?: boolean;
    selectAll?: boolean;
    minDate?: string;
    maxDate?: string;
    filters?: Filter[];
    min?: number;
    max?: number;
    step?: number;
    maxLength?: number;
    minLength?: number;
    help?: string;
    placeholder?: string;
    disabled?: boolean;
    lockedReason?: string;
    rows?: number;
    currency?: string;
    locale?: string;
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
    navigationGroup?: string;
    deletionCheck?: boolean;
    actions: ResourceAction[];
    supportsClone?: boolean;
    createFlow?: string;
    relations?: RelationDefinition[];
}
/** The same capabilities apply to full-page grids and embedded relations. */
export interface CollectionOptions {
    virtualized?: boolean | "auto";
    searchable?: boolean;
    filterable?: boolean;
    groupable?: boolean;
    pagination?: boolean;
    rowSelection?:
        false | "single" | "multiple" | ((row: RecordData) => boolean);
    doubleClickEdit?: boolean;
    syncWithLocation?: boolean;
    resizable?: boolean;
    pinnable?: boolean;
    columnChooser?: boolean;
    densityToggle?: boolean;
    exportable?: boolean;
    refreshable?: boolean;
    presentationToggle?: boolean;
    toolbar?: boolean;
    /** false disables all record actions; an array allows only those action IDs. */
    actions?: false | string[];
    detailLink?: boolean;
    create?: boolean;
}
export interface RelationFormOptions {
    presentation?: Presentation;
    reduced?: boolean;
    wizard?: boolean;
    /** locked is the default. prefill remains editable; none carries no context. */
    binding?: "locked" | "prefill" | "none";
    flow?: string | false;
}
export interface RelationDefinition {
    resource: string;
    label: string;
    field: string;
    countRelation?: string;
    description?: string;
    collection?: CollectionOptions;
    editorCollection?: CollectionOptions;
    createForm?: RelationFormOptions;
    editForm?: Omit<RelationFormOptions, "flow">;
}
export interface FormRequest {
    resource: ResourceDefinition;
    mode: "create" | "edit";
    row?: RecordData;
    defaults?: Values;
    presentation?: Presentation;
    wizard?: boolean;
    reduced?: boolean;
    context?: {
        resource: string;
        id: number;
        field: string;
        mode?: "locked" | "prefill";
    };
    onSaved?: (row: RecordData) => void | Promise<unknown>;
}
export interface ResourceInstance {
    reload: () => Promise<unknown>;
    openForm: (request: FormRequest) => void;
    openFlow?: (
        id: string,
        options?: {
            parent?: import("./forms/flow").RecordReference;
            presentation?: Presentation;
        },
    ) => void;
    openRelation?: (
        relation: RelationDefinition,
        parent: import("./forms/flow").RecordReference,
        row?: RecordData,
    ) => void;
    navigate: (path: string) => void;
    form?: UseFormReturn<Values>;
    formResource?: ResourceDefinition;
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
