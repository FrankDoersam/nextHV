import "@testing-library/jest-dom/vitest";
import {
    cleanup,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EnterpriseModule } from "./enterprise-module";
import type { EnterpriseModuleConfig } from "./enterprise-types";

interface Invoice {
    id: string;
    name: string;
    property: string;
    status: string;
    open: number;
}

function fixture(): EnterpriseModuleConfig<Invoice> {
    const properties = ["Ahornhof", "Birkenhof", "Cederhof", "Dammhof"];
    return {
        id: "integration-invoices",
        title: "Forderungen",
        description: "Fiktive OP-Datensätze",
        itemLabel: "Positionen",
        rows: Array.from({ length: 8 }, (_, index) => ({
            id: String(index + 1),
            name: `Rechnung ${index + 1}`,
            property: properties[Math.floor(index / 2)],
            status: index % 2 === 0 ? "offen" : "in Prüfung",
            open: (index + 1) * 100,
        })),
        columns: [
            {
                id: "name",
                label: "Rechnung",
                primary: true,
                value: (row) => row.name,
                render: (row) => row.name,
            },
            {
                id: "status",
                label: "Status",
                value: (row) => row.status,
                render: (row) => row.status,
            },
            {
                id: "open",
                label: "Offen",
                align: "right",
                value: (row) => row.open,
                render: (row) => `${row.open} EUR`,
                aggregate: (rows) =>
                    rows.reduce((sum, row) => sum + row.open, 0),
                renderAggregate: (value) => `${value} EUR`,
            },
        ],
        filters: [
            {
                id: "status",
                label: "Status",
                type: "select",
                options: [
                    { value: "offen", label: "Offen" },
                    { value: "in Prüfung", label: "In Prüfung" },
                ],
                getValue: (row) => row.status,
            },
        ],
        groups: [
            { id: "property", label: "Objekt", value: (row) => row.property },
            { id: "status", label: "Status", value: (row) => row.status },
        ],
        views: [
            { id: "all", label: "Alle Positionen" },
            {
                id: "open",
                label: "Offene Positionen",
                query: {
                    id: "open-query",
                    type: "group",
                    combinator: "and",
                    rules: [
                        {
                            id: "open-rule",
                            type: "rule",
                            path: ["status"],
                            operator: "is",
                            value: "offen",
                        },
                    ],
                },
            },
        ],
        defaultGroupBy: "property",
        searchText: (row) => `${row.name} ${row.property} ${row.status}`,
        metrics: (rows) => [
            {
                id: "open",
                label: "Offene Forderungen",
                value: `${rows.reduce((sum, row) => sum + row.open, 0)} EUR`,
                hint: `${rows.length} Positionen`,
            },
        ],
        detailTitle: (row) => row.name,
        renderDetail: (row) => (
            <p>
                {row.name}: {row.open} EUR
            </p>
        ),
        actions: [
            {
                id: "pay",
                label: "Zahlung simulieren",
                eligible: (row) => row.status === "offen",
                apply: (row) => ({ ...row, status: "ausgeglichen", open: 0 }),
                successMessage: (count) => `${count} Zahlung simuliert.`,
            },
        ],
    };
}

beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, "matchMedia", {
        configurable: true,
        writable: true,
        value: vi.fn().mockReturnValue({
            matches: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }),
    });
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    );
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.getAnimations = vi.fn(() => []);
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
});

