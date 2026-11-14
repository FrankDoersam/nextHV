import React, { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm } from "react-hook-form";
import { CurrencyField } from "@/components/fields/currency-field";
import { DatePicker } from "@/components/fields/pickers";
import { ResourceField } from "@/components/fields/field";
import type { FieldDefinition, Values } from "./types";

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

function DateForm({
    definition,
    defaults,
    onSubmit,
}: {
    definition: FieldDefinition;
    defaults: Values;
    onSubmit: (values: Values) => void;
}) {
    const form = useForm<Values>({ defaultValues: defaults, mode: "onBlur" });
    return (
        <FormProvider {...form}>
            <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
                <ResourceField definition={definition} />
                <output aria-label="Änderungsstatus">
                    {form.formState.isDirty ? "Geändert" : "Unverändert"}
                </output>
                <button type="submit">Speichern</button>
            </form>
        </FormProvider>
    );
}

describe("currency editing", () => {
    it("keeps the currency outside the editable number and submits numeric locale input", async () => {
        const user = userEvent.setup();
        function Demo() {
            const [amount, setAmount] = useState<number | null>(1234.5);
            return (
                <>
                    <CurrencyField
                        aria-label="Miete"
                        value={amount}
                        onChange={setAmount}
                    />
                    <output>{JSON.stringify(amount)}</output>
                </>
            );
        }
        render(<Demo />);
        const input = screen.getByRole("textbox", { name: "Miete" });
        expect(input).toHaveValue("1.234,50");
        expect(screen.getByText("EUR")).toBeVisible();
        expect(input).toHaveAccessibleDescription("EUR");

        await user.clear(input);
        await user.type(input, "2450,75");
        await user.tab();

        expect(input).toHaveValue("2.450,75");
        expect(screen.getByRole("status")).toHaveTextContent("2450.75");
        expect((input as HTMLInputElement).value).not.toContain("EUR");
    });
});

