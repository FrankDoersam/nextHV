import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { ColumnDefinition, RecordData } from "../types";
import { CellRenderer } from "./cell-renderer";

/** Narrow containers reflow every visible column into labelled values instead of dropping data. */
export function ResponsiveRecordList({
    columns,
    rows,
    titleField,
    selection,
    actions,
    open,
    loading,
    empty,
    selected,
}: {
    columns: ColumnDefinition[];
    rows: RecordData[];
    titleField?: string;
    selection?: { header: ReactNode; row: (record: RecordData) => ReactNode };
    actions?: (record: RecordData) => ReactNode;
    open?: (record: RecordData) => void;
    loading?: boolean;
    empty?: ReactNode;
    selected?: (record: RecordData) => boolean;
}) {
    const title =
        columns.find((column) => column.field === titleField) ?? columns[0];
    const details = columns.filter((column) => column !== title);
    return (
        <div data-slot="responsive-record-list" className="min-w-0">
            <div className="sticky top-0 z-10 flex min-h-10 items-center gap-3 border-b bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
                {selection?.header}
                <span>{title?.label ?? "Datensätze"}</span>
                <span className="ml-auto">
                    {loading ? "Wird geladen …" : `${rows.length} Einträge`}
                </span>
            </div>
            {loading ? (
                <div aria-hidden className="divide-y">
                    {Array.from({ length: 4 }, (_, index) => (
                        <div key={index} className="space-y-4 p-4">
                            <Skeleton className="h-5 w-3/4" />
                            <div className="grid grid-cols-2 gap-4">
                                <Skeleton className="h-10" />
                                <Skeleton className="h-10" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : rows.length ? (
                <div role="list" className="divide-y">
                    {rows.map((row) => (
                        <article
                            key={row.id}
                            role="listitem"
                            data-row-id={row.id}
                            data-selected={selected?.(row) || undefined}
                            className="min-w-0 space-y-4 px-3 py-4 data-selected:bg-primary/5"
                        >
                            <div className="flex min-w-0 items-center gap-3">
                                {selection?.row(row)}
                                {title &&
                                    (open ? (
                                        <button
                                            type="button"
                                            className="min-w-0 flex-1 text-left font-medium hover:text-primary"
                                            onClick={() => open(row)}
                                        >
                                            <CellRenderer
                                                column={title}
                                                row={row}
                                            />
                                        </button>
                                    ) : (
                                        <div className="min-w-0 flex-1">
                                            <CellRenderer
                                                column={title}
                                                row={row}
                                            />
                                        </div>
                                    ))}
                                {actions && (
                                    <div className="shrink-0">
                                        {actions(row)}
                                    </div>
                                )}
                            </div>
                            {details.length > 0 && (
                                <dl className="grid min-w-0 grid-cols-2 gap-x-5 gap-y-3">
                                    {details.map((column) => (
                                        <div
                                            key={column.field}
                                            className="min-w-0"
                                        >
                                            <dt className="mb-1 text-xs text-muted-foreground">
                                                {column.label}
                                            </dt>
                                            <dd className="min-w-0 text-sm">
                                                <CellRenderer
                                                    column={column}
                                                    row={row}
                                                />
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                            )}
                        </article>
                    ))}
                </div>
            ) : (
                empty
            )}
        </div>
    );
}