describe("enterprise module interactions", () => {
    it("keeps results while a filter chip is being built and applies its completed value", async () => {
        const user = userEvent.setup();
        render(<EnterpriseModule config={fixture()} />);

        await user.click(
            screen.getByRole("button", { name: "Filter hinzufügen" }),
        );
        await user.click(await screen.findByRole("option", { name: "Status" }));

        expect(screen.getByTestId("metric-open")).toHaveTextContent("3600 EUR");
        expect(screen.getByTestId("total-filtered-open")).toHaveTextContent(
            "3600 EUR",
        );
        await user.click(await screen.findByRole("option", { name: "ist" }));
        expect(screen.getByTestId("metric-open")).toHaveTextContent("3600 EUR");
        await user.click(await screen.findByRole("option", { name: "Offen" }));
        expect(screen.getByTestId("metric-open")).toHaveTextContent("1600 EUR");
        expect(screen.getByTestId("total-filtered-open")).toHaveTextContent(
            "1600 EUR",
        );
    });

    it("keeps KPIs and the grand total on the full filtered set across group pages", async () => {
        const user = userEvent.setup();
        render(<EnterpriseModule config={fixture()} />);
        expect(screen.getByTestId("metric-open")).toHaveTextContent("3600 EUR");
        expect(screen.getByTestId("total-filtered-open")).toHaveTextContent(
            "3600 EUR",
        );

        await user.click(screen.getByRole("button", { name: "Nächste Seite" }));

        expect(screen.getByText("Gruppe 4–4 von 4")).toBeVisible();
        expect(screen.getByTestId("metric-open")).toHaveTextContent("3600 EUR");
        expect(screen.getByTestId("total-filtered-open")).toHaveTextContent(
            "3600 EUR",
        );
        await user.click(
            screen.getByRole("button", { name: /Offene Positionen/ }),
        );
        expect(screen.getByText("Gruppe 1–3 von 4")).toBeVisible();
        expect(screen.getByTestId("metric-open")).toHaveTextContent("1600 EUR");
        expect(screen.getByTestId("total-filtered-open")).toHaveTextContent(
            "1600 EUR",
        );
        expect(screen.getByText("4 von 8 Positionen")).toBeVisible();
    });

    it("keeps group and grand totals visible when the group is collapsed", async () => {
        const user = userEvent.setup();
        render(<EnterpriseModule config={fixture()} />);
        const groupButton = screen.getByRole("button", {
            name: "Ahornhof: zuklappen",
        });
        const groupRow = groupButton.closest("tr")!;
        expect(within(groupRow).getByText("300 EUR")).toBeVisible();
        expect(
            screen.getByRole("button", { name: "Rechnung 1 – Details öffnen" }),
        ).toBeVisible();

        await user.click(groupButton);

        expect(
            screen.queryByRole("button", {
                name: "Rechnung 1 – Details öffnen",
            }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Ahornhof: aufklappen" }),
        ).toHaveAttribute("aria-expanded", "false");
        expect(within(groupRow).getByText("300 EUR")).toBeVisible();
        expect(screen.getByTestId("total-filtered-open")).toHaveTextContent(
            "3600 EUR",
        );
    });

    it("selects only visible records and can extend the selection to all filtered hits", async () => {
        const user = userEvent.setup();
        render(<EnterpriseModule config={fixture()} />);

        await user.click(
            screen.getByRole("checkbox", {
                name: "Alle sichtbaren Zeilen auswählen",
            }),
        );

        expect(
            screen.getByRole("region", { name: "Ausgewählte Datensätze" }),
        ).toHaveTextContent("2 ausgewählt");
        expect(screen.getByTestId("total-selected-open")).toHaveTextContent(
            "300 EUR",
        );
        expect(
            screen.getAllByRole("checkbox", { name: "Zeile auswählen" }),
        ).toHaveLength(2);
        await user.click(
            screen.getByRole("button", { name: "Alle 8 Treffer auswählen" }),
        );
        expect(
            screen.getByRole("region", { name: "Ausgewählte Datensätze" }),
        ).toHaveTextContent("8 ausgewählt");
        expect(screen.getByTestId("total-selected-open")).toHaveTextContent(
            "3600 EUR",
        );
    });

    it("clears selection and the stale page when the search changes its scope", async () => {
        const user = userEvent.setup();
        render(<EnterpriseModule config={fixture()} />);
        await user.click(
            screen.getByRole("checkbox", {
                name: "Alle sichtbaren Zeilen auswählen",
            }),
        );
        await user.click(screen.getByRole("button", { name: "Nächste Seite" }));

        await user.type(
            screen.getByRole("textbox", { name: "Positionen durchsuchen" }),
            "Dammhof",
        );

        expect(
            screen.queryByRole("region", { name: "Ausgewählte Datensätze" }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByTestId("total-selected-open"),
        ).not.toBeInTheDocument();
        expect(screen.getByText("Gruppe 1–1 von 1")).toBeVisible();
        expect(screen.getByTestId("metric-open")).toHaveTextContent("1500 EUR");
        expect(screen.getByTestId("total-filtered-open")).toHaveTextContent(
            "1500 EUR",
        );
    });

    it("restores saved filters and grouping after remounting the module", async () => {
        const user = userEvent.setup();
        const mounted = render(<EnterpriseModule config={fixture()} />);
        await user.click(
            screen.getByRole("button", { name: /Offene Positionen/ }),
        );
        await user.click(screen.getByRole("combobox", { name: "Gruppierung" }));
        await user.click(
            await screen.findByRole("option", { name: "Nach Status" }),
        );
        await user.click(
            screen.getByRole("button", { name: "Ansicht speichern" }),
        );
        await user.type(
            screen.getByRole("textbox", { name: "Name der Ansicht" }),
            "Offene nach Status",
        );
        await user.click(screen.getByRole("button", { name: "Speichern" }));
        await waitFor(() =>
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
        );
        mounted.unmount();
        render(<EnterpriseModule config={fixture()} />);
        expect(screen.getByTestId("metric-open")).toHaveTextContent("3600 EUR");

        await user.click(
            screen.getByRole("button", { name: "Meine Ansichten" }),
        );
        await user.click(
            await screen.findByRole("menuitem", { name: "Offene nach Status" }),
        );

        expect(
            screen.getByRole("combobox", { name: "Gruppierung" }),
        ).toHaveTextContent("Nach Status");
        expect(screen.getByText("4 von 8 Positionen")).toBeVisible();
        expect(screen.getByTestId("metric-open")).toHaveTextContent("1600 EUR");
        expect(screen.getByTestId("total-filtered-open")).toHaveTextContent(
            "1600 EUR",
        );
        expect(
            screen.getByRole("button", { name: /^offen: (auf|zu)klappen$/ }),
        ).toBeVisible();
    });

    it("updates record data and aggregates after a local action and restores fixtures on reset", async () => {
        const user = userEvent.setup();
        render(<EnterpriseModule config={fixture()} />);
        await user.click(
            screen.getAllByRole("checkbox", { name: "Zeile auswählen" })[0],
        );

        await user.click(
            screen.getByRole("button", { name: "Zahlung simulieren" }),
        );

        expect(screen.getByTestId("metric-open")).toHaveTextContent("3500 EUR");
        expect(screen.getByTestId("total-filtered-open")).toHaveTextContent(
            "3500 EUR",
        );
        expect(screen.getByText("ausgeglichen", { exact: true })).toBeVisible();
        expect(screen.getByText("1 Zahlung simuliert.")).toBeVisible();
        expect(
            screen.queryByRole("region", { name: "Ausgewählte Datensätze" }),
        ).not.toBeInTheDocument();
        await user.click(
            screen.getByRole("button", { name: "Demo zurücksetzen" }),
        );
        expect(screen.getByTestId("metric-open")).toHaveTextContent("3600 EUR");
        expect(screen.getByTestId("total-filtered-open")).toHaveTextContent(
            "3600 EUR",
        );
        expect(
            screen.queryByText("ausgeglichen", { exact: true }),
        ).not.toBeInTheDocument();
    });
});
