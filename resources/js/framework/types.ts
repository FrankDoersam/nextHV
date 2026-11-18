import type { RecordId } from "@/framework/record-id";
import type { KeyValueItem } from "@/components/blocks/key-value-card";
import type { NavigationItemDefinition } from "./navigation/sidebar-model";
import type {
    TableFilterPresets,
    TablePaginationOptions,
    TableQueryOptions,
    TableSortPresets,
} from "./tables/table-contract";
import type { ChoiceOption } from "@/components/fields/choice-picker";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { ResourceAction } from "./actions";
export type RecordData = {
    id: RecordId;
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
    | "choice-buttons"
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
    options?: ChoiceOption[];
    selectedDisplay?: "title" | "rich";
    optionMeta?: (
        row: RecordData,
    ) => Pick<ChoiceOption, "image" | "icon" | "badge" | "badgeTone">;
    steppers?: boolean;
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
    prefixActions?: ResourceAction[];
    suffixActions?: ResourceAction[];
    /** Demo-only schemaFor extension. REST forms do not run client business rules. */
    validate?: (value: unknown, values: Values) => string | undefined;
}
export interface FilterDefinition {
    field: string;
    label: string;
    kind?: "choice" | "text" | "number" | "date" | "relation";
    resource?: string;
    labelField?: string;
    filters?: Filter[];
    creatable?: boolean;
    multiple?: boolean;
    clearable?: boolean;
    options?: { value: string; label: string }[];
    nullable?: boolean;
    operators?: (
        | "in"
        | "not in"
        | "="
        | "!="
        | "contains"
        | "not contains"
        | ">"
        | ">="
        | "<"
        | "<="
        | "between"
        | "is null"
        | "is not null"
    )[];
}
export type CellScalar = string | number | boolean | null;
export type CellDraftValues = Readonly<Record<string, CellScalar>>;
export type CellTone = "neutral" | "success" | "warning" | "danger" | "info";

/** Serializable expressions only: no executable code or implicit field writes. */
export type ColumnExpression =
    | { type: "literal"; value: CellScalar }
    | { type: "field"; field: string }
    | { type: "column"; field: string }
    | {
          type: "operation";
          operator:
              | "add"
              | "subtract"
              | "multiply"
              | "divide"
              | "min"
              | "max"
              | "round"
              | "coalesce";
          values: ColumnExpression[];
      }
    | {
          type: "date-part";
          part: "year" | "month" | "day";
          value: ColumnExpression;
      }
    | {
          type: "if";
          condition: CellCondition;
          then: ColumnExpression;
          otherwise: ColumnExpression;
      };

export type CellCondition =
    | {
          type: "compare";
          left: ColumnExpression;
          operator: "eq" | "ne" | "gt" | "gte" | "lt" | "lte";
          right: ColumnExpression;
      }
    | { type: "all" | "any"; conditions: CellCondition[] }
    | { type: "not"; condition: CellCondition };

export interface CellColorRule {
    when: CellCondition;
    tone: CellTone;
    /** A visible explanation keeps meaning available without color perception. */
    label?: string;
}

export interface ColumnInputDefinition {
    kind:
        | "text"
        | "number"
        | "percent"
        | "currency"
        | "date"
        | "choice"
        | "boolean";
    /** Preview drafts are the default. Record writes require an explicit commit. */
    mode?: "draft" | "record";
    initial?: CellScalar;
    nullable?: boolean;
    min?: number;
    max?: number;
    step?: number;
    integer?: boolean;
    minDate?: string;
    maxDate?: string;
    options?: { value: string | number; label: string }[];
}

