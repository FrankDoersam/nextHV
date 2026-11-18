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
import { Building2 } from "lucide-react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dataProvider } from "../data/provider";
import { configurePermissions } from "../permissions";
import type { PageResult, RecordData, ResourceDefinition } from "../types";
import { WorkbenchProvider } from "../workbench";
import { ResourceGrid, type ResourceGridProps } from "./resource-grid";

// JSDOM has no measured scroll viewport. Keep the real table/cells and drive
// only the virtualizer's end-of-list callback explicitly in the infinite test.
vi.mock("@/components/reui/data-grid/data-grid-table-virtual", async () => {
    const { DataGridTable } =
        await import("@/components/reui/data-grid/data-grid-table");
    return {
        DataGridTableVirtual: ({
            onFetchMore,
            footerContent,
        }: {
            onFetchMore?: () => void;
            footerContent?: ReactNode;
        }) => (
            <>
                <DataGridTable footerContent={footerContent} />
                <button type="button" onClick={onFetchMore}>
                    Virtuelles Listenende erreicht
                </button>
            </>
        ),
    };
});

const clients: QueryClient[] = [];
const statuses = [
    { value: "active", label: "Aktiv" },
    { value: "archived", label: "Archiviert" },
];

function resourceFixture(): ResourceDefinition {
    return {
        name: "grid-fixtures",
        label: "Prüfobjekte",
        singular: "Prüfobjekt",
        description: "",
        icon: Building2,
        titleField: "name",
        actions: [],
        fields: [
            { name: "name", label: "Name" },
            {
                name: "status",
                label: "Status",
                kind: "select",
                options: statuses,
            },
            { name: "amount", label: "Betrag", kind: "number" },
        ],
        columns: [
            { field: "name", label: "Name", hideable: false },
            {
                field: "status",
                label: "Status",
                options: statuses,
                kind: "badge",
            },
            {
                field: "amount",
                label: "Betrag",
                kind: "number",
                aggregate: "sum",
            },
        ],
        groupBy: [{ value: "status", label: "Status" }],
    };
}

function draftResourceFixture(): ResourceDefinition {
    return {
        ...resourceFixture(),
        columns: [
            { field: "name", label: "Name", hideable: false },
            { field: "amount", label: "Einzelbetrag", kind: "currency" },
            {
                field: "quantity",
                label: "Anzahl",
                kind: "number",
                input: { kind: "number", mode: "draft", min: 0, initial: 1 },
            },
            {
                field: "forecast",
                label: "Vorschau",
                kind: "currency",
                aggregate: "sum",
                computed: {
                    type: "operation",
                    operator: "multiply",
                    values: [
                        { type: "field", field: "amount" },
                        { type: "column", field: "quantity" },
                    ],
                },
            },
        ],
    };
}

function record(id: number, overrides: Partial<RecordData> = {}): RecordData {
    return {
        id,
        name: `Haus ${id}`,
        status: "active",
        amount: id,
        updated_at: "2026-11-18T10:00:00Z",
        ...overrides,
    };
}

function page(
    rows: RecordData[],
    total = rows.length,
    current = 1,
    pageSize = 10,
): PageResult {
    return {
        data: rows,
        total,
        current_page: current,
        last_page: Math.max(1, Math.ceil(total / pageSize)),
    };
}

function mount(props: Partial<ResourceGridProps> = {}, entry = "/grid") {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    clients.push(client);
    const content = (gridProps: Partial<ResourceGridProps>) => (
        <MemoryRouter initialEntries={[entry]}>
            <QueryClientProvider client={client}>
                <WorkbenchProvider>
                    <ResourceGrid
                        resource={resourceFixture()}
                        header={false}
                        summary={false}
                        create={false}
                        detailLink={false}
                        queryOptions={{ retry: false }}
                        {...gridProps}
                    />
                </WorkbenchProvider>
            </QueryClientProvider>
        </MemoryRouter>
    );
    const view = render(content(props));
    return {
        ...view,
        rerenderGrid: (next: Partial<ResourceGridProps>) =>
            view.rerender(content(next)),
    };
}

