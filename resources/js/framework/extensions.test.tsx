import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FormProvider, useForm } from "react-hook-form";
import { Building2 } from "lucide-react";
import { WorkbenchProvider, useWorkbench } from "./workbench";
import { dataProvider } from "./data/provider";
import { ResourceCollection, formatCell } from "./tables/resource-collection";
import { readGridState, writeGridState } from "./tables/grid-state";
import { readPanels, panelSearch } from "./navigation/panels";
import { csvCell } from "./tables/export";
import { safeDocumentUrl, actionResult } from "./action-results";
import { schemaFor } from "./forms/schema";
import { ErrorState } from "@/components/blocks/content";
import { ResourceField } from "@/components/fields/field";
import { ApiError } from "./data/http";
import { DeleteAction, EditAction, ResourceAction } from "./actions";
import type { ResourceDefinition, Values } from "./types";
Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
    })),
});
global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
};
// JSDOM AbortSignal and Node's native Request belong to different realms.
// These navigation tests use no loaders; omit that incompatible test-only signal.
const NativeRequest = globalThis.Request;
globalThis.Request = class extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(input, { ...init, signal: undefined });
    }
};
Element.prototype.scrollIntoView = vi.fn();
Element.prototype.getAnimations = vi.fn(() => []);
const rows = [
    {
        id: 8,
        code: "MV-8",
        name: "Lindenhöfe",
        city: "Berlin",
        notes: "",
        updated_at: "2026-01-01T00:00:00Z",
    },
];
const resource: ResourceDefinition = {
    name: "properties",
    label: "Objekte",
    singular: "Objekt",
    description: "Stammdaten",
    icon: Building2,
    titleField: "name",
    fields: [
        { name: "name", label: "Name", required: true },
        { name: "notes", label: "Notiz", kind: "textarea" },
    ],
    columns: [
        { field: "name", label: "Objekt" },
        { field: "city", label: "Ort" },
    ],
    actions: [new EditAction(), new DeleteAction()],
    filters: [
        {
            field: "status",
            label: "Status",
            options: [{ value: "active", label: "Aktiv" }],
        },
    ],
    groupBy: [{ value: "city", label: "Ort" }],
};
function mount(element: React.ReactNode, entry = "/properties") {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const router = createMemoryRouter(
        [
            {
                path: "*",
                element: (
                    <QueryClientProvider client={client}>
                        <WorkbenchProvider>{element}</WorkbenchProvider>
                    </QueryClientProvider>
                ),
            },
        ],
        { initialEntries: [entry] },
    );
    render(<RouterProvider router={router} />);
    return router;
}
function Opener({ relation = false }: { relation?: boolean }) {
    const workbench = useWorkbench();
    return (
        <button
            onClick={() =>
                workbench.openForm({
                    resource: relation
                        ? {
                              ...resource,
                              name: "contracts",
                              singular: "Vertrag",
                              relations: [
                                  {
                                      resource: "rent-conditions",
                                      label: "Konditionen",
                                      field: "contract_id",
                                  },
                              ],
                          }
                        : resource,
                    mode: "edit",
                    row: rows[0],
                })
            }
        >
            Bearbeiten öffnen
        </button>
    );
}
beforeEach(() => {
    vi.spyOn(dataProvider, "list").mockImplementation(async (r) => ({
        data: r.name === "rent-conditions" ? [] : rows,
        total: r.name === "rent-conditions" ? 0 : 1,
        current_page: 1,
        last_page: 1,
    }));
    vi.spyOn(dataProvider, "one").mockImplementation(async (r, id) =>
        r.name === "rent-conditions"
            ? {
                  id,
                  updated_at: rows[0].updated_at,
                  contract_id: 8,
                  effective_from: "2026-01-02",
                  base_rent: 1234.5,
                  service_charge: 100,
                  heating_cost: 80,
                  vat_rate: 0,
              }
            : rows[0],
    );
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});
describe("navigation and results", () => {
    it("keeps table state in the URL and sanitizes unsupported values", () => {
        const state = readGridState(
            new URLSearchParams(
                'q=Berlin&page=3&perPage=50&sort=[{"id":"name","desc":true}]&filters={"status":"active","secret":"x"}&columns={"city":false,"secret":false}&group=city',
            ),
            resource,
        );
        expect(state.pagination).toEqual({ pageIndex: 2, pageSize: 50 });
        expect(state.filters).toEqual({
            status: { operator: "in", values: ["active"] },
        });
        expect(state.columnVisibility).toEqual({ city: false });
        const url = writeGridState(new URLSearchParams("panels=[]"), state);
        expect(url.get("panels")).toBe("[]");
        expect(readGridState(url, resource)).toEqual(state);
        expect(
            readGridState(
                new URLSearchParams("page=NaN&perPage=999&sort=oops"),
                resource,
            ).pagination,
        ).toEqual({ pageIndex: 0, pageSize: 25 });
    });
    it("rejects unknown filter fields, operators and values while preserving exclusion rules", () => {
        const state = readGridState(
            new URLSearchParams({
                filters: JSON.stringify({
                    status: {
                        operator: "not in",
                        values: ["active", "active", "forged"],
                    },
                    secret: { operator: "in", values: ["x"] },
                }),
            }),
            resource,
        );
        expect(state.filters).toEqual({
            status: { operator: "not in", values: ["active"] },
        });
        expect(
            readGridState(
                writeGridState(
                    new URLSearchParams("contract.tab=parties"),
                    state,
                    "units.",
                ),
                resource,
                "units.",
            ).filters,
        ).toEqual(state.filters);
        for (const invalid of [
            { operator: "raw", values: ["active"] },
            { operator: "in", values: [] },
            { operator: "in", values: [null, 1, "bad"] },
        ]) {
            expect(
                readGridState(
                    new URLSearchParams({
                        filters: JSON.stringify({ status: invalid }),
                    }),
                    resource,
                ).filters,
            ).toEqual({});
        }
    });
    it("rejects malformed deep links and roundtrips only record descriptors", () => {
        expect(readPanels("?panels=invalid")).toEqual([]);
        const panel = {
            key: "p1",
            resource: "rent-conditions",
            mode: "create" as const,
            presentation: "sheet" as const,
            context: { resource: "contracts", id: 8, field: "contract_id" },
        };
        expect(readPanels(panelSearch("q=Linden", [panel]))).toEqual([panel]);
        expect(
            readPanels(
                '?panels=[{"key":"p1","resource":"units","mode":"edit","id":-1,"presentation":"sheet"}]',
            ),
        ).toEqual([]);
    });
    it("formats dates before rendering the clickable title column", () => {
        expect(
            formatCell(
                { field: "effective_from", label: "Datum", kind: "date" },
                {
                    id: 1,
                    updated_at: "",
                    effective_from: "2026-01-02T00:00:00Z",
                },
            ),
        ).toBe("02.01.2026");
    });
    it("rejects external document sources and escapes spreadsheet formulas", () => {
        expect(() =>
            safeDocumentUrl("https://example.com/report.pdf"),
        ).toThrow();
        expect(() => safeDocumentUrl("/auth/login")).toThrow();
        expect(safeDocumentUrl("/api/v1/properties/8/report")).toContain(
            "/api/v1/",
        );
        expect(csvCell("=HYPERLINK(1)")).toBe('"\'=HYPERLINK(1)"');
        expect(
            actionResult({
                data: {
                    result: {
                        data: {
                            ui: {
                                type: "details",
                                title: "Check",
                                items: [{ label: "Einheiten", value: 5 }],
                            },
                        },
                    },
                },
            })?.type,
        ).toBe("details");
    });
    it("opens edit on double click, makes a deep link and blocks dirty browser Back", async () => {
        const user = userEvent.setup();
        const router = mount(<ResourceCollection resource={resource} />);
        await user.dblClick(await screen.findByText("Berlin"));
        await screen.findByRole("heading", { name: "Objekt bearbeiten" });
        expect(readPanels(router.state.location.search)[0]).toMatchObject({
            mode: "edit",
            id: 8,
            presentation: "sheet",
        });
        await user.type(screen.getByLabelText("Notiz"), "Nicht verlieren");
        await router.navigate(-1);
        expect(
            await screen.findByRole("heading", {
                name: "Änderungen verwerfen?",
            }),
        ).toBeVisible();
        await user.click(
            screen.getByRole("button", { name: "Weiter bearbeiten" }),
        );
        expect(screen.getByLabelText("Notiz")).toHaveValue("Nicht verlieren");
    });
    it("rehydrates edit sheets from a direct link", async () => {
        const search = panelSearch("", [
            {
                key: "edit1",
                resource: "rent-conditions",
                mode: "edit",
                id: 12,
                presentation: "sheet",
            },
        ]);
        mount(<p>Vertrag</p>, "/contracts/8?" + search);
        expect(
            await screen.findByRole("heading", {
                name: "Kondition bearbeiten",
            }),
        ).toBeVisible();
        expect(
            screen.getByLabelText("Gültig ab", { exact: false }),
        ).toHaveTextContent("02.01.2026");
        expect(
            screen.getByRole("combobox", { name: /Vertrag/ }),
        ).toBeDisabled();
    });
    it("preserves dirty parent forms and locks the relation in nested sheets", async () => {
        const user = userEvent.setup();
        const router = mount(<Opener relation />, "/contracts");
        await user.click(screen.getByText("Bearbeiten öffnen"));
        await user.type(await screen.findByLabelText("Notiz"), "Elternnotiz");
        await user.click(
            await screen.findByRole("button", { name: "Hinzufügen" }),
        );
        expect(
            await screen.findByRole("heading", { name: "Kondition anlegen" }),
        ).toBeVisible();
        expect(
            screen.getByRole("combobox", { name: /Vertrag/ }),
        ).toBeDisabled();
        expect(readPanels(router.state.location.search)[1].context).toEqual({
            resource: "contracts",
            id: 8,
            field: "contract_id",
        });
        expect(
            document.querySelector(
                '[data-slot="sheet-content"][data-stacked="true"]',
            ),
        ).not.toBeNull();
        await user.click(screen.getByRole("button", { name: "Abbrechen" }));
        expect(await screen.findByLabelText("Notiz")).toHaveValue(
            "Elternnotiz",
        );
    });
    it("disables row selection through the public prop", async () => {
        mount(
            <ResourceCollection
                resource={resource}
                rowSelection={false}
                doubleClickEdit={false}
            />,
        );
        await screen.findByText("Berlin");
        expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    });
    it("shows all deletion blockers and removes the destructive submit", async () => {
        vi.spyOn(DeleteAction.prototype, "prepare").mockResolvedValue({
            blockers: [
                {
                    label: "Lindenhöfe",
                    allowed: false,
                    reasons: ["Aktives Objekt", "Einheiten vorhanden"],
                },
            ],
        });
        const user = userEvent.setup();
        mount(<ResourceCollection resource={resource} />);
        await user.click(
            await screen.findByRole("checkbox", { name: "Zeile auswählen" }),
        );
        await user.click(screen.getByRole("button", { name: "Löschen" }));
        expect(
            await screen.findByRole("heading", {
                name: "Löschen nicht möglich",
            }),
        ).toBeVisible();
        expect(screen.getByText("Aktives Objekt")).toBeVisible();
        expect(screen.getByText("Einheiten vorhanden")).toBeVisible();
        expect(
            screen.queryByRole("button", { name: "Löschen bestätigen" }),
        ).not.toBeInTheDocument();
    });
});
function Fields() {
    const form = useForm<Values>({
        defaultValues: { rent: 1234.5, notes: "", choices: [] },
    });
    return (
        <FormProvider {...form}>
            <ResourceField
                definition={{
                    name: "rent",
                    label: "Miete",
                    kind: "currency",
                    min: 0,
                }}
            />
            <ResourceField
                definition={{
                    name: "notes",
                    label: "Notiz",
                    kind: "textarea",
                    minLength: 3,
                    maxLength: 20,
                    help: "Intern verwenden",
                }}
            />
            <ResourceField
                definition={{
                    name: "choices",
                    label: "Auswahl",
                    kind: "checkbox-group",
                    options: [
                        { value: "a", label: "Option A" },
                        { value: "b", label: "Option B" },
                    ],
                }}
            />
            <output data-testid="amount">{String(form.watch("rent"))}</output>
        </FormProvider>
    );
}
describe("action placement", () => {
    it("offers a toolbar-only single-record action for exactly one selected row", async () => {
        class CheckAction extends ResourceAction {
            id = "check";
            label = "Auswahl prüfen";
            location = "toolbar" as const;
            async execute() {
                return undefined;
            }
        }
        const user = userEvent.setup();
        mount(
            <ResourceCollection
                resource={{ ...resource, actions: [new CheckAction()] }}
            />,
        );
        await screen.findByText("Berlin");
        expect(
            screen.queryByRole("button", { name: "Auswahl prüfen" }),
        ).not.toBeInTheDocument();
        await user.click(
            screen.getByRole("checkbox", { name: "Zeile auswählen" }),
        );
        expect(
            screen.getByRole("button", { name: "Auswahl prüfen" }),
        ).toBeVisible();
    });
});
describe("standard fields", () => {
    it("shows locale currency while keeping a numeric value, counters and checkbox groups", async () => {
        const user = userEvent.setup();
        mount(<Fields />);
        const input = screen.getByRole("textbox", { name: "Miete" });
        expect(input).toHaveValue("1.234,50 €");
        await user.clear(input);
        await user.type(input, "99,25");
        await user.tab();
        expect(screen.getByTestId("amount")).toHaveTextContent("99.25");
        await user.type(screen.getByLabelText("Notiz"), "Hallo");
        expect(screen.getByText("5 / 20 Zeichen · min. 3")).toBeVisible();
        await user.click(screen.getByRole("checkbox", { name: "Option A" }));
        expect(
            screen.getByRole("checkbox", { name: "Option A" }),
        ).toBeChecked();
    });
    it("validates min length and multiselect membership", () => {
        const schema = schemaFor([
            { name: "notes", label: "Notiz", kind: "textarea", minLength: 3 },
            {
                name: "choices",
                label: "Auswahl",
                kind: "multiselect",
                required: true,
                options: [{ value: "a", label: "A" }],
            },
        ]);
        expect(schema.safeParse({ notes: "ok", choices: [] }).success).toBe(
            false,
        );
        expect(schema.safeParse({ notes: "gut", choices: ["x"] }).success).toBe(
            false,
        );
        expect(schema.safeParse({ notes: "gut", choices: ["a"] }).success).toBe(
            true,
        );
    });
    it("groups multiple server errors without repeating identical messages", () => {
        render(
            <ErrorState
                error={
                    new ApiError(422, "Fehler", {
                        a: ["Datum ungültig"],
                        b: ["Grund fehlt", "Datum ungültig"],
                    })
                }
            />,
        );
        expect(screen.getAllByText("Datum ungültig")).toHaveLength(1);
        expect(screen.getByText("Grund fehlt")).toBeVisible();
        expect(
            screen.getByText("2 Hinweise benötigen deine Aufmerksamkeit"),
        ).toBeVisible();
    });
});

