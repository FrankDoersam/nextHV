import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ImportWizardDemo } from "./import-wizard";

afterEach(cleanup);

describe("ReUI import wizard demo", () => {
    it("reconstructs the uploaded HTML first step using project primitives", () => {
        render(<ImportWizardDemo />);
        expect(screen.getByRole("form", { name: "CSV import wizard" })).toBeTruthy();
        expect(screen.getByText("northstar-contacts.csv")).toBeTruthy();
        expect(screen.getByRole("heading", { name: "Upload Files" })).toBeTruthy();
        expect(screen.getByRole("button", { name: /Drop Files/ })).toBeTruthy();
        expect(screen.getAllByText("1,248 rows").length).toBeGreaterThan(0);
        expect(screen.getByRole("tab", { name: "Upload" })).toBeTruthy();
        expect(screen.getByRole("tablist").getAttribute("data-variant")).toBe("line");
        expect(screen.getByRole("switch", { name: "First row is a header" })).toBeTruthy();
    });

    it("advances to column mapping and prevents continuing without a CSV source", () => {
        render(<ImportWizardDemo />);
        fireEvent.click(screen.getByRole("button", { name: /Next Step/i }));
        expect(screen.getByRole("heading", { name: "Map Columns", level: 2 })).toBeTruthy();
        expect(screen.getByText("Required field not mapped")).toBeTruthy();
        expect(screen.getByRole("table", { name: "Column mapping" })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Back" }));
        fireEvent.click(screen.getByRole("button", { name: "Remove northstar-contacts.csv" }));
        fireEvent.click(screen.getByRole("button", { name: /Next Step/i }));
        expect(screen.getByRole("alert").textContent).toContain("Select a CSV file");
    });
});
