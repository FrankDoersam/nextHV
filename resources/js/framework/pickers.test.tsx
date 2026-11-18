import React, { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
    ChoicePicker,
    type ChoicePickerProps,
} from "@/components/fields/choice-picker";
import { ChoiceButtons } from "@/components/fields/choice-buttons";
import { NumberStepper } from "@/components/fields/number-stepper";
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
    it("searches labeled groups and keeps keyboard selection with custom option content", async () => {
        const user = userEvent.setup();
        render(
            <SelectDemo
                options={options.map((option) => ({
                    ...option,
                    group: option.value === "active" ? "Bestand" : "Planung",
                }))}
                renderOption={(option) => (
                    <span>{option.label} · Vorschau</span>
                )}
            />,
        );
        const input = screen.getByRole("combobox", { name: "Status" });
        await user.click(input);
        expect(
            await screen.findByRole("group", { name: "Bestand" }),
        ).toBeVisible();
        expect(screen.getByRole("group", { name: "Planung" })).toBeVisible();

        await user.clear(input);
        await user.type(input, "Planung");
        expect(
            screen.queryByRole("group", { name: "Bestand" }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole("option", { name: "Entwurf · Vorschau" }),
        ).toBeVisible();
        expect(
            screen.getByRole("option", { name: "Beendet · Vorschau" }),
        ).toHaveAttribute("aria-disabled", "true");
        await user.keyboard("{Enter}");

        await waitFor(() => expect(input).toHaveValue("Entwurf"));
        expect(screen.getByText('"draft"', { exact: true })).toBeVisible();
    });

    it("renders custom loading and empty states and exposes an explicit retry action", async () => {
        const user = userEvent.setup();
        const retry = vi.fn();
        const props: ChoicePickerProps = {
            "aria-label": "Partner",
            value: null,
            onChange: vi.fn(),
            loadingContent: <span>Partner werden geladen</span>,
            emptyContent: <span>Keine passenden Partner</span>,
        };
        const view = render(<ChoicePicker {...props} loading />);
        await user.click(screen.getByRole("combobox", { name: "Partner" }));
        expect(await screen.findByRole("status")).toHaveTextContent(
            "Partner werden geladen",
        );
        expect(
            screen.queryByText("Keine passenden Partner"),
        ).not.toBeInTheDocument();

        view.rerender(
            <ChoicePicker
                {...props}
                error="Suche fehlgeschlagen"
                onRetry={retry}
            />,
        );
        await user.click(
            screen.getByRole("button", { name: "Erneut versuchen" }),
        );
        expect(retry).toHaveBeenCalledTimes(1);
        view.rerender(<ChoicePicker {...props} />);

        expect(
            await screen.findByText("Keine passenden Partner"),
        ).toBeVisible();
        expect(
            screen.queryByText("Partner werden geladen"),
        ).not.toBeInTheDocument();
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("keeps the committed value visible on focus and never clears it while typing a search", async () => {
        const user = userEvent.setup();
        render(<SelectDemo />);
        const input = screen.getByRole("combobox", { name: "Status" });
        expect(input).toHaveValue("Aktiv");
        await user.click(input);
        expect(input).toHaveValue("Aktiv");
        expect(screen.getByText('"active"', { exact: true })).toBeVisible();
        expect(
            await screen.findByRole("option", { name: /Entwurf/ }),
        ).toBeVisible();
        await user.clear(input);
        expect(input).toHaveValue("");
        expect(screen.getByText('"active"', { exact: true })).toBeVisible();
        await user.type(input, "Entw");
        expect(input).toHaveValue("Entw");
        expect(screen.getByText('"active"', { exact: true })).toBeVisible();
        await user.click(
            await screen.findByRole("option", { name: /Entwurf/ }),
        );
        expect(input).toHaveValue("Entwurf");
        expect(screen.getByText('"draft"', { exact: true })).toBeVisible();
    });

    it("opens a rich selected value without replacing it with an empty input", async () => {
        const user = userEvent.setup();
        render(<SelectDemo selectedDisplay="rich" />);
        const input = screen.getByRole("combobox", { name: "Status" });
        await user.click(input);
        expect(input).toHaveValue("Aktiv");
        expect(screen.getByText('"active"', { exact: true })).toBeVisible();
        await user.keyboard("{Escape}");
        expect(input).toHaveValue("Aktiv");
    });

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
    it("summarizes multiple filter values with a stable count while preserving the full selection on reopen", async () => {
        const user = userEvent.setup();
        render(
            <SelectDemo
                presentation="chip"
                multiple
                aria-label="Status Werte"
            />,
        );
        const trigger = screen.getByRole("combobox", { name: "Status Werte" });
        await user.click(trigger);
        await user.click(
            await screen.findByRole("option", { name: /Entwurf/ }),
        );
        await user.keyboard("{Escape}");
        expect(trigger).toHaveAttribute("title", "Aktiv, Entwurf");
        expect(trigger).toHaveTextContent("Aktiv");
        expect(trigger).not.toHaveTextContent("Entwurf");
        expect(screen.getByLabelText("2 ausgewählt")).toHaveTextContent("+1");
        await user.click(trigger);
        expect(
            await screen.findByRole("option", { name: /Aktiv/ }),
        ).toHaveAttribute("aria-selected", "true");
        expect(screen.getByRole("option", { name: /Entwurf/ })).toHaveAttribute(
            "aria-selected",
            "true",
        );
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
        expect(screen.getByRole("textbox")).toHaveValue("13.11.2026");
        await user.click(
            screen.getByRole("button", { name: "Kalender öffnen" }),
        );
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
    // REST defaults/options arrive via metadata; this unit test concerns only the optional control.
    const energy = properties.fields.find(
        (field) => field.name === "energy_class",
    )!;
    expect(
        schemaFor([energy]).safeParse({ energy_class: values.energy_class })
            .success,
    ).toBe(true);
});

describe("rich business controls", () => {
    it("renders rich captions when closed but keeps keyboard search, clearing and preselection", async () => {
        const user = userEvent.setup();
        render(
            <SelectDemo
                selectedDisplay="rich"
                options={[
                    {
                        value: "active",
                        label: "Aktiv",
                        description: "Vermietung",
                        image: "/images/building.svg",
                        badge: "Bereit",
                        badgeTone: "success",
                    },
                    {
                        value: "draft",
                        label: "Entwurf",
                        description: "In Vorbereitung",
                    },
                ]}
            />,
        );
        expect(screen.getByText("Vermietung")).toBeVisible();
        expect(screen.getByText("Bereit")).toBeVisible();
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
        expect(
            document.querySelector('[data-slot="choice-selection"]'),
        ).toHaveTextContent("In Vorbereitung");
        await user.click(
            screen.getByRole("button", { name: "Auswahl öffnen" }),
        );
        expect(
            await screen.findByRole("option", { name: /Entwurf/ }),
        ).toHaveAttribute("aria-selected", "true");
        await user.keyboard("{Escape}");
        await user.click(
            screen.getByRole("button", { name: "Auswahl entfernen" }),
        );
        expect(screen.queryByText("In Vorbereitung")).not.toBeInTheDocument();
    });
    it("changes a payment-style radio group with keyboard and skips disabled choices", async () => {
        const user = userEvent.setup();
        function Demo() {
            const [value, setValue] = useState<unknown>("card");
            return (
                <ChoiceButtons
                    aria-label="Zahlungsart"
                    value={value}
                    onChange={setValue}
                    options={[
                        { value: "card", label: "Karte" },
                        { value: "cash", label: "Bar", disabled: true },
                        { value: "wallet", label: "Wallet" },
                    ]}
                />
            );
        }
        render(<Demo />);
        expect(screen.getByRole("radio", { name: "Karte" })).toBeChecked();
        await user.tab();
        await user.keyboard("{ArrowRight}");
        await waitFor(() =>
            expect(screen.getByRole("radio", { name: "Wallet" })).toBeChecked(),
        );
        expect(screen.getByRole("radio", { name: "Bar" })).toHaveAttribute(
            "aria-disabled",
            "true",
        );
    });
    it("increments, respects limits and allows clearing the numeric value", async () => {
        const user = userEvent.setup();
        function Demo() {
            const [value, setValue] = useState<number | null>(1);
            return (
                <>
                    <NumberStepper
                        aria-label="Anzahl"
                        label="Anzahl"
                        value={value}
                        onChange={setValue}
                        min={1}
                        max={2}
                    />
                    <output>{JSON.stringify(value)}</output>
                </>
            );
        }
        render(<Demo />);
        expect(
            screen.getByRole("button", { name: "Anzahl verringern" }),
        ).toBeDisabled();
        await user.click(
            screen.getByRole("button", { name: "Anzahl erhöhen" }),
        );
        expect(screen.getByRole("status")).toHaveTextContent("2");
        expect(
            screen.getByRole("button", { name: "Anzahl erhöhen" }),
        ).toBeDisabled();
        await user.clear(screen.getByLabelText("Anzahl", { exact: true }));
        expect(screen.getByRole("status")).toHaveTextContent("null");
    });
});
