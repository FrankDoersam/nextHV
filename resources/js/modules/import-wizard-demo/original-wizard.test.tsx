import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ReuiOriginalImportWizard } from "./original-wizard";

afterEach(cleanup);

describe("ReUI horizontal Stepper reference", () => {
    it("shows five original navigation steps and local upload area", () => {
        render(<ReuiOriginalImportWizard />);
        expect(screen.getByRole("heading",{name:"Upload Files"})).toBeTruthy();
        expect(screen.getByRole("tablist")).toBeTruthy();
        expect(screen.getByRole("tab",{name:/Map Columns/})).toBeTruthy();
        expect(screen.getByRole("button",{name:/Drop Files/})).toBeTruthy();
    });
    it("follows the supplied HTML states: Upload, mapping warning, Preview", () => {
        render(<ReuiOriginalImportWizard />);
        const wizard = screen.getByRole("form", { name: "CSV import wizard" });
        expect(wizard.querySelector('[data-slot="field-group"]')).toBeTruthy();
        expect(wizard.querySelector('[data-slot="item-group"]')?.querySelectorAll('[data-slot="item"]')).toHaveLength(2);
        expect(screen.getByText("northstar-contacts.csv")).toBeTruthy();
        expect(screen.getByRole("combobox", { name: "Import into" })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /Next Step/ }));
        expect(screen.getByRole("heading", { name: "Map Columns", level: 2 })).toBeTruthy();
        expect(screen.getByText("Required field not mapped")).toBeTruthy();
        expect(screen.getByText(/Owner needs a target field before validation/)).toBeTruthy();
        expect(screen.getByRole("combobox", { name: "Map Name" }).textContent).toContain("Full name");
        expect(screen.getByRole("combobox", { name: "Map Owner" }).textContent).toContain("Do not import");
        expect(screen.getByRole("table", { name: "Column mapping" }).querySelectorAll("tbody tr")).toHaveLength(8);
        // Unlike a restrictive validation gate, the source HTML shows the
        // following Preview even with Owner still unmapped.
        fireEvent.click(screen.getByRole("button", { name: /Next Step/ }));
        expect(screen.getByRole("heading", { name: "Preview Rows", level: 2 })).toBeTruthy();
        expect(screen.getByRole("table", { name: "Row preview" }).querySelectorAll("tbody tr")).toHaveLength(5);
        expect(screen.getByText("1.212 valid")).toBeTruthy();
        expect(screen.getByRole("combobox", { name: "Unique key" }).textContent).toContain("Email");
        expect(screen.getByText("24 warnings")).toBeTruthy();
        expect(screen.getByText("12 errors")).toBeTruthy();
    });
});
