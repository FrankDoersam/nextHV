import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EnterpriseModule } from "@/framework/tables/enterprise-module";
import {
    enterpriseCsv,
    selectEnterpriseRows,
} from "@/framework/tables/enterprise-model";
import type { DemoPayment } from "./demo-data";
import { demoQuery } from "./demo-shared";
import { financeDemoConfig } from "./finance-demo";
import { paymentsDemoConfig } from "./payments-demo";

function invoice(reference: string, receivedCents = 0): DemoPayment {
    return {
        id: reference,
        reference,
        unitId: "EH-TEST",
        unitLabel: "WE 01",
        propertyId: "OBJ-TEST",
        propertyName: "Musterhaus",
        city: "Berlin",
        partner: "Alex Beispiel",
        manager: "Nora Beispiel",
        period: "November 2026",
        dueDate: "2026-11-03",
        amountCents: 100_000,
        payments: receivedCents
            ? [
                  {
                      id: `PAY-${reference}`,
                      date: "2026-11-05",
                      amountCents: receivedCents,
                      label: "Zahlung eingegangen",
                  },
              ]
            : [],
        method: "Überweisung",
        category: "Nettokaltmiete",
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

describe("finance and open-item domains", () => {
    it("includes settled receivables in finance and reconciles Soll and received payments", () => {
        const rows = [
            invoice("OFFEN"),
            invoice("TEIL", 40_000),
            invoice("BEZAHLT", 100_000),
        ];

        const selected = selectEnterpriseRows(rows, financeDemoConfig, {
            search: "",
            query: financeDemoConfig.defaultQuery!,
            sorting: [],
        });
        const metrics = financeDemoConfig.metrics(selected);

        expect(selected.map((row) => row.reference)).toEqual([
            "OFFEN",
            "TEIL",
            "BEZAHLT",
        ]);
        expect(
            metrics.find((metric) => metric.id === "receivables")?.value,
        ).toBe("3.000,00 €");
        expect(metrics.find((metric) => metric.id === "received")?.value).toBe(
            "1.400,00 €",
        );
        expect(metrics.find((metric) => metric.id === "open")?.value).toBe(
            "1.600,00 €",
        );
    });

    it("excludes settled and overpaid receivables from OP results and CSV even with a saved settled filter", () => {
        const rows = [
            invoice("OFFEN"),
            invoice("TEIL", 40_000),
            invoice("BEZAHLT", 100_000),
            invoice("GUTHABEN", 120_000),
        ];

        const selected = selectEnterpriseRows(rows, paymentsDemoConfig, {
            search: "",
            query: paymentsDemoConfig.defaultQuery!,
            sorting: [],
        });
        const csv = enterpriseCsv(selected, paymentsDemoConfig.columns);
        const legacySettledView = selectEnterpriseRows(
            rows,
            paymentsDemoConfig,
            {
                search: "",
                query: demoQuery("status", "is", "Ausgeglichen"),
                sorting: [],
            },
        );

        expect(selected.map((row) => row.reference)).toEqual(["OFFEN", "TEIL"]);
        expect(csv).toContain('"OFFEN"');
        expect(csv).toContain('"TEIL"');
        expect(csv).not.toContain('"BEZAHLT"');
        expect(csv).not.toContain('"GUTHABEN"');
        expect(legacySettledView).toEqual([]);
    });

    it("removes a settled OP from the table and updates the remaining amount and hit count", async () => {
        const user = userEvent.setup();
        const rows = [
            invoice("OFFEN"),
            invoice("TEIL", 40_000),
            invoice("BEZAHLT", 100_000),
        ];
        render(<EnterpriseModule config={{ ...paymentsDemoConfig, rows }} />);
        expect(
            screen.queryByRole("button", { name: "BEZAHLT – Details öffnen" }),
        ).not.toBeInTheDocument();
        expect(
            screen.getAllByRole("checkbox", { name: "Zeile auswählen" }),
        ).toHaveLength(2);

        await user.click(
            screen.getAllByRole("checkbox", { name: "Zeile auswählen" })[0],
        );
        await user.click(
            screen.getByRole("button", { name: "Zahlung simulieren" }),
        );

        expect(
            screen.queryByRole("button", { name: "OFFEN – Details öffnen" }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "TEIL – Details öffnen" }),
        ).toBeVisible();
        expect(
            screen.getAllByRole("checkbox", { name: "Zeile auswählen" }),
        ).toHaveLength(1);
        expect(screen.getByTestId("metric-open")).toHaveTextContent("600,00 €");
        expect(screen.getByTestId("metric-open")).toHaveTextContent(
            "1 offene Posten",
        );
        expect(
            screen.getByTestId("total-filtered-outstanding"),
        ).toHaveTextContent("600,00 €");
    });
});
