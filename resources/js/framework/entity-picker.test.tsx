import React, { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
    RelationPicker,
    type EntityPickerProps,
} from "@/components/fields/entity-picker";
import { WorkbenchProvider } from "./workbench";
import { dataProvider } from "./data/provider";
import type { PageResult, RecordData } from "./types";
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
it("batches selected entities, forwards backend filters and searches from keyboard focus without offering create", async () => {
    const rows = [
        {
            id: 1,
            updated_at: "v1",
            code: "MV-1",
            name: "Lindenhof",
            city: "Berlin",
        },
        {
            id: 2,
            updated_at: "v1",
            code: "MV-2",
            name: "Sonnenhof",
            city: "Hamburg",
        },
    ];
    const list = vi
        .spyOn(dataProvider, "list")
        .mockImplementation(async (_resource, params) => ({
            data: params?.query
                ? rows.filter((row) => row.name.includes(params.query!))
                : params?.filters?.some(
                        (filter) => "field" in filter && filter.field === "id",
                    )
                  ? rows.filter((row) =>
                        params.filters!.some(
                            (filter) =>
                                "field" in filter &&
                                filter.field === "id" &&
                                Array.isArray(filter.value) &&
                                filter.value.includes(row.id),
                        ),
                    )
                  : rows,
            total: 2,
            current_page: 1,
            last_page: 1,
        }));
    function Demo() {
        const [value, setValue] = useState<unknown>([1]);
        return (
            <>
                <label htmlFor="entities">Verträge</label>
                <RelationPicker
                    id="entities"
                    resource="contracts"
                    value={value}
                    onChange={setValue}
                    multiple
                    creatable={false}
                    filters={[{ field: "status", value: "active" }]}
                    displayText={(row) => String(row.name)}
                    secondaryText={(row) => String(row.city)}
                />
            </>
        );
    }
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const user = userEvent.setup();
    render(
        <MemoryRouter>
            <QueryClientProvider client={client}>
                <WorkbenchProvider>
                    <Demo />
                </WorkbenchProvider>
            </QueryClientProvider>
        </MemoryRouter>,
    );
    await waitFor(() =>
        expect(screen.getByRole("combobox", { name: "Verträge" })).toHaveValue(
            "Lindenhof",
        ),
    );
    await user.tab();
    await user.keyboard("Sonnen");
    await waitFor(() =>
        expect(list).toHaveBeenCalledWith(
            expect.objectContaining({ name: "contracts" }),
            expect.objectContaining({
                query: "Sonnen",
                filters: [{ field: "status", value: "active" }],
            }),
            expect.anything(),
        ),
    );
    const option = await screen.findByRole("option", { name: /Sonnenhof/ });
    await waitFor(() =>
        expect(option).not.toHaveAttribute("aria-disabled", "true"),
    );
    expect(option).toHaveTextContent("Hamburg");
    await user.click(option);
    await user.keyboard("{Escape}");
    await waitFor(() =>
        expect(screen.getByRole("combobox", { name: "Verträge" })).toHaveValue(
            "Lindenhof, Sonnenhof",
        ),
    );
    expect(
        screen.queryByRole("button", { name: "Vertrag anlegen" }),
    ).not.toBeInTheDocument();
});

