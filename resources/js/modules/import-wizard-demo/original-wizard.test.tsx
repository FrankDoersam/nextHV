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
        expect(screen.getByRole("tab",{name:/Map Columns/}).getAttribute("type")).toBe("button");
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
        const nameSelect = screen.getByRole("combobox", { name: "Map Name" });
        expect(nameSelect.textContent).toContain("Full name");
        expect(nameSelect.classList.contains("cn-select-trigger")).toBe(true);
        expect(screen.getByRole("table", { name: "Column mapping" }).closest(".rounded-md.border")).toBeTruthy();
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
        expect(screen.getByRole("table", { name: "Row preview" }).closest(".rounded-md.border")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /Next Step/ }));
        expect(screen.getByRole("heading", { name: "Duplicate Handling", level: 2 })).toBeTruthy();
        expect(screen.getByText("36 rows match an existing contact by email.")).toBeTruthy();
        const duplicateGroup = screen.getByRole("radiogroup", { name: "Duplicate handling" });
        expect(duplicateGroup.querySelector('[data-slot="item-group"]')).toBeTruthy();
        expect(duplicateGroup.querySelectorAll('[data-slot="item"]')).toHaveLength(3);
        expect(screen.getByRole("radio", { name: "Skip existing" }).getAttribute("aria-checked")).toBe("true");
        expect(screen.getByText("Safest")).toBeTruthy();
        expect(screen.getByText("Recommended")).toBeTruthy();
        expect(screen.getByText("Risky")).toBeTruthy();
        expect(screen.getByText("Keep current records. 36 matched contacts stay untouched.")).toBeTruthy();
        expect(screen.getByText("Overwrite mapped fields on the 36 matched contacts.")).toBeTruthy();
        expect(screen.getByText("Add every row as a new contact, duplicates included.")).toBeTruthy();

        // ReUI radio items are fully functional Base UI controls.
        fireEvent.click(screen.getByRole("radio", { name: "Update existing" }));
        expect(screen.getByRole("radio", { name: "Update existing" }).getAttribute("aria-checked")).toBe("true");
        fireEvent.click(screen.getByRole("radio", { name: "Skip existing" }));

        fireEvent.click(screen.getByRole("button", { name: /Next Step/ }));
        expect(screen.getByRole("heading", { name: "Run Import", level: 2 })).toBeTruthy();
        expect(screen.getByText("Ready to import")).toBeTruthy();
        expect(screen.getByText("1.176 contacts import into the CRM, 36 skipped, 12 errors held back.")).toBeTruthy();
        const importPlan = screen.getByText("Import plan").closest("section");
        expect(importPlan?.querySelectorAll("dl > div")).toHaveLength(4);
        expect(importPlan?.textContent).toContain("northstar-contacts.csv + 1 file");
        expect(importPlan?.textContent).toContain("Contacts");
        expect(importPlan?.textContent).toContain("Email");
        expect(importPlan?.textContent).toContain("Skip existing");
        expect(screen.getByRole("button", { name: "Import" })).toBeTruthy();
    });
});
