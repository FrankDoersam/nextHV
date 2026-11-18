import type { ReactNode } from "react";
import type { SortingState } from "@tanstack/react-table";
import type {
    FilterField,
    FilterQuery,
} from "@/components/reui/filters/filters-types";

export type EnterpriseTone =
    "neutral" | "success" | "warning" | "danger" | "info";

export interface EnterpriseRecord {
    id: string;
}

export interface EnterpriseColumn<T extends EnterpriseRecord> {
    id: string;
    label: string;
    value: (row: T) => string | number | null | undefined;
    render: (row: T) => ReactNode;
    width?: number;
    primary?: boolean;
    align?: "left" | "right";
    hidden?: boolean;
    aggregate?: (rows: readonly T[]) => number;
    renderAggregate?: (value: number, rows: readonly T[]) => ReactNode;
}

export interface EnterpriseMetric {
    id: string;
    label: string;
    value: string;
    hint: string;
    tone?: EnterpriseTone;
    progress?: number;
}

export type EnterpriseFilter<T extends EnterpriseRecord> = FilterField & {
    getValue: (row: T) => unknown;
};

export interface EnterpriseGroup<T extends EnterpriseRecord> {
    id: string;
    label: string;
    value: (row: T) => string;
}

export interface EnterpriseView {
    id: string;
    label: string;
    query?: FilterQuery;
    groupBy?: string;
}

export interface EnterpriseAction<T extends EnterpriseRecord> {
    id: string;
    label: string;
    apply: (row: T) => T;
    eligible?: (row: T) => boolean;
    successMessage: (count: number) => string;
}

/** Domain adapters supply values; this contract keeps table behavior shared. */
export interface EnterpriseModuleConfig<T extends EnterpriseRecord> {
    id: string;
    title: string;
    description: string;
    itemLabel: string;
    rows: readonly T[];
    /** Permanent domain boundary, applied before user filters, totals and exports. */
    scope?: (row: T) => boolean;
    columns: EnterpriseColumn<T>[];
    filters: EnterpriseFilter<T>[];
    groups: EnterpriseGroup<T>[];
    views: EnterpriseView[];
    defaultGroupBy?: string;
    defaultSorting?: SortingState;
    defaultQuery?: FilterQuery;
    searchText: (row: T) => string;
    metrics: (rows: readonly T[]) => EnterpriseMetric[];
    detailTitle: (row: T) => string;
    renderDetail: (row: T) => ReactNode;
    actions?: EnterpriseAction<T>[];
}