it("uses resource picker context to distinguish identical unit titles and reuses fresh option results", async () => {
    const { getResource } = await import("@/modules/registry");
    const resource = getResource("units");
    const previous = resource.picker;
    resource.picker = {
        secondaryFields: ["property.name", "property.city", "code"],
        includes: [{ relation: "property" }],
    };
    const rows = [
        {
            id: 1,
            updated_at: "v1",
            code: "E-01",
            name: "Wohnung 01",
            property: { name: "Lindenhof", city: "Berlin" },
        },
        {
            id: 2,
            updated_at: "v1",
            code: "E-01",
            name: "Wohnung 01",
            property: { name: "Sonnenhof", city: "Hamburg" },
        },
    ];
    const list = vi.spyOn(dataProvider, "list").mockResolvedValue({
        data: rows,
        total: 2,
        current_page: 1,
        last_page: 1,
    });
    function Demo() {
        const [value, setValue] = useState<unknown>(null);
        return (
            <RelationPicker
                resource="units"
                aria-label="Einheit"
                value={value}
                onChange={setValue}
                creatable={false}
            />
        );
    }
    try {
        const user = userEvent.setup();
        render(
            <MemoryRouter>
                <QueryClientProvider
                    client={
                        new QueryClient({
                            defaultOptions: { queries: { retry: false } },
                        })
                    }
                >
                    <WorkbenchProvider>
                        <Demo />
                    </WorkbenchProvider>
                </QueryClientProvider>
            </MemoryRouter>,
        );
        const input = screen.getByRole("combobox", {
            name: "Einheit",
        });
        await user.click(input);
        const option = await screen.findByRole("option", {
            name: /Wohnung 01.*Lindenhof.*Berlin/,
        });
        expect(
            screen.getByRole("option", {
                name: /Wohnung 01.*Sonnenhof.*Hamburg/,
            }),
        ).toBeVisible();
        await user.click(option);
        await waitFor(() => expect(input).toHaveValue("Wohnung 01"));
        await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
        await user.click(input);
        await screen.findByRole("option", {
            name: /Wohnung 01.*Lindenhof.*Berlin/,
        });
        expect(list).toHaveBeenCalledTimes(2);
        expect(list).toHaveBeenCalledWith(
            resource,
            expect.objectContaining({
                includes: [{ relation: "property" }],
                aggregates: [],
            }),
            expect.anything(),
        );
        expect(screen.getByLabelText("Auswahl öffnen")).toHaveAttribute(
            "tabindex",
            "-1",
        );
    } finally {
        resource.picker = previous;
    }
});

function pageOf(data: RecordData[]): PageResult {
    return { data, total: data.length, current_page: 1, last_page: 1 };
}

function deferredPage() {
    let resolve!: (page: PageResult) => void;
    const promise = new Promise<PageResult>((complete) => {
        resolve = complete;
    });
    return { promise, resolve };
}

function renderRelation(props: Partial<EntityPickerProps> = {}) {
    function Demo() {
        const [value, setValue] = useState<unknown>(props.value ?? null);
        return (
            <RelationPicker
                resource="properties"
                aria-label="Objekt"
                creatable={false}
                {...props}
                value={value}
                onChange={(next) => {
                    setValue(next);
                    props.onChange?.(next);
                }}
            />
        );
    }
    return render(
        <MemoryRouter>
            <QueryClientProvider
                client={
                    new QueryClient({
                        defaultOptions: { queries: { retry: false } },
                    })
                }
            >
                <WorkbenchProvider>
                    <Demo />
                </WorkbenchProvider>
            </QueryClientProvider>
        </MemoryRouter>,
    );
}

