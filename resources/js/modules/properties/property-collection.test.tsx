import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditAction } from "@/framework/actions";
import { dataProvider } from "@/framework/data/provider";
import { readPanels } from "@/framework/navigation/panels";
import { configurePermissions } from "@/framework/permissions";
import type {
    PageResult,
    RecordData,
    ResourceDefinition,
} from "@/framework/types";
import { WorkbenchProvider } from "@/framework/workbench";
import { properties } from "./properties-resource";
import { PropertyCollection } from "./property-collection";

const NativeRequest = globalThis.Request;
const clients: QueryClient[] = [];

function resourceFixture(): ResourceDefinition {
    const statuses = [
        { value: "active", label: "Aktiv" },
        { value: "archived", label: "Archiviert" },
    ];
    return {
        ...properties,
        fields: [
            { name: "name", label: "Bezeichnung", required: true },
            { name: "code", label: "Objektnummer" },
            { name: "city", label: "Ort" },
            { name: "manager_email", label: "Kontakt-E-Mail", kind: "email" },
            { name: "notes", label: "Notiz", kind: "textarea" },
            {
                name: "status",
                label: "Status",
                kind: "select",
                options: statuses,
            },
        ],
        filters: [
            {
                field: "status",
                label: "Status",
                kind: "choice",
                options: statuses,
            },
        ],
        groups: undefined,
        editor: undefined,
        relations: undefined,
        actions: [new EditAction()],
    };
}

function propertyFixture(overrides: Partial<RecordData> = {}): RecordData {
    return {
        id: 8,
        updated_at: "2026-11-18T09:14:22.123456Z",
        code: "OBJ-0008",
        name: "Lindenhöfe",
        management_type: "WEG",
        type: "residential",
        street: "Lindenstraße",
        house_number: "12a",
        postal_code: "10117",
        city: "Berlin",
        status: "active",
        units_count: 4,
        manager_name: "Mara König",
        manager_email: "mara@example.test",
        manager_phone: "+49 30 123456",
        land_area: 1600,
        construction_year: 1994,
        notes: "Vertragsnotiz außerhalb der sichtbaren Spalten",
        ...overrides,
    };
}

function page(
    rows: RecordData[],
    total = rows.length,
    current = 1,
): PageResult {
    return {
        data: rows,
        total,
        current_page: current,
        last_page: Math.max(1, Math.ceil(total / 10)),
    };
}

function mount(resource = resourceFixture(), entry = "/properties") {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    clients.push(client);
    const router = createMemoryRouter(
        [
            {
                path: "*",
                element: (
                    <QueryClientProvider client={client}>
                        <WorkbenchProvider>
                            <PropertyCollection resource={resource} />
                        </WorkbenchProvider>
                    </QueryClientProvider>
                ),
            },
        ],
        { initialEntries: [entry] },
    );
    render(<RouterProvider router={router} />);
    return router;
}

function metricValue(label: string) {
    const region = screen.getByRole("region", {
        name: "Kennzahlen der gefilterten Auswahl",
    });
    const definition = within(region).getByText(label).closest("dl")!;
    return within(definition).getByRole("definition");
}

beforeEach(() => {
    configurePermissions({ enabled: false, adapter: { can: () => true } });
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    );
    vi.stubGlobal(
        "Request",
        class extends NativeRequest {
            constructor(input: RequestInfo | URL, init?: RequestInit) {
                super(input, { ...init, signal: undefined });
            }
        },
    );
    Object.defineProperty(window, "matchMedia", {
        configurable: true,
        writable: true,
        value: vi.fn(() => ({
            matches: false,
            addEventListener() {},
            removeEventListener() {},
        })),
    });
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.scrollTo = vi.fn();
    Element.prototype.getAnimations = vi.fn(() => []);
});

afterEach(() => {
    cleanup();
    clients.splice(0).forEach((client) => client.clear());
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    configurePermissions({ enabled: false, adapter: { can: () => true } });
});

