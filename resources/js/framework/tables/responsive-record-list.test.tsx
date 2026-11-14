import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ResponsiveRecordList } from "./responsive-record-list";
import type { ColumnDefinition, RecordData } from "../types";
afterEach(cleanup);
it("reflows every visible business column into labelled values and keeps record actions available", async () => {
    const columns: ColumnDefinition[] = [
        { field: "code", label: "Nummer" },
        { field: "name", label: "Objekt" },
        { field: "address", label: "Adresse" },
        { field: "units", label: "Einheiten", kind: "number" },
        { field: "status", label: "Status", kind: "badge" },
    ];
    const row: RecordData = {
        id: 9,
        updated_at: "2026-11-14T09:00:00Z",
        code: "OBJ-009",
        name: "Wohnanlage mit langem Namen",
        address: "Parkstraße 128, Hinterhaus, Berlin",
        units: 15,
        status: "active",
    };
    const open = vi.fn(),
        action = vi.fn();
    render(
        <ResponsiveRecordList
            columns={columns}
            rows={[row]}
            titleField="name"
            open={open}
            actions={(record) => (
                <button onClick={() => action(record)}>Aktion</button>
            )}
        />,
    );
    expect(screen.getByRole("listitem")).toHaveAttribute("data-row-id", "9");
    for (const label of ["Nummer", "Adresse", "Einheiten", "Status"])
        expect(screen.getByText(label)).toBeVisible();
    expect(screen.getByText("OBJ-009")).toBeVisible();
    expect(
        screen.getByText("Parkstraße 128, Hinterhaus, Berlin"),
    ).toBeVisible();
    expect(screen.getByText("15")).toBeVisible();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: row.name as string }));
    await user.click(screen.getByRole("button", { name: "Aktion" }));
    expect(open).toHaveBeenCalledExactlyOnceWith(row);
    expect(action).toHaveBeenCalledExactlyOnceWith(row);
});