it("keeps selected captions during hydration without offering records outside the current filter", async () => {
    const historical = { id: 1, updated_at: "v1", name: "Altbestand" };
    const current = { id: 2, updated_at: "v1", name: "Neubau" };
    const hydration = deferredPage();
    const onChange = vi.fn();
    vi.spyOn(dataProvider, "list").mockImplementation(
        async (_resource, params) => {
            const ids = params?.filters?.find(
                (filter) => "field" in filter && filter.field === "id",
            );
            if (ids && "value" in ids) {
                return Array.isArray(ids.value) && ids.value.length === 2
                    ? hydration.promise
                    : pageOf([historical]);
            }
            return pageOf([current]);
        },
    );
    const user = userEvent.setup();
    renderRelation({
        value: [1],
        multiple: true,
        maxSelected: 2,
        creatable: true,
        filters: [{ field: "status", value: "active" }],
        onChange,
    });
    const input = screen.getByRole("combobox", { name: "Objekt" });
    await waitFor(() => expect(input).toHaveValue("Altbestand"));

    await user.click(input);
    await user.click(await screen.findByRole("option", { name: "Neubau" }));
    expect(
        screen.queryByRole("option", { name: "Altbestand" }),
    ).not.toBeInTheDocument();
    expect(
        screen.getByRole("button", { name: "Objekt anlegen" }),
    ).toBeDisabled();
    await user.keyboard("{Escape}");

    expect(input).toHaveValue("Altbestand, Neubau");
    expect(onChange).toHaveBeenCalledExactlyOnceWith([1, 2]);
    await act(async () => hydration.resolve(pageOf([historical, current])));
    await user.click(input);
    expect(
        await screen.findByRole("option", { name: "Neubau" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
        screen.queryByRole("option", { name: "Altbestand" }),
    ).not.toBeInTheDocument();
});

it("aborts superseded and closed searches and ignores a late response", async () => {
    const old = deferredPage();
    const closing = deferredPage();
    let oldSignal: AbortSignal | undefined;
    let closingSignal: AbortSignal | undefined;
    const onChange = vi.fn();
    vi.spyOn(dataProvider, "list").mockImplementation(
        async (_resource, params, signal) => {
            if (params?.query === "Alt") {
                oldSignal = signal;
                return old.promise;
            }
            if (params?.query === "Schließen") {
                closingSignal = signal;
                return closing.promise;
            }
            return pageOf(
                params?.query === "Neu"
                    ? [{ id: 2, updated_at: "v1", name: "Neues Objekt" }]
                    : [],
            );
        },
    );
    const user = userEvent.setup();
    renderRelation({ onChange });
    const input = screen.getByRole("combobox", { name: "Objekt" });
    await user.click(input);
    await user.type(input, "Alt");
    await waitFor(() => expect(oldSignal?.aborted).toBe(false));

    await user.clear(input);
    await user.type(input, "Neu");
    await waitFor(() => expect(oldSignal?.aborted).toBe(true));
    expect(
        await screen.findByRole("option", { name: "Neues Objekt" }),
    ).toBeVisible();
    await act(async () =>
        old.resolve(
            pageOf([{ id: 1, updated_at: "v1", name: "Veraltetes Ergebnis" }]),
        ),
    );
    expect(
        screen.queryByRole("option", { name: "Veraltetes Ergebnis" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Neues Objekt" })).toBeVisible();

    await user.clear(input);
    await user.type(input, "Schließen");
    await waitFor(() => expect(closingSignal?.aborted).toBe(false));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(closingSignal?.aborted).toBe(true));
    expect(input).toHaveValue("");
    expect(onChange).not.toHaveBeenCalled();
});

it("retries a failed search with the same query and filters without erasing a selection", async () => {
    const row = { id: 1, updated_at: "v1", name: "Lindenhof" };
    let searches = 0;
    const list = vi
        .spyOn(dataProvider, "list")
        .mockImplementation(async (_resource, params) => {
            if (
                params?.filters?.some(
                    (filter) => "field" in filter && filter.field === "id",
                )
            )
                return pageOf([row]);
            searches++;
            if (searches === 1) throw new Error("Offline");
            return pageOf([row]);
        });
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderRelation({
        value: 1,
        filters: [{ field: "status", value: "active" }],
        onChange,
    });
    const input = screen.getByRole("combobox", { name: "Objekt" });
    await waitFor(() => expect(input).toHaveValue("Lindenhof"));

    await user.click(input);
    expect(await screen.findByRole("alert")).toHaveTextContent(
        "Suche fehlgeschlagen",
    );
    await user.click(screen.getByRole("button", { name: "Erneut versuchen" }));

    expect(
        await screen.findByRole("option", { name: "Lindenhof" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
        list.mock.calls
            .filter(([, params]) =>
                params?.filters?.some(
                    (filter) => "field" in filter && filter.field === "status",
                ),
            )
            .map(([, params]) => ({
                query: params?.query,
                filters: params?.filters,
            })),
    ).toEqual([
        { query: "", filters: [{ field: "status", value: "active" }] },
        { query: "", filters: [{ field: "status", value: "active" }] },
    ]);
    expect(onChange).not.toHaveBeenCalled();
});

it("retries selected-value hydration independently and never offers an unresolved value as an option", async () => {
    let hydrations = 0;
    vi.spyOn(dataProvider, "list").mockImplementation(
        async (_resource, params) => {
            if (
                params?.filters?.some(
                    (filter) => "field" in filter && filter.field === "id",
                )
            ) {
                hydrations++;
                if (hydrations === 1) throw new Error("Offline");
                return pageOf([
                    { id: 77, updated_at: "v1", name: "Historisches Objekt" },
                ]);
            }
            return pageOf([]);
        },
    );
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderRelation({ value: 77, onChange });
    const input = screen.getByRole("combobox", { name: "Objekt" });
    await waitFor(() =>
        expect(input).toHaveValue("#77 · Laden fehlgeschlagen"),
    );

    await user.click(input);
    expect(await screen.findByRole("alert")).toHaveTextContent(
        "Auswahl konnte nicht geladen werden",
    );
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Erneut versuchen" });
    await waitFor(() => expect(retry).toBeEnabled());
    await user.click(retry);

    await waitFor(() => expect(input).toHaveValue("Historisches Objekt"));
    expect(await screen.findByText("Keine Ergebnisse")).toBeVisible();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
});