describe("property collection", () => {
    it("keeps all-result metrics across pages and sends the same search and filters to rows and metrics", async () => {
        const resource = resourceFixture();
        const firstPage = Array.from({ length: 10 }, (_, index) =>
            propertyFixture({ id: index + 1, name: `Haus ${index + 1}` }),
        );
        const secondPage = Array.from({ length: 10 }, (_, index) =>
            propertyFixture({
                id: index + 11,
                name: `Haus ${index + 11}`,
                units_count: 6,
            }),
        );
        const list = vi
            .spyOn(dataProvider, "list")
            .mockImplementation(async (_resource, params) =>
                page(
                    params?.page === 2 ? secondPage : firstPage,
                    params?.filters?.length ? 11 : 24,
                    params?.page,
                ),
            );
        const summary = vi
            .spyOn(dataProvider, "summary")
            .mockImplementation(async (_resource, _metric, params) => ({
                data: params.filters?.length
                    ? { total: 11, active: 11, units: 57, area: 4321 }
                    : { total: 24, active: 18, units: 421, area: 90120 },
            }));
        const user = userEvent.setup();
        mount(resource);
        await screen.findByText("Haus 1");
        await waitFor(() =>
            expect(metricValue("Einheiten")).toHaveTextContent(/^421$/),
        );

        await user.click(screen.getByRole("button", { name: "Nächste Seite" }));

        await screen.findByText("Haus 11");
        expect(screen.getByText("11–20 von 24")).toBeVisible();
        expect(metricValue("Einheiten")).toHaveTextContent(/^421$/);
        expect(summary).toHaveBeenCalledTimes(1);

        await user.type(
            screen.getByRole("textbox", { name: "Objekte durchsuchen" }),
            "Berlin",
        );
        await waitFor(() =>
            expect(list).toHaveBeenLastCalledWith(
                resource,
                expect.objectContaining({ query: "Berlin", page: 1 }),
                expect.any(AbortSignal),
            ),
        );
        await user.click(
            screen.getByRole("combobox", { name: "Filter hinzufügen" }),
        );
        await user.click(await screen.findByRole("option", { name: "Status" }));
        await user.click(
            screen.getByRole("combobox", { name: "Status Werte" }),
        );
        await user.click(await screen.findByRole("option", { name: "Aktiv" }));
        await user.keyboard("{Escape}");

        const filters = [
            { field: "status", operator: "in", value: ["active"] },
        ];
        await waitFor(() =>
            expect(list).toHaveBeenLastCalledWith(
                resource,
                expect.objectContaining({
                    query: "Berlin",
                    filters,
                    page: 1,
                    limit: 10,
                }),
                expect.any(AbortSignal),
            ),
        );
        expect(summary).toHaveBeenLastCalledWith(
            resource,
            "summary",
            { query: "Berlin", filters },
            expect.any(AbortSignal),
        );
        await waitFor(() =>
            expect(metricValue("Einheiten")).toHaveTextContent(/^57$/),
        );
        expect(metricValue("Objekte")).toHaveTextContent(/^11$/);
        expect(screen.getByText("1–10 von 11")).toBeVisible();
    });

    it("keeps address fields independently selectable and distinguishes a missing area from zero", async () => {
        vi.spyOn(dataProvider, "list").mockResolvedValue(
            page([
                propertyFixture({ land_area: null }),
                propertyFixture({ id: 9, name: "Uferhöfe", land_area: 0 }),
            ]),
        );
        vi.spyOn(dataProvider, "summary").mockResolvedValue({
            data: { total: 2, active: 2, units: 8, area: 0 },
        });
        const user = userEvent.setup();
        mount();
        const row = (await screen.findByText("Lindenhöfe")).closest("tr")!;
        for (const value of [
            "Lindenhöfe",
            "Lindenstraße",
            "12a",
            "10117",
            "Berlin",
        ]) {
            expect(
                within(row).getByRole("cell", { name: value }),
            ).toBeVisible();
        }
        expect(
            screen.queryByRole("columnheader", { name: /E-Mail/ }),
        ).not.toBeInTheDocument();

        screen.getByRole("button", { name: "Spalten" }).focus();
        await user.keyboard("{Enter}");
        await user.click(
            await screen.findByRole("menuitemcheckbox", { name: "Straße" }),
        );
        await user.click(
            screen.getByRole("menuitemcheckbox", { name: "E-Mail" }),
        );
        await user.click(
            screen.getByRole("menuitemcheckbox", {
                name: "Grundstücksfläche · m²",
            }),
        );
        await user.keyboard("{Escape}");

        expect(
            screen.queryByRole("columnheader", { name: /^Straße/ }),
        ).not.toBeInTheDocument();
        expect(
            within(row).queryByRole("cell", { name: "Lindenstraße" }),
        ).not.toBeInTheDocument();
        expect(within(row).getByRole("cell", { name: "12a" })).toBeVisible();
        expect(
            within(row).getByRole("cell", { name: "mara@example.test" }),
        ).toBeVisible();
        expect(within(row).getByRole("cell", { name: "—" })).toHaveTextContent(
            "—",
        );
        const zero = screen.getByText("Uferhöfe").closest("tr")!;
        expect(within(zero).getByRole("cell", { name: "0" })).toHaveTextContent(
            "0",
        );
    });

    it("passes the full versioned record to the existing edit sheet and save operation", async () => {
        const resource = resourceFixture();
        const original = propertyFixture();
        let current = original;
        vi.spyOn(dataProvider, "list").mockImplementation(async () =>
            page([current]),
        );
        vi.spyOn(dataProvider, "summary").mockResolvedValue({
            data: { total: 1, active: 1, units: 4, area: 1600 },
        });
        const one = vi
            .spyOn(dataProvider, "one")
            .mockRejectedValue(
                new Error("A complete row must not be rehydrated"),
            );
        vi.spyOn(dataProvider, "validate").mockResolvedValue(undefined);
        const save = vi
            .spyOn(dataProvider, "save")
            .mockImplementation(async (_resource, values, previous) => {
                current = {
                    ...previous!,
                    ...values,
                    updated_at: "2026-11-18T10:00:00.000000Z",
                };
                return current;
            });
        const router = mount(resource, "/properties?q=Linden");
        await screen.findByText("Lindenstraße");

        const user = userEvent.setup();
        await user.click(
            screen.getByRole("button", { name: "Lindenhöfe bearbeiten" }),
        );

        await screen.findByRole("heading", { name: "Objekt bearbeiten" });
        expect(router.state.location.pathname).toBe("/properties");
        expect(new URLSearchParams(router.state.location.search).get("q")).toBe(
            "Linden",
        );
        expect(readPanels(router.state.location.search)[0]).toMatchObject({
            id: 8,
            mode: "edit",
            presentation: "sheet",
        });
        expect(screen.getByLabelText("Kontakt-E-Mail")).toHaveValue(
            "mara@example.test",
        );
        expect(screen.getByLabelText("Notiz")).toHaveValue(
            String(original.notes),
        );
        expect(one).not.toHaveBeenCalled();
        await user.clear(
            screen.getByLabelText("Bezeichnung", { exact: false }),
        );
        await user.type(
            screen.getByLabelText("Bezeichnung", { exact: false }),
            "Lindenhof Neu",
        );
        await user.click(screen.getByRole("button", { name: "Speichern" }));

        await waitFor(() =>
            expect(save).toHaveBeenCalledExactlyOnceWith(
                resource,
                expect.objectContaining({ name: "Lindenhof Neu" }),
                original,
            ),
        );
        await waitFor(() =>
            expect(readPanels(router.state.location.search)).toEqual([]),
        );
        expect(await screen.findByText("Lindenhof Neu")).toBeVisible();
    });

    it("allows editing only current search results with an edit permission", async () => {
        let finishSearch!: (result: PageResult) => void;
        const pending = new Promise<PageResult>((resolve) => {
            finishSearch = resolve;
        });
        const list = vi
            .spyOn(dataProvider, "list")
            .mockImplementation(async (_resource, params) =>
                params?.query === "Ufer" ? pending : page([propertyFixture()]),
            );
        vi.spyOn(dataProvider, "summary").mockResolvedValue({
            data: { total: 1, active: 1, units: 4, area: 1600 },
        });
        const user = userEvent.setup();
        const router = mount();
        const oldCell = await screen.findByText("Lindenstraße");
        const oldEdit = screen.getByRole("button", {
            name: "Lindenhöfe bearbeiten",
        });

        fireEvent.change(
            screen.getByRole("textbox", { name: "Objekte durchsuchen" }),
            { target: { value: "Ufer" } },
        );
        fireEvent.click(oldEdit);
        fireEvent.doubleClick(oldCell);
        expect(readPanels(router.state.location.search)).toEqual([]);
        expect(list).toHaveBeenCalledTimes(1);
        await waitFor(() =>
            expect(list).toHaveBeenLastCalledWith(
                expect.anything(),
                expect.objectContaining({ query: "Ufer" }),
                expect.any(AbortSignal),
            ),
        );
        expect(
            screen.getByRole("status", { name: "Objekte werden aktualisiert" }),
        ).toBeInTheDocument();
        fireEvent.click(oldEdit);
        fireEvent.doubleClick(oldCell);

        expect(readPanels(router.state.location.search)).toEqual([]);
        expect(
            screen.queryByRole("heading", { name: "Objekt bearbeiten" }),
        ).not.toBeInTheDocument();
        await act(async () => {
            finishSearch(
                page([
                    propertyFixture({
                        id: 9,
                        name: "Uferhöfe",
                        street: "Uferstraße",
                    }),
                ]),
            );
        });

        const currentCell = await screen.findByText("Uferstraße");
        await act(async () => {
            configurePermissions({
                enabled: true,
                adapter: { can: (_resource, action) => action !== "edit" },
            });
        });
        fireEvent.doubleClick(currentCell);
        expect(readPanels(router.state.location.search)).toEqual([]);
        expect(
            screen.queryByRole("button", { name: "Uferhöfe bearbeiten" }),
        ).not.toBeInTheDocument();

        await act(async () => {
            configurePermissions({
                enabled: false,
                adapter: { can: () => true },
            });
        });
        await user.click(
            await screen.findByRole("button", { name: "Uferhöfe bearbeiten" }),
        );
        await screen.findByRole("heading", { name: "Objekt bearbeiten" });
        expect(readPanels(router.state.location.search)[0]).toMatchObject({
            id: 9,
            mode: "edit",
        });
    });
});
