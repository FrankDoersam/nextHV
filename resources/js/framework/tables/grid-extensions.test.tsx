import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Building2 } from "lucide-react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dataProvider } from "../data/provider";
import type { ResourceDefinition } from "../types";
import { WorkbenchProvider } from "../workbench";
import { CellRenderer } from "./cell-renderer";
import { exportColumnValue } from "./cell-value";
import { compileGridFilters, sanitizeGridFilters } from "./filter-rules";
import { ResourceCollection } from "./resource-collection";
import { readGridState, writeGridState } from "./grid-state";
const resource: ResourceDefinition = {
    name: "demo",
    label: "Einträge",
    singular: "Eintrag",
    description: "",
    icon: Building2,
    titleField: "name",
    actions: [],
    fields: [
        {
            name: "status",
            label: "Status",
            kind: "select",
            options: [
                { value: "active", label: "Aktiv" },
                { value: "draft", label: "Entwurf" },
            ],
        },
    ],
    columns: [
        { field: "name", label: "Name" },
        { field: "status", label: "Status", kind: "badge" },
    ],
    views: [
        { id: "all", label: "Alle" },
        {
            id: "active",
            label: "Aktive Verträge",
            filters: [{ field: "status", value: "active" }],
            query: "Berlin",
        },
    ],
    toolbarFilters: ["status"],
};
function Location() {
    return <output aria-label="URL">{useLocation().search}</output>;
}
function mount(initialEntry = "/?page=3") {
    return render(
        <MemoryRouter initialEntries={[initialEntry]}>
            <QueryClientProvider
                client={
                    new QueryClient({
                        defaultOptions: { queries: { retry: false } },
                    })
                }
            >
                <WorkbenchProvider>
                    <ResourceCollection
                        resource={resource}
                        fixedFilters={[{ field: "property_id", value: 9 }]}
                        filterable={false}
                        groupable={false}
                        summary={false}
                    />
                    <Location />
                </WorkbenchProvider>
            </QueryClientProvider>
        </MemoryRouter>,
    );
}
beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: vi.fn().mockReturnValue({
            matches: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
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
        data: [
            { id: 1, name: "Haus", status: "active", updated_at: "2026-01-01" },
        ],
        total: 80,
        current_page: 1,
        last_page: 4,
    });
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});
describe("collection scopes and cells", () => {
    it("persists query tabs, resets pagination and retains parent scope with builder/grouping disabled", async () => {
        const user = userEvent.setup();
        mount();
        await screen.findByText("Haus");
        expect(
            screen.queryByRole("combobox", { name: "Filter hinzufügen" }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole("combobox", { name: "Gruppierung" }),
        ).not.toBeInTheDocument();
        await user.click(screen.getByRole("tab", { name: "Aktive Verträge" }));
        await waitFor(() =>
            expect(dataProvider.list).toHaveBeenLastCalledWith(
                resource,
                expect.objectContaining({
                    query: "Berlin",
                    page: 1,
                    filters: [
                        { field: "property_id", value: 9 },
                        { field: "status", value: "active" },
                    ],
                }),
                expect.any(AbortSignal),
            ),
        );
        expect(screen.getByLabelText("URL")).toHaveTextContent("view=active");
        expect(screen.getByLabelText("URL").textContent).not.toContain(
            "page=3",
        );
        await user.click(
            screen.getByRole("combobox", { name: "Status filtern" }),
        );
        await user.click(
            await screen.findByRole("option", { name: "Entwurf" }),
        );
        await waitFor(() =>
            expect(dataProvider.list).toHaveBeenLastCalledWith(
                resource,
                expect.objectContaining({
                    filters: [
                        { field: "property_id", value: 9 },
                        { field: "status", value: "active" },
                        { field: "status", operator: "in", value: ["draft"] },
                    ],
                }),
                expect.any(AbortSignal),
            ),
        );
        expect(screen.getByRole("tabpanel")).toHaveAttribute(
            "aria-labelledby",
            screen.getByRole("tab", { name: "Aktive Verträge" }).id,
        );
    });
    it("keeps column headers and pagination visible when the server returns no matching rows", async () => {
        vi.mocked(dataProvider.list).mockResolvedValue({
            data: [],
            total: 0,
            current_page: 1,
            last_page: 1,
        });
        mount();
        await screen.findByRole("heading", { name: "Noch keine Einträge" });
        expect(
            screen.getByRole("columnheader", { name: /Name/ }),
        ).toBeVisible();
        expect(
            screen.getByRole("columnheader", { name: /Status/ }),
        ).toBeVisible();
        expect(
            screen.getByRole("combobox", { name: "Zeilen pro Seite" }),
        ).toBeVisible();
        expect(screen.getByText("0–0 von 0")).toBeVisible();
    });
    it("shows refresh progress inside the tab panel, never above the tab strip", async () => {
        const sample = {
            data: [{ id: 1, name: "Haus", status: "active", updated_at: "2026-01-01" }],
            total: 80,
            current_page: 1,
            last_page: 4,
        };
        let finishRefresh!: (value: typeof sample) => void;
        vi.mocked(dataProvider.list)
            .mockResolvedValueOnce(sample)
            .mockImplementationOnce(
                () => new Promise<typeof sample>((resolve) => {
                    finishRefresh = resolve;
                }),
            );
        mount("/");
        await screen.findByText("Haus");

        await userEvent.setup().click(screen.getByRole("button", { name: "Aktualisieren" }));
        const panel = screen.getByRole("tabpanel");
        await waitFor(() => {
            expect(panel.querySelector('[data-slot="collection-table-progress"]')).not.toBeNull();
        });
        expect(document.querySelectorAll('[data-slot="collection-table-progress"]')).toHaveLength(1);
        finishRefresh(sample);
        await waitFor(() => {
            expect(panel.querySelector('[data-slot="collection-table-progress"]')).toBeNull();
        });
    });
    it("validates configured view IDs and keeps unrelated nested-panel URL state", () => {
        const state = readGridState(
            new URLSearchParams("view=active&q=Haus"),
            resource,
        );
        const result = writeGridState(
            new URLSearchParams("panels=example&child.view=all"),
            state,
        );
        expect(result.get("view")).toBe("active");
        expect(result.get("panels")).toBe("example");
        expect(result.get("child.view")).toBe("all");
        expect(
            readGridState(new URLSearchParams("view=unknown"), resource).view,
        ).toBe("");
    });
    it("uses numeric relation IDs and rejects invalid identifiers", () => {
        const definitions = [
            {
                field: "property_id",
                label: "Objekt",
                kind: "relation" as const,
                resource: "properties",
            },
        ];
        const state = sanitizeGridFilters(
            {
                property_id: {
                    operator: "in",
                    values: ["9", "12", "oops", "-3", "1.2"],
                },
            },
            definitions,
        );
        expect(compileGridFilters(state, definitions)).toEqual([
            { field: "property_id", operator: "in", value: [9, 12] },
        ]);
    });
    it("renders avatar/tag overflow and exports scalar labels independently of visual cells", () => {
        const row = {
            id: 1,
            updated_at: "2026-01-01",
            name: "Lindenhöfe",
            property: { name: "Nordhof" },
            owners: [
                { name: "Anna Beck" },
                { name: "Jan Lang" },
                { name: "Eva Sommer" },
            ],
            tags: ["Wohnen", "Altbau", "Garten"],
        };
        render(
            <>
                <CellRenderer
                    row={row}
                    column={{
                        field: "owners",
                        label: "Team",
                        cell: { type: "avatars", max: 2 },
                    }}
                />
                <CellRenderer
                    row={row}
                    column={{
                        field: "tags",
                        label: "Tags",
                        cell: { type: "tags", max: 1 },
                    }}
                />
                <CellRenderer
                    row={row}
                    column={{
                        field: "name",
                        label: "Name",
                        cell: { type: "text", secondary: "property.name" },
                    }}
                />
            </>,
        );
        expect(screen.getByText("Nordhof")).toBeInTheDocument();
        expect(screen.getByText("+1")).toBeInTheDocument();
        expect(screen.getByText("+2")).toBeInTheDocument();
        expect(
            exportColumnValue(row, { field: "property.name", label: "Objekt" }),
        ).toBe("Nordhof");
        expect(
            exportColumnValue(row, {
                field: "owners",
                label: "Team",
                cell: { type: "avatars" },
            }),
        ).toBe("Anna Beck, Jan Lang, Eva Sommer");
        expect(
            exportColumnValue(row, {
                field: "name",
                label: "Name",
                exportValue: () => "CUSTOM",
            }),
        ).toBe("CUSTOM");
    });
});

it("exports enum labels and booleans even when filtering is disabled, while retaining explicit export overrides", () => {
    const row = { id: 1, updated_at: "v1", role: "tenant", is_primary: true };
    const role = {
        field: "role",
        label: "Rolle",
        filter: false as const,
        options: [{ value: "tenant", label: "Mieter" }],
    };
    expect(exportColumnValue(row, role)).toBe("Mieter");
    expect(
        exportColumnValue(row, { field: "is_primary", label: "Hauptkontakt" }),
    ).toBe("Ja");
    expect(
        exportColumnValue(row, {
            ...role,
            exportValue: (record) => String(record.role),
        }),
    ).toBe("tenant");
});