describe("relation capabilities and server facets", () => {
    it("turns off collection affordances independently and keeps the unpaged query bounded", async () => {
        const router = mount(
            <ResourceCollection
                resource={resource}
                compact
                searchable={false}
                filterable={false}
                groupable={false}
                pagination={false}
                rowSelection={false}
                actions={false}
                create={false}
                columnChooser={false}
                exportable={false}
                refreshable={false}
                presentationToggle={false}
                detailLink={false}
            />,
            '/properties?q=ignored&filters={"status":["active"]}&group=city',
        );
        expect(await screen.findByText("Lindenhöfe")).toBeVisible();
        expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
        expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
        expect(
            screen.queryByRole("button", {
                name: /Hinzufügen|Spalten|Aktionen|Aktualisieren|Nächste Seite/,
            }),
        ).not.toBeInTheDocument();
        const params = vi.mocked(dataProvider.list).mock.calls.at(-1)![1];
        expect(params).toEqual(
            expect.objectContaining({
                page: 1,
                limit: 100,
                query: "",
                filters: [],
            }),
        );
        await userEvent.dblClick(screen.getByText("Berlin"));
        expect(
            new URLSearchParams(router.state.location.search).has("panels"),
        ).toBe(false);
    });
    it("sends REUI multi-choice filters to the server and restores them from the URL", async () => {
        const router = mount(
            <ResourceCollection
                resource={{
                    ...resource,
                    filters: [
                        {
                            field: "status",
                            label: "Status",
                            options: [
                                { value: "active", label: "Aktiv" },
                                { value: "archived", label: "Archiviert" },
                            ],
                        },
                    ],
                }}
            />,
        );
        const user = userEvent.setup();
        await screen.findByText("Lindenhöfe");
        await user.click(
            screen.getByRole("combobox", { name: "Filter hinzufügen" }),
        );
        await user.click(await screen.findByRole("option", { name: "Status" }));
        // Choosing a field alone must not filter the server data.
        expect(
            vi.mocked(dataProvider.list).mock.calls.at(-1)![1]?.filters,
        ).toEqual([]);
        await user.click(
            screen.getByRole("combobox", {
                name: "Status Operator",
            }),
        );
        await user.click(
            await screen.findByRole("option", {
                name: "ist nicht",
            }),
        );
        await user.click(
            screen.getByRole("combobox", { name: "Status Werte" }),
        );
        await user.click(await screen.findByRole("option", { name: "Aktiv" }));
        await user.click(screen.getByRole("option", { name: "Archiviert" }));
        await waitFor(() =>
            expect(
                vi.mocked(dataProvider.list).mock.calls.at(-1)![1]?.filters,
            ).toContainEqual({
                field: "status",
                operator: "not in",
                value: ["active", "archived"],
            }),
        );
        expect(
            JSON.parse(
                new URLSearchParams(router.state.location.search).get(
                    "filters",
                )!,
            ),
        ).toEqual({
            status: { operator: "not in", values: ["active", "archived"] },
        });
        await user.keyboard("{Escape}");
        await user.click(
            screen.getByRole("combobox", { name: "Status Werte" }),
        );
        expect(
            await screen.findByRole("option", { name: "Aktiv" }),
        ).toHaveAttribute("aria-selected", "true");
        await user.keyboard("{Escape}");
        await user.click(
            screen.getByRole("button", { name: "Status Filter entfernen" }),
        );
        await waitFor(() =>
            expect(
                vi.mocked(dataProvider.list).mock.calls.at(-1)![1]?.filters,
            ).toEqual([]),
        );
        expect(
            new URLSearchParams(router.state.location.search).has("filters"),
        ).toBe(false);
    });
});
