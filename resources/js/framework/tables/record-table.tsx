import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTable, type ColumnDef } from "@tanstack/react-table";
import {
    DataGrid,
    DataGridContainer,
    dataGridFeatures,
    type DataGridFeatures,
} from "@/components/reui/data-grid/data-grid";
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import type { ColumnDefinition, RecordData } from "../types";
import { CellRenderer } from "./cell-renderer";
import { recordValue } from "./cell-value";
import { resolveColumnLayout } from "./column-layout";

/** Small, read-only embedded tables reuse the grid's cells and sizing without API, selection or mutation state. */
export function RecordTable({
    columns,
    rows,
    label,
    dense = false,
    emptyMessage = "Keine Einträge vorhanden.",
}: {
    columns: ColumnDefinition[];
    rows: RecordData[];
    label: string;
    dense?: boolean;
    emptyMessage?: string;
}) {
    const viewport = useRef<HTMLElement>(null);
    const [width, setWidth] = useState(0);
    useLayoutEffect(() => {
        const element = viewport.current;
        if (!element) return;
        const measure = () => setWidth(element.clientWidth);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    const definitions = useMemo<
        ColumnDef<DataGridFeatures, RecordData>[]
    >(() => {
        const sizes = resolveColumnLayout(
            { columns, fields: [], titleField: columns[0]?.field ?? "id" },
            width,
            {},
            0,
        );
        return columns.map((column) => ({
            id: column.field,
            accessorFn: (row) => recordValue(row, column.field),
            header: column.label,
            cell: ({ row }) => (
                <CellRenderer column={column} row={row.original} />
            ),
            ...sizes[column.field],
            enableSorting: false,
            enableResizing: false,
            enableHiding: false,
        }));
    }, [columns, width]);
    const table = useTable({
        features: dataGridFeatures,
        data: rows,
        columns: definitions,
        getRowId: (row) => String(row.id),
        manualPagination: true,
        manualSorting: true,
        manualFiltering: true,
        enableRowSelection: false,
    });
    return (
        <section
            ref={viewport}
            data-slot="record-table"
            aria-label={label}
            className="w-full min-w-0"
        >
            <DataGrid
                table={table}
                recordCount={rows.length}
                emptyMessage={emptyMessage}
                tableLayout={{
                    dense,
                    width: "fixed",
                    headerBackground: true,
                    rowBorder: true,
                }}
            >
                <DataGridContainer className="rounded-lg border bg-card">
                    <DataGridScrollArea orientation="horizontal">
                        <DataGridTable />
                    </DataGridScrollArea>
                </DataGridContainer>
            </DataGrid>
        </section>
    );
}
