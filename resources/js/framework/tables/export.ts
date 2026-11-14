import type { RecordData, ColumnDefinition } from "../types";
import { exportColumnValue } from "./cell-value";
export function csvCell(value: unknown): string {
    const text = String(value ?? "");
    return `"${(/^(?:\s*[=+@-]|[\t\r])/.test(text) ? "'" + text : text).replaceAll('"', '""')}"`;
}
export function exportRows(
    rows: RecordData[],
    columns: ColumnDefinition[],
    name: string,
) {
    const content = [
        columns.map((c) => csvCell(c.label)).join(";"),
        ...rows.map((row) =>
            columns.map((c) => csvCell(exportColumnValue(row, c))).join(";"),
        ),
    ].join("\r\n");
    const url = URL.createObjectURL(
        new Blob(["\ufeff", content], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${name}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