export interface CellDefinition {
    type:
        | "avatar"
        | "avatars"
        | "tags"
        | "icon-text"
        | "text"
        | "progress"
        | "delta"
        | "comparison"
        | "sparkline"
        | "boolean"
        | "ratio";
    primary?: string | ((row: RecordData) => string);
    secondary?: string | ((row: RecordData) => string);
    image?: string;
    icon?: LucideIcon;
    items?: string | ((row: RecordData) => unknown[]);
    nameField?: string;
    imageField?: string;
    max?: number;
    /** Target/baseline for progress, delta and stacked plan/actual cells. */
    target?: ColumnExpression;
    targetLabel?: string;
    valueLabel?: string;
    deltaMode?: "absolute" | "percent";
    positive?: "good" | "bad";
    /** Row path containing finite numeric samples for a small trend chart. */
    series?: string;
    precision?: number;
}
export interface ColumnDefinition {
    field: string;
    label: string;
    kind?: "currency" | "date" | "number" | "badge" | "percent" | "boolean";
    sortable?: boolean;
    size?: number | `${number}%`;
    minSize?: number;
    maxSize?: number;
    grow?: number;
    filter?:
        false | (Partial<Omit<FilterDefinition, "field">> & { field?: string });
    defaultVisible?: boolean;
    hideable?: boolean;
    cell?: CellDefinition;
    entity?: { id: string; label: string };
    input?: ColumnInputDefinition;
    computed?: ColumnExpression;
    colors?: CellColorRule[];
    aggregate?: "sum" | "average" | "min" | "max" | "count";
    options?: { value: string | number; label: string }[];
    /** Canonical REST sort path for a related display column (e.g. property_record.name → property.name). */
    sortField?: string;
    reference?: false | { resource: string; idField: string };
    exportValue?: (row: RecordData) => string | number | null;
    render?: (row: RecordData) => ReactNode;
}
export interface FormSummaryDefinition {
    title?: string;
    description?: string;
    variant?: "summary" | "framed";
    items: (values: Values, record?: RecordData) => KeyValueItem[];
}
export interface EditorTabDefinition {
    icon?: LucideIcon;
    id: string;
    label: string;
    groups?: string[];
    relations?: boolean;
    summary?: FormSummaryDefinition;
}
export interface CollectionSummaryDefinition {
    metric: string;
    items: {
        key: string;
        label: string;
        kind?: "number" | "currency";
        suffix?: string;
        icon?: LucideIcon;
        description?: string;
    }[];
}
export interface FormGroupDefinition {
    id: string;
    label: string;
    stepLabel?: string;
    /** Optional shorter label in compact/mobile stepper navigation. */
    stepShortLabel?: string;
    description?: string;
    collapsible?: boolean;
    defaultOpen?: boolean;
    summary?: (values: Values) => ReactNode;
}
export interface CollectionViewDefinition {
    icon?: LucideIcon;
    id: string;
    label: string;
    filters?: Filter[];
    query?: string;
    count?: boolean;
}
/** Unsaved child rows are submitted with their parent in one native REST mutation. */
export interface CreateRelationDefinition {
    relation: string;
    resource: () => ResourceDefinition;
    foreignKey: string;
    label: string;
    singular: string;
    group: string;
    initialRows?: number;
    fields?: string[];
    defaults?: (parent: Values) => Values;
}
export interface ResourceDefinition {
    features?: { audit?: boolean; import?: boolean };
    name: string;
    label: string;
    singular: string;
    description: string;
    icon: LucideIcon;
    titleField: string;
    picker?: {
        secondaryFields: string[];
        includes?: ResourceDefinition["includes"];
    };
    fields: FieldDefinition[];
    columns: ColumnDefinition[];
    groups?: FormGroupDefinition[];
    groupBy?: { value: string; label: string }[];
    filters?: FilterDefinition[];
    views?: CollectionViewDefinition[];
    toolbarFilters?: string[];
    collection?: CollectionOptions;
    includes?: { relation: string; includes?: { relation: string }[] }[];
    aggregates?: { relation: string; type: string; field?: string }[];
    navigation?: boolean;
    /** Select a complete named provider; Laravel/Lomkit is the default. */
    dataProvider?: string;
    navigationGroup?: string;
    /** Optional nested/sidebar behaviors; resource CRUD metadata stays in this registry. */
    navigationItem?: Pick<
        NavigationItemDefinition,
        | "description"
        | "tooltip"
        | "badge"
        | "defaultOpen"
        | "visible"
        | "enabled"
        | "permission"
        | "children"
    >;
    actions: ResourceAction[];
    bulkActions?: false | string[];
    editor?: {
        titleBadge?: boolean;
        description?: string | false;
        tabs?: EditorTabDefinition[];
        tabIcons?: boolean;
        sectionStyle?: "plain" | "card" | "collapsible";
        summary?: FormSummaryDefinition;
        wizardSummary?: FormSummaryDefinition;
    };
    view?: { sectionStyle?: "plain" | "card" | "collapsible" };
    supportsClone?: boolean;
    bulkEditable?: string[];
    createFlow?: string;
    createRelations?: CreateRelationDefinition[];
    summary?: CollectionSummaryDefinition;
    relations?: RelationDefinition[];
}
/** The same capabilities apply to full-page grids and embedded relations. */
export interface CollectionOptions {
    /** Resource-driven ReUI workspace; the existing table remains the default. */
    renderer?: "table" | "grid";
    /** Fetch successive native REST pages on scroll; hides the page navigator. */
    infiniteScroll?: boolean;
    /** Additional local calculation columns in the grid; CRUD fields stay on the resource. */
    previewColumns?: ColumnDefinition[];
    views?: CollectionViewDefinition[] | false;
    tabIcons?: boolean;
    toolbarFilters?: string[];
    viewMode?: "page" | "sheet" | "dialog";
    summary?: boolean;
    virtualized?: boolean | "auto";
    searchable?: boolean;
    filterable?: boolean;
    groupable?: boolean;
    pagination?: boolean | TablePaginationOptions;
    filters?: TableFilterPresets;
    sorters?: TableSortPresets;
    queryOptions?: TableQueryOptions;
    /** Opt-in bounded server-wide selection across pages (max 100 records). */
    selectAllFiltered?: boolean;
    rowSelection?:
        false | "single" | "multiple" | ((row: RecordData) => boolean);
    /** Remove only the select-all control while retaining row checkboxes. */
    selectAll?: boolean;
    doubleClickEdit?: boolean;
    syncWithLocation?: boolean;
    resizable?: boolean;
    pinnable?: boolean;
    columnChooser?: boolean;
    exportable?: boolean;
    /** Requires server opt-in; default off in constrained relation tables. */
    importable?: boolean;
    refreshable?: boolean;
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
    navigationLabel?: string;
    icon?: LucideIcon;
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
    mode: "create" | "edit" | "view";
    row?: RecordData;
    defaults?: Values;
    presentation?: Presentation;
    wizard?: boolean;
    reduced?: boolean;
    fields?: string[];
    context?: {
        resource: string;
        id: RecordId;
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
export interface PageResult<TRecord extends RecordData = RecordData> {
    data: TRecord[];
    total: number;
    current_page: number;
    last_page: number;
}
