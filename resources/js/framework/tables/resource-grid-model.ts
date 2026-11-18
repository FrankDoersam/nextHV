import type {
    CellDraftValues,
    ColumnDefinition,
    RecordData,
    ResourceDefinition,
} from "../types";
import type { CascaderNode } from "@/components/reui/cascader/cascader-types";
import { recordValue } from "./cell-value";
import { cellNumber, evaluateColumn } from "./column-calculations";
import type { ResourceGroupCount } from "./use-resource-table";

export type ResourceGridRow = (
    | { kind: "record"; id: string; record: RecordData }
    | {
          kind: "group";
          id: string;
          label: string;
          total: number;
          records: RecordData[];
      }
) & { drafts: Readonly<Record<string, CellDraftValues>> };

export const draftRowKey = (row: RecordData) =>
    JSON.stringify([row.id, row.updated_at ?? null]);

/** Only authored columns enter the picker; relations cannot expose new API fields. */
export function resourceColumnTree(
    resource: ResourceDefinition,
): CascaderNode[] {
    const entities = new Map<string, CascaderNode>();
    for (const column of resource.columns) {
        const relation = column.field.includes(".")
            ? column.field.split(".")[0]
            : undefined;
        const entity =
            column.entity ??
            (relation
                ? {
                      id: relation,
                      label:
                          resource.fields.find(
                              (field) => field.name === `${relation}_id`,
                          )?.label ?? relation,
                  }
                : { id: resource.name, label: resource.label });
        if (!entities.has(entity.id))
            entities.set(entity.id, {
                value: `entity:${entity.id}`,
                label: entity.label,
                children: [],
            });
        entities.get(entity.id)!.children!.push({
            value: column.field,
            label: column.label,
            disabled: column.hideable === false,
            keywords: [column.field, entity.label],
        });
    }
    return [...entities.values()];
}

export function resourceGridRows(
    rows: RecordData[],
    group: string,
    groups: ResourceGroupCount[] | undefined,
    resource: ResourceDefinition,
    collapsed: ReadonlySet<string>,
    drafts: Readonly<Record<string, CellDraftValues>> = {},
): ResourceGridRow[] {
    const entry = (record: RecordData): ResourceGridRow => ({
        kind: "record",
        id: String(record.id),
        record,
        drafts,
    });
    if (group === "none" || !groups) return rows.map(entry);
    const keyOf = (value: unknown) =>
        value == null ? "null" : `value:${String(value)}`;
    const counts = new Map(
        groups.map((item) => [keyOf(item.value), item.count]),
    );
    const options =
        resource.fields.find((field) => field.name === group)?.options ??
        resource.columns.find((column) => column.field === group)?.options ??
        resource.filters?.find((filter) => filter.field === group)?.options;
    const buckets = new Map<string, { value: unknown; rows: RecordData[] }>();
    for (const row of rows) {
        const value = recordValue(row, group);
        const key = keyOf(value);
        if (!buckets.has(key)) buckets.set(key, { value, rows: [] });
        buckets.get(key)!.rows.push(row);
    }
    return [...buckets.entries()].flatMap(([key, bucket]) => {
        const id = `group:${group}:${key}`;
        const label =
            bucket.value == null || bucket.value === ""
                ? "Nicht erfasst"
                : (options?.find(
                      (option) => String(option.value) === String(bucket.value),
                  )?.label ?? String(bucket.value));
        const header: ResourceGridRow = {
            kind: "group",
            id,
            label,
            total: counts.get(key) ?? bucket.rows.length,
            records: bucket.rows,
            drafts,
        };
        return collapsed.has(id)
            ? [header]
            : [header, ...bucket.rows.map(entry)];
    });
}

/** Aggregates are always scoped to the supplied loaded records, never inferred server totals. */
export function aggregateGridColumn(
    rows: readonly RecordData[],
    column: ColumnDefinition,
    columns: readonly ColumnDefinition[],
    drafts: Readonly<Record<string, CellDraftValues>>,
): number | null {
    if (!column.aggregate) return null;
    const values = rows
        .map((row) =>
            evaluateColumn(row, column, columns, drafts[draftRowKey(row)]),
        )
        .filter(
            (value) => value !== null && value !== undefined && value !== "",
        );
    if (column.aggregate === "count") return values.length;
    const numbers = values
        .map(cellNumber)
        .filter((value): value is number => value !== null);
    if (!numbers.length) return null;
    switch (column.aggregate) {
        case "sum":
            return numbers.reduce((sum, value) => sum + value, 0);
        case "average":
            return (
                numbers.reduce((sum, value) => sum + value, 0) / numbers.length
            );
        case "min":
            return Math.min(...numbers);
        case "max":
            return Math.max(...numbers);
    }
}
