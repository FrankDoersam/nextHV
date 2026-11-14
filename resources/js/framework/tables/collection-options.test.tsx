import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { Building2 } from "lucide-react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { dataProvider } from "../data/provider";
import type { CollectionOptions, ResourceDefinition } from "../types";
import { WorkbenchProvider } from "../workbench";
import { ResourceCollection } from "./resource-collection";

const resource: ResourceDefinition = {
    name: "properties",
    label: "Objekte",
    singular: "Objekt",
    icon: Building2,
    description: "",
    titleField: "name",
    actions: [],
    fields: [{ name: "status", label: "Status", kind: "select", options: [
        { value: "active", label: "Aktiv" },
    ] }],
    columns: [
        { field: "name", label: "Objekt" },
        { field: "status", label: "Status", kind: "badge" },
    ],
    filters: [{
        field: "status", label: "Status", kind: "choice",
        options: [{ value: "active", label: "Aktiv" }],
    }],
    groupBy: [{ value: "status", label: "Status" }],
};

beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: vi.fn().mockReturnValue({
            matches: false, addEventListener() {}, removeEventListener() {},
        }),
    });
    global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.getAnimations = vi.fn(() => []);
    vi.spyOn(dataProvider, "list").mockResolvedValue({
        data: [{ id: 1, name: "Objekt Nord", status: "active", updated_at: "2026-11-14" }],
        total: 1, current_page: 1, last_page: 1,
    });
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

function mount(options: CollectionOptions) {
    return render(
        <MemoryRouter>
            <QueryClientProvider client={new QueryClient({
                defaultOptions: { queries: { retry: false } },
            })}>
                <WorkbenchProvider>
                    <ResourceCollection resource={resource} summary={false} actions={false} {...options} />
                </WorkbenchProvider>
            </QueryClientProvider>
        </MemoryRouter>,
    );
}

it("hides all row selection, filter and grouping controls independently for a quiet collection", async () => {
    mount({ rowSelection: false, selectAll: false, filterable: false, groupable: false, toolbarFilters: [] });
    await screen.findByText("Objekt Nord");

    expect(screen.queryByRole("checkbox", { name: "Zeile auswählen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Alle Zeilen dieser Seite auswählen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Filter hinzufügen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Gruppierung" })).not.toBeInTheDocument();
});

it("hides only select-all while retaining individual row selection and filter builder", async () => {
    mount({ rowSelection: "multiple", selectAll: false, filterable: true, groupable: false, toolbarFilters: [] });
    await screen.findByText("Objekt Nord");

    expect(screen.getByRole("checkbox", { name: "Zeile auswählen" })).toBeVisible();
    expect(screen.queryByRole("checkbox", { name: "Alle Zeilen dieser Seite auswählen" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filter hinzufügen" })).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Gruppierung" })).not.toBeInTheDocument();
});

it("supports grouping without filter builder or selection", async () => {
    mount({ rowSelection: false, filterable: false, groupable: true, toolbarFilters: [] });
    await screen.findByText("Objekt Nord");

    expect(screen.getByRole("combobox", { name: "Gruppierung" })).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Filter hinzufügen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});