function totals() {
    return within(
        document.querySelector<HTMLTableRowElement>(
            '[data-slot="resource-grid-totals"]',
        )!,
    );
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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    configurePermissions({ enabled: false, adapter: { can: () => true } });
});

describe("shared resource grid behavior", () => {
    it("groups from the column header with server counts and sums only the displayed page", async () => {
        const resource = resourceFixture();
        const fixedFilters = [
            { field: "status", operator: "in", value: ["active", "archived"] },
        ];
        const rows = [
            record(1, { amount: 10 }),
            record(2, { amount: 20 }),
            record(3, { status: "archived", amount: 7 }),
        ];
        vi.spyOn(dataProvider, "list").mockResolvedValue(page(rows, 25));
        const groups = vi.spyOn(dataProvider, "groups").mockResolvedValue({
            data: {
                field: "status",
                total: 25,
                groups: [
                    { value: "active", count: 20 },
                    { value: "archived", count: 5 },
                ],
            },
        });
        const user = userEvent.setup();
        mount({ resource, fixedFilters }, "/grid?q=Haus");
        await screen.findByText("Haus 1");

        await user.click(screen.getByRole("button", { name: "Status" }));
        await user.click(
            await screen.findByRole("menuitem", {
                name: "Nach dieser Spalte gruppieren",
            }),
        );

        const active = await screen.findByRole("button", {
            name: "Aktiv: zuklappen",
        });
        expect(groups).toHaveBeenLastCalledWith(
            resource,
            "status",
            { query: "Haus", filters: fixedFilters },
            expect.any(AbortSignal),
        );
        expect(active).toHaveTextContent("2 auf Seite · 20 gesamt");
        expect(
            within(active.closest("tr")!).getByRole("cell", { name: "30" }),
        ).toBeVisible();
        const archived = screen.getByRole("button", {
            name: "Archiviert: zuklappen",
        });
        expect(archived).toHaveTextContent("1 auf Seite · 5 gesamt");
        expect(
            within(archived.closest("tr")!).getByRole("cell", { name: "7" }),
        ).toBeVisible();
        expect(totals().getByText("Aktuelle Seite · 3")).toBeVisible();
        expect(totals().getByRole("cell", { name: "37" })).toBeVisible();

        await user.click(active);

        expect(screen.queryByText("Haus 1")).not.toBeInTheDocument();
        expect(screen.queryByText("Haus 2")).not.toBeInTheDocument();
        expect(screen.getByText("Haus 3")).toBeVisible();
        expect(totals().getByRole("cell", { name: "37" })).toBeVisible();
        expect(
            screen.getByRole("button", { name: "Aktiv: aufklappen" }),
        ).toHaveAttribute("aria-expanded", "false");

        await user.click(
            screen.getByRole("button", { name: "Gruppierung aufheben" }),
        );

        expect(await screen.findByText("Haus 1")).toBeVisible();
        expect(screen.getByText("Haus 2")).toBeVisible();
        expect(
            screen.queryByRole("button", { name: "Aktiv: zuklappen" }),
        ).not.toBeInTheDocument();
    });

    it("renders the bounded full result without page controls when pagination is disabled", async () => {
        const rows = Array.from({ length: 12 }, (_, index) =>
            record(index + 1),
        );
        const list = vi
            .spyOn(dataProvider, "list")
            .mockResolvedValue(page(rows, 12, 1, 100));
        mount({ pagination: false });

        expect(await screen.findByText("Haus 12")).toBeVisible();
        expect(list).toHaveBeenCalledExactlyOnceWith(
            expect.anything(),
            expect.objectContaining({ page: 1, limit: 100 }),
            expect.any(AbortSignal),
        );
        expect(
            screen.queryByRole("button", { name: "Nächste Seite" }),
        ).not.toBeInTheDocument();
        expect(totals().getByText("Gesamte Auswahl · 12")).toBeVisible();
        expect(totals().getByRole("cell", { name: "78" })).toBeVisible();
    });

    it("shows the full-fetch limit error instead of presenting a truncated unpaginated list", async () => {
        vi.spyOn(dataProvider, "list").mockResolvedValue(
            page([record(1)], 101, 1, 100),
        );
        mount({ pagination: false });

        expect(
            await screen.findByText(/off-Modus erlaubt höchstens 100/),
        ).toBeVisible();
        expect(screen.queryByText("Haus 1")).not.toBeInTheDocument();
        expect(screen.queryByText(/Gesamte Auswahl/)).not.toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Erneut versuchen" }),
        ).toBeEnabled();
    });

    it("loads infinite pages in sequence, retains rows after a page error and resets the scope on search", async () => {
        const rows = Array.from({ length: 23 }, (_, index) =>
            record(index + 1),
        );
        let resolveSecond!: (value: PageResult) => void;
        const second = new Promise<PageResult>((resolve) => {
            resolveSecond = resolve;
        });
        let thirdAttempts = 0;
        const list = vi
            .spyOn(dataProvider, "list")
            .mockImplementation(async (_resource, params) => {
                if (params?.query === "Neu")
                    return page([record(101, { name: "Neues Haus" })]);
                if (params?.page === 2) return second;
                if (params?.page === 3 && ++thirdAttempts === 1)
                    throw new Error("Verbindung unterbrochen");
                return page(
                    rows.slice(
                        ((params?.page ?? 1) - 1) * 10,
                        (params?.page ?? 1) * 10,
                    ),
                    23,
                    params?.page,
                );
            });
        const user = userEvent.setup();
        mount({ infiniteScroll: true });
        await screen.findByText("Haus 10");
        expect(list).toHaveBeenCalledTimes(1);
        expect(screen.getByText("10 von 23 geladen")).toBeVisible();

        await user.click(screen.getByRole("button", { name: "Weitere laden" }));
        fireEvent.click(
            screen.getByRole("button", {
                name: "Virtuelles Listenende erreicht",
            }),
        );
        fireEvent.click(
            screen.getByRole("button", {
                name: "Virtuelles Listenende erreicht",
            }),
        );

        expect(list.mock.calls.map(([, params]) => params?.page)).toEqual([
            1, 2,
        ]);
        expect(
            screen.getByRole("button", { name: "Wird geladen …" }),
        ).toBeDisabled();
        await act(async () => {
            resolveSecond(page(rows.slice(10, 20), 23, 2));
        });
        expect(await screen.findByText("Haus 20")).toBeVisible();
        expect(screen.getByText("20 von 23 geladen")).toBeVisible();

        await user.click(screen.getByRole("button", { name: "Weitere laden" }));

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Weitere Zeilen konnten nicht geladen werden.",
        );
        expect(screen.getByText("Haus 1")).toBeVisible();
        expect(screen.getByText("Haus 20")).toBeVisible();
        fireEvent.click(
            screen.getByRole("button", {
                name: "Virtuelles Listenende erreicht",
            }),
        );
        expect(list.mock.calls.map(([, params]) => params?.page)).toEqual([
            1, 2, 3,
        ]);

        await user.click(
            screen.getByRole("button", { name: "Erneut versuchen" }),
        );

        expect(await screen.findByText("Haus 23")).toBeVisible();
        expect(screen.getByText("23 von 23 geladen")).toBeVisible();
        expect(
            screen.queryByRole("button", { name: "Weitere laden" }),
        ).not.toBeInTheDocument();
        expect(list.mock.calls.map(([, params]) => params?.page)).toEqual([
            1, 2, 3, 3,
        ]);
        expect(totals().getByText("Geladene Zeilen · 23")).toBeVisible();
        expect(totals().getByRole("cell", { name: "276" })).toBeVisible();

        await user.type(
            screen.getByRole("textbox", { name: "Prüfobjekte durchsuchen" }),
            "Neu",
        );

        expect(await screen.findByText("Neues Haus")).toBeVisible();
        expect(screen.queryByText("Haus 1")).not.toBeInTheDocument();
        expect(screen.queryByText("Haus 23")).not.toBeInTheDocument();
        expect(screen.getByText("1 von 1 geladen")).toBeVisible();
        expect(list).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({ page: 1, query: "Neu", limit: 10 }),
            expect.any(AbortSignal),
        );
    });

    it("recalculates draft cells and totals without mutating records or calling a write API", async () => {
        const resource = draftResourceFixture();
        const first = Object.freeze(record(1, { amount: 100, quantity: 2 }));
        const second = Object.freeze(record(2, { amount: 50, quantity: 4 }));
        const list = vi
            .spyOn(dataProvider, "list")
            .mockResolvedValue(page([first, second]));
        vi.spyOn(dataProvider, "groups").mockResolvedValue({
            data: {
                field: "status",
                total: 2,
                groups: [{ value: "active", count: 2 }],
            },
        });
        const save = vi.spyOn(dataProvider, "save");
        const validate = vi.spyOn(dataProvider, "validate");
        const user = userEvent.setup();
        mount({ resource }, "/grid?group=status");
        const group = (
            await screen.findByRole("button", { name: "Aktiv: zuklappen" })
        ).closest("tr")!;
        const row = screen.getByText("Haus 1").closest("tr")!;
        const quantity = within(row).getByLabelText("Anzahl – Haus 1");
        expect(quantity).toHaveValue("2");
        expect(
            totals().getByRole("cell", { name: /400,00\s*€/ }),
        ).toBeVisible();

        await user.clear(quantity);
        expect(quantity).toBeInTheDocument();
        expect(quantity).toHaveFocus();
        await user.type(quantity, "30");
        expect(quantity).toHaveFocus();
        expect(quantity).toHaveValue("30");
        await user.tab();

        await waitFor(() =>
            expect(
                within(row).getByRole("cell", { name: /3\.000,00\s*€/ }),
            ).toBeVisible(),
        );
        expect(
            totals().getByRole("cell", { name: /3\.200,00\s*€/ }),
        ).toBeVisible();
        expect(
            within(group).getByRole("cell", { name: /3\.200,00\s*€/ }),
        ).toBeVisible();
        expect(first.quantity).toBe(2);
        expect(second.quantity).toBe(4);
        expect(first).not.toHaveProperty("forecast");
        expect(save).not.toHaveBeenCalled();
        expect(validate).not.toHaveBeenCalled();
        expect(list).toHaveBeenCalledTimes(1);

        await user.click(
            screen.getByRole("button", { name: "Vorschau zurücksetzen" }),
        );

        expect(quantity).toHaveValue("2");
        expect(
            totals().getByRole("cell", { name: /400,00\s*€/ }),
        ).toBeVisible();
        expect(save).not.toHaveBeenCalled();
        expect(validate).not.toHaveBeenCalled();
    });

    it("discards drafts when switching resources even when record identity and version match", async () => {
        const resource = draftResourceFixture();
        const otherResource = {
            ...resource,
            name: "other-grid-fixtures",
            label: "Andere Prüfobjekte",
        };
        const first = record(1, { amount: 100, quantity: 2 });
        const other: RecordData = { ...first, amount: 50 };
        const list = vi
            .spyOn(dataProvider, "list")
            .mockImplementation(async (definition) =>
                page([definition.name === resource.name ? first : other]),
            );
        const user = userEvent.setup();
        const view = mount({ resource });
        const quantity = await screen.findByLabelText("Anzahl – Haus 1");
        await user.clear(quantity);
        await user.type(quantity, "3");
        expect(
            totals().getByRole("cell", { name: /300,00\s*€/ }),
        ).toBeVisible();
        expect(
            screen.getByRole("button", { name: "Vorschau zurücksetzen" }),
        ).toBeVisible();

        view.rerenderGrid({ resource: otherResource });

        expect(await screen.findByLabelText("Anzahl – Haus 1")).toHaveValue(
            "2",
        );
        expect(
            totals().getByRole("cell", { name: /100,00\s*€/ }),
        ).toBeVisible();
        expect(
            screen.queryByRole("button", { name: "Vorschau zurücksetzen" }),
        ).not.toBeInTheDocument();
        expect(list).toHaveBeenLastCalledWith(
            otherResource,
            expect.anything(),
            expect.any(AbortSignal),
        );
        expect(first.quantity).toBe(2);
        expect(other.quantity).toBe(2);
    });
});
