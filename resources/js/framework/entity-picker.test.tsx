import React, { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RelationPicker } from "@/components/fields/entity-picker";
import { WorkbenchProvider } from "./workbench";
import { dataProvider } from "./data/provider";
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
            per_page: 25,
            last_page: 1,
            from: 1,
            to: 2,
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
