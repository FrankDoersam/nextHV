import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { CollectionViews, collectionViewTabId } from "./collection-views";
import { ResourceFilters } from "./resource-filters";
import { useResourceList, useSaveRecord } from "../data/hooks";
import { dataProvider } from "../data/provider";
import type { ResourceDefinition } from "../types";

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
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

const resource: ResourceDefinition = {
    name: "properties",
    label: "Objekte",
    singular: "Objekt",
    description: "",
    icon: Building2,
    titleField: "name",
    actions: [],
    columns: [{ field: "name", label: "Objekt" }],
    fields: [{ name: "name", label: "Name" }],
};

describe("collection view controls", () => {
    it("refreshes server counts after a save with a supported page size while keeping the active table cached", async () => {
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false, staleTime: Infinity } },
        });
        const old = { id: 1, name: "Alt", updated_at: "2026-11-14T09:00:00Z" };
        const other = {
            id: 2,
            name: "Unverändert",
            updated_at: old.updated_at,
        };
        const listKey = ["resources", "properties", "list", {}];
        client.setQueryData(listKey, { data: [old, other], total: 2 });
        const stableOther = client.getQueryData<{ data: unknown[] }>(listKey)!
            .data[1];
        let total = 2;
        const list = vi
            .spyOn(dataProvider, "list")
            .mockImplementation(async (_resource, params) => {
                if (params?.limit !== 10)
                    throw new Error(
                        "Unsupported count page size or unexpected table reload",
                    );
                return { data: [], total, current_page: 1, last_page: 1 };
            });
        vi.spyOn(dataProvider, "save").mockImplementation(async () => {
            total = 3;
            return { ...old, name: "Neu" };
        });
        function Example() {
            useResourceList(resource);
            const save = useSaveRecord(resource);
            return (
                <>
                    <CollectionViews
                        resource={resource}
                        views={[{ id: "all", label: "Alle", count: true }]}
                        active="all"
                        panelId="records-panel"
                        fixedFilters={[]}
                        onChange={() => {}}
                    />
                    <div
                        id="records-panel"
                        role="tabpanel"
                        aria-labelledby={collectionViewTabId(
                            "records-panel",
                            "all",
                        )}
                    >
                        <button onClick={() => save({ name: "Neu" }, old)}>
                            Speichern
                        </button>
                    </div>
                </>
            );
        }
        render(
            <QueryClientProvider client={client}>
                <Example />
            </QueryClientProvider>,
        );
        const tab = await screen.findByRole("tab", { name: /Alle\s*2/ });
        expect(tab).toHaveAttribute("aria-controls", "records-panel");
        expect(screen.getByRole("tabpanel")).toHaveAttribute(
            "aria-labelledby",
            tab.id,
        );

        await userEvent
            .setup()
            .click(screen.getByRole("button", { name: "Speichern" }));

        await screen.findByRole("tab", { name: /Alle\s*3/ });
        expect(list).toHaveBeenCalledTimes(2);
        expect(client.getQueryData<{ data: unknown[] }>(listKey)!.data[1]).toBe(
            stableOther,
        );
        expect(
            client.getQueryData<{ data: { name: string }[] }>(listKey)!.data[0]
                .name,
        ).toBe("Neu");
    });

    it("resets only builder chips and preserves direct toolbar filters", async () => {
        const onChange = vi.fn();
        render(
            <ResourceFilters
                definitions={[{ field: "city", label: "Ort", kind: "text" }]}
                value={{
                    city: { operator: "contains", values: ["Berlin"] },
                    status: { operator: "in", values: ["active"] },
                }}
                onChange={onChange}
            />,
        );

        await userEvent.setup().click(
            screen.getByRole("button", {
                name: "Alle 1 Filter zurücksetzen",
            }),
        );

        await waitFor(() =>
            expect(onChange).toHaveBeenCalledExactlyOnceWith({
                status: { operator: "in", values: ["active"] },
            }),
        );
    });
});