describe("typed dates", () => {
    it("recognizes compact dates, rejects impossible days and skips the auxiliary calendar button on Tab", async () => {
        const user = userEvent.setup();
        const submit = vi.fn();
        render(
            <DateForm
                definition={{
                    name: "starts_on",
                    label: "Beginn",
                    kind: "date",
                }}
                defaults={{ starts_on: null }}
                onSubmit={submit}
            />,
        );
        const input = screen.getByRole("textbox", { name: "Beginn" });
        await user.click(input);
        await user.keyboard("01012026");
        expect(input).toHaveValue("01.01.2026");
        await user.tab();
        expect(screen.getByRole("button", { name: "Speichern" })).toHaveFocus();
        await user.keyboard("{Enter}");
        await waitFor(() =>
            expect(submit).toHaveBeenCalledWith(
                { starts_on: "2026-01-01" },
                expect.anything(),
            ),
        );
        submit.mockClear();
        await user.clear(input);
        await user.type(input, "31022026");
        await user.click(screen.getByRole("button", { name: "Speichern" }));
        expect(submit).not.toHaveBeenCalled();
        expect(screen.getAllByRole("alert")[0]).toHaveTextContent(
            "gültiges Datum",
        );
    });

    it("keeps an invalid draft visible without emitting it to standalone consumers and accepts leap days", async () => {
        const user = userEvent.setup();
        const change = vi.fn();
        render(
            <DatePicker
                aria-label="Datum"
                value="2026-02-28"
                onChange={change}
                clearable={false}
            />,
        );
        const input = screen.getByRole("textbox", { name: "Datum" });
        await user.clear(input);
        await user.type(input, "31.02.2026");
        await user.tab();

        expect(input).toHaveValue("31.02.2026");
        expect(input).toBeInvalid();
        expect(screen.getByRole("alert")).toHaveTextContent("gültiges Datum");
        expect(change).not.toHaveBeenCalled();

        await user.clear(input);
        await user.type(input, "29.2.2028");
        await user.tab();
        expect(change).toHaveBeenLastCalledWith("2028-02-29");
        expect(input).toHaveValue("29.02.2028");
        expect(input).toBeValid();
    });

    it("blocks invalid form drafts and bounds while preserving dirty state, then submits ISO dates", async () => {
        const user = userEvent.setup();
        const submit = vi.fn();
        render(
            <DateForm
                definition={{
                    name: "starts_on",
                    label: "Vertragsbeginn",
                    kind: "date",
                    clearable: false,
                    minDate: "2026-11-13",
                    maxDate: "2026-11-20",
                }}
                defaults={{ starts_on: "2026-11-13" }}
                onSubmit={submit}
            />,
        );
        const input = screen.getByRole("textbox", { name: "Vertragsbeginn" });
        await user.clear(input);
        await user.type(input, "31.02.2026");
        await user.click(screen.getByRole("button", { name: "Speichern" }));
        expect(submit).not.toHaveBeenCalled();
        expect(screen.getByRole("alert")).toHaveTextContent("gültiges Datum");
        expect(
            screen.getByRole("status", { name: "Änderungsstatus" }),
        ).toHaveTextContent("Geändert");

        await user.clear(input);
        await user.type(input, "12.11.2026");
        await user.click(screen.getByRole("button", { name: "Speichern" }));
        expect(submit).not.toHaveBeenCalled();
        expect(screen.getByRole("alert")).toHaveTextContent(
            "nicht vor dem 13.11.2026",
        );

        await user.clear(input);
        await user.type(input, "21.11.2026");
        await user.click(screen.getByRole("button", { name: "Speichern" }));
        expect(submit).not.toHaveBeenCalled();
        expect(screen.getByRole("alert")).toHaveTextContent(
            "nicht nach dem 20.11.2026",
        );

        await user.clear(input);
        await user.type(input, "14.11.2026");
        await user.click(screen.getByRole("button", { name: "Speichern" }));
        await waitFor(() =>
            expect(submit).toHaveBeenCalledWith(
                { starts_on: "2026-11-14" },
                expect.anything(),
            ),
        );
    });

    it("rejects manual clearing when disabled and recovers through the calendar", async () => {
        const user = userEvent.setup();
        const submit = vi.fn();
        render(
            <DateForm
                definition={{
                    name: "starts_on",
                    label: "Beginn",
                    kind: "date",
                    clearable: false,
                    minDate: "2026-11-13",
                    maxDate: "2026-11-20",
                }}
                defaults={{ starts_on: "2026-11-13" }}
                onSubmit={submit}
            />,
        );
        await user.clear(screen.getByRole("textbox", { name: "Beginn" }));
        await user.click(screen.getByRole("button", { name: "Speichern" }));
        expect(submit).not.toHaveBeenCalled();
        expect(screen.getByRole("alert")).toHaveTextContent(
            "Bitte ein Datum eingeben",
        );

        await user.click(
            screen.getByRole("button", { name: "Kalender öffnen" }),
        );
        expect(
            screen.queryByRole("button", { name: "Datum entfernen" }),
        ).not.toBeInTheDocument();
        await user.click(
            screen.getByRole("button", { name: /20\. November 2026/ }),
        );
        await user.click(screen.getByRole("button", { name: "Speichern" }));

        await waitFor(() =>
            expect(submit).toHaveBeenCalledWith(
                { starts_on: "2026-11-20" },
                expect.anything(),
            ),
        );
        expect(screen.getByRole("textbox", { name: "Beginn" })).toHaveValue(
            "20.11.2026",
        );
    });

    it("accepts an explicitly cleared optional date as null", async () => {
        const user = userEvent.setup();
        const submit = vi.fn();
        render(
            <DateForm
                definition={{
                    name: "ends_on",
                    label: "Ende",
                    kind: "date",
                    clearable: true,
                }}
                defaults={{ ends_on: "2026-11-13" }}
                onSubmit={submit}
            />,
        );
        await user.clear(screen.getByRole("textbox", { name: "Ende" }));
        await user.click(screen.getByRole("button", { name: "Speichern" }));

        await waitFor(() =>
            expect(submit).toHaveBeenCalledWith(
                { ends_on: null },
                expect.anything(),
            ),
        );
    });

    it("validates a manually entered range without losing the other endpoint", async () => {
        const user = userEvent.setup();
        const submit = vi.fn();
        render(
            <DateForm
                definition={{
                    name: "period",
                    label: "Zeitraum",
                    kind: "date-range",
                }}
                defaults={{ period: { from: "2026-11-13", to: "2026-11-20" } }}
                onSubmit={submit}
            />,
        );
        const until = screen.getByRole("textbox", { name: "Bis" });
        await user.clear(until);
        await user.type(until, "12.11.2026");
        await user.click(screen.getByRole("button", { name: "Speichern" }));
        expect(submit).not.toHaveBeenCalled();
        expect(screen.getByRole("alert")).toHaveTextContent(
            "Ende darf nicht vor dem Beginn",
        );

        await user.clear(until);
        await user.type(until, "18.11.2026");
        await user.click(screen.getByRole("button", { name: "Speichern" }));

        await waitFor(() =>
            expect(submit).toHaveBeenCalledWith(
                { period: { from: "2026-11-13", to: "2026-11-18" } },
                expect.anything(),
            ),
        );
    });
});
