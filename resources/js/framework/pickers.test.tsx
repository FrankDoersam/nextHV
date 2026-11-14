import React, { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
    ChoicePicker,
    type ChoicePickerProps,
} from "@/components/fields/choice-picker";
import { CheckboxList } from "@/components/fields/checkbox-list";
import { DatePicker } from "@/components/fields/pickers";
import { schemaFor } from "./forms/schema";

beforeEach(() => {
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    );
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: vi.fn(() => ({
            matches: false,
            addEventListener() {},
            removeEventListener() {},
        })),
    });
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.getAnimations = vi.fn(() => []);
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
const options = [
    { value: "active", label: "Aktiv", description: "In Verwaltung" },
    { value: "draft", label: "Entwurf", description: "In Vorbereitung" },
    { value: "ended", label: "Beendet", disabled: true },
];
function SelectDemo(props: Partial<ChoicePickerProps>) {
    const [value, setValue] = useState<unknown>(
        props.multiple ? ["active"] : "active",
    );
    return (
        <>
            <label htmlFor="state">Status</label>
            <ChoicePicker
                id="state"
                options={options}
                {...props}
                value={value}
                onChange={setValue}
            />
            <output>{JSON.stringify(value)}</output>
        </>
    );
}
describe("searchable choice controls", () => {
    it("searches on typing after Tab, commits by keyboard and shows only the title when closed", async () => {
        const user = userEvent.setup();
        render(<SelectDemo />);
        await user.tab();
        await user.keyboard("Entw");
        expect(
            await screen.findByRole("option", { name: /Entwurf/ }),
        ).toBeVisible();
        expect(
            screen.queryByRole("option", { name: /Aktiv/ }),
        ).not.toBeInTheDocument();
        await user.keyboard("{ArrowDown}{Enter}");
        await waitFor(() =>
            expect(
                screen.getByRole("combobox", { name: "Status" }),
            ).toHaveValue("Entwurf"),
        );
        await user.click(
            screen.getByRole("button", { name: "Auswahl öffnen" }),
        );
        expect(
            await screen.findByRole("option", { name: /Entwurf/ }),
        ).toHaveAttribute("aria-selected", "true");
    });
    it("keeps multiple selections checked on reopen and supports clearing without secondary captions", async () => {
        const user = userEvent.setup();
        render(<SelectDemo multiple />);
        await user.click(
            screen.getByRole("button", { name: "Auswahl öffnen" }),
        );
        await user.click(
            await screen.findByRole("option", { name: /Entwurf/ }),
        );
        await user.keyboard("{Escape}");
        expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue(
            "Aktiv, Entwurf",
        );
        await user.click(
            screen.getByRole("button", { name: "Auswahl öffnen" }),
        );
        expect(
            await screen.findByRole("option", { name: /Aktiv/ }),
        ).toHaveAttribute("aria-selected", "true");
        expect(screen.getByRole("option", { name: /Entwurf/ })).toHaveAttribute(
            "aria-selected",
            "true",
        );
        await user.keyboard("{Escape}");
        await user.click(
            screen.getByRole("button", { name: "Auswahl entfernen" }),
        );
        expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue(
            "",
        );
    });
    it("omits the clear button when explicitly disabled", () => {
        render(<SelectDemo clearable={false} />);
        expect(
            screen.queryByRole("button", { name: "Auswahl entfernen" }),
        ).not.toBeInTheDocument();
    });
    it("select-all is scoped to search results and preserves disabled selections", async () => {
        const user = userEvent.setup();
        function Demo() {
            const [value, setValue] = useState<unknown>(["ended"]);
            return (
                <>
                    <CheckboxList
                        options={options}
                        value={value}
                        onChange={setValue}
                        layout="cards"
                        selectAll
                        searchable
                    />
                    <output>{JSON.stringify(value)}</output>
                </>
            );
        }
        render(<Demo />);
        await user.type(
            screen.getByRole("textbox", { name: "Optionen durchsuchen" }),
            "Entwurf",
        );
        await user.click(
            screen.getByRole("checkbox", { name: "Alle sichtbaren auswählen" }),
        );
        expect(screen.getByRole("status")).toHaveTextContent(
            '["ended","draft"]',
        );
    });
    it("does not offer date clearing and disables dates before the minimum", async () => {
        const user = userEvent.setup();
        render(
            <DatePicker
                value="2026-11-13"
                onChange={vi.fn()}
                minDate="2026-11-13"
                maxDate="2026-11-20"
                clearable={false}
            />,
        );
        await user.click(screen.getByRole("button", { name: "13.11.2026" }));
        expect(
            screen.queryByRole("button", { name: "Datum entfernen" }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: /12\. November 2026/ }),
        ).toBeDisabled();
    });
    it("validates date bounds, optional cleared ranges and relation array cardinality", () => {
        const fields = schemaFor([
            {
                name: "date",
                label: "Datum",
                kind: "date",
                minDate: "2026-11-13",
                maxDate: "2026-11-20",
            },
            { name: "range", label: "Zeitraum", kind: "date-range" },
            {
                name: "ids",
                label: "Verträge",
                kind: "relation",
                multiple: true,
                maxSelected: 2,
            },
        ]);
        expect(
            fields.safeParse({
                date: "2026-11-13",
                range: { from: null, to: null },
                ids: [1, 2],
            }).success,
        ).toBe(true);
        expect(fields.safeParse({ date: "2026-11-12" }).success).toBe(false);
        expect(fields.safeParse({ date: "2026-11-21" }).success).toBe(false);
        for (const ids of [[1, 2, 3], [1, 1], ["1"], [0], 1])
            expect(fields.safeParse({ ids }).success).toBe(false);
    });
});

it("preserves explicit null defaults instead of restoring an old field value", async () => {
    const { initialValues } = await import("./forms/schema");
    expect(
        initialValues(
            [{ name: "date", label: "Datum", kind: "date", nullable: true }],
            { date: "2026-11-13" },
            { date: null },
        ),
    ).toEqual({ date: null });
});

it("searches toolbar choices immediately from keyboard focus and retains selection on Escape", async () => {
    const user = userEvent.setup();
    render(
        <SelectDemo
            presentation="menu"
            clearable={false}
            aria-label="Gruppierung"
        />,
    );
    await user.tab();
    await user.keyboard("Entw");
    expect(
        await screen.findByRole("option", { name: /Entwurf/ }),
    ).toBeVisible();
    expect(
        screen.queryByRole("option", { name: /Aktiv/ }),
    ).not.toBeInTheDocument();
    await user.keyboard("{ArrowDown}{Enter}");
    await waitFor(() =>
        expect(
            screen.getByRole("combobox", { name: "Gruppierung" }),
        ).toHaveTextContent("Entwurf"),
    );
    await user.click(screen.getByRole("combobox", { name: "Gruppierung" }));
    expect(
        await screen.findByRole("option", { name: /Entwurf/ }),
    ).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Escape}");
    expect(screen.getByText('"draft"', { exact: true })).toBeVisible();
});

it("accepts a new property without an optional energy class", async () => {
    const { properties } =
        await import("@/modules/properties/properties-resource");
    const { initialValues } = await import("./forms/schema");
    const values = initialValues(properties.fields, undefined, {
        code: "NEW-1",
        name: "Testobjekt",
        street: "Testweg",
        house_number: "7",
        postal_code: "10115",
        city: "Berlin",
    });
    expect(values.energy_class).toBeNull();
    expect(schemaFor(properties.fields).safeParse(values).success).toBe(true);
});
