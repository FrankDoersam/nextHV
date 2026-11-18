import { describe, expect, it } from "vitest";
import {
    createDemoPayments,
    createDemoUnits,
    outstandingCents,
    overdueDays,
    paidCents,
    paymentStatus,
    paymentTotals,
    simulateLetting,
    simulatePayment,
    unitTotals,
    type DemoPayment,
} from "./demo-data";

function invoice(overrides: Partial<DemoPayment> = {}): DemoPayment {
    return {
        id: "OP-TEST",
        reference: "MI-TEST",
        unitId: "EH-TEST",
        unitLabel: "WE 01",
        propertyId: "OBJ-TEST",
        propertyName: "Musterhaus",
        city: "Berlin",
        partner: "Alex Beispiel",
        manager: "Nora Beispiel",
        period: "November 2026",
        dueDate: "2026-11-03",
        amountCents: 100_001,
        payments: [],
        method: "Überweisung",
        category: "Nettokaltmiete",
        ...overrides,
    };
}

describe("enterprise demo portfolio", () => {
    it("provides a reproducible portfolio and charges only rented units", () => {
        const units = createDemoUnits();
        const payments = createDemoPayments();
        const rentedIds = new Set(
            units
                .filter((row) => row.status === "Vermietet")
                .map((row) => row.id),
        );

        expect(units).toEqual(createDemoUnits());
        expect(payments).toEqual(createDemoPayments());
        expect(new Set(units.map((row) => row.id)).size).toBe(48);
        expect(new Set(payments.map((row) => row.reference)).size).toBe(48);
        expect(unitTotals(units)).toMatchObject({
            properties: 6,
            units: 48,
            rented: 40,
            vacant: 6,
            renovation: 2,
        });
        expect(
            payments.every(
                (row) =>
                    rentedIds.has(row.unitId) &&
                    Number.isInteger(row.amountCents) &&
                    row.amountCents > 0 &&
                    outstandingCents(row) >= 0,
            ),
        ).toBe(true);
    });

    it("updates rent and occupancy when a vacant unit is let without altering the seed", () => {
        const units = createDemoUnits();
        const vacant = units.find((row) => row.status === "Leerstand")!;

        const rented = simulateLetting(vacant);
        const totals = unitTotals([rented]);

        expect(vacant.rentCents).toBe(0);
        expect(vacant.status).toBe("Leerstand");
        expect(rented).toMatchObject({
            status: "Vermietet",
            tenant: "Alex Demo",
            leaseStart: "2026-11-18",
        });
        expect(totals.occupancy).toBe(100);
        expect(totals.rentCents).toBe(vacant.targetRentCents);
        expect(simulateLetting(rented)).toBe(rented);
    });
});

describe("enterprise demo open items", () => {
    it("keeps a partial receipt and its remainder exact to the cent", () => {
        const row = invoice({
            payments: [
                {
                    id: "P1",
                    date: "2026-11-05",
                    amountCents: 33_334,
                    label: "Teilzahlung",
                },
            ],
        });

        expect(paidCents(row)).toBe(33_334);
        expect(outstandingCents(row)).toBe(66_667);
        expect(paymentStatus(row)).toBe("Teilbezahlt");
        expect(overdueDays(row)).toBe(15);
    });

    it("treats due-today and future items as not overdue", () => {
        const today = invoice({ dueDate: "2026-11-18" });
        const future = invoice({ dueDate: "2026-12-03" });

        expect(overdueDays(today)).toBe(0);
        expect(overdueDays(future)).toBe(0);
        expect(paymentStatus(today)).toBe("Offen");
        expect(paymentStatus(future)).toBe("Offen");
        expect(overdueDays(invoice({ dueDate: "2026-11-17" }))).toBe(1);
    });

    it("settles only the remaining amount and preserves the original payment history", () => {
        const row = invoice({
            payments: [
                {
                    id: "P1",
                    date: "2026-11-05",
                    amountCents: 33_334,
                    label: "Teilzahlung",
                },
            ],
        });

        const settled = simulatePayment(row);

        expect(settled.payments).toHaveLength(2);
        expect(settled.payments[1]).toMatchObject({
            amountCents: 66_667,
            date: "2026-11-18",
            label: "Demo-Zahlung simuliert",
        });
        expect(row.payments).toHaveLength(1);
        expect(paidCents(settled)).toBe(100_001);
        expect(outstandingCents(settled)).toBe(0);
        expect(paymentStatus(settled)).toBe("Ausgeglichen");
        expect(overdueDays(settled)).toBe(0);
        expect(simulatePayment(settled)).toBe(settled);
    });

    it("weights the total payment ratio by amounts and counts overdue partial items", () => {
        const large = invoice({
            amountCents: 90_000,
            payments: [
                {
                    id: "P1",
                    date: "2026-11-05",
                    amountCents: 45_000,
                    label: "Teilzahlung",
                },
            ],
        });
        const small = invoice({
            id: "OP-SMALL",
            amountCents: 10_000,
            dueDate: "2026-12-03",
        });

        expect(paymentTotals([large, small])).toEqual({
            count: 2,
            amountCents: 100_000,
            paidCents: 45_000,
            outstandingCents: 55_000,
            overdueCents: 45_000,
            overdueCount: 1,
            openCount: 2,
            settledCount: 0,
            progress: 45,
        });
        expect(paymentTotals([small]).overdueCents).toBe(0);
        expect(paymentTotals([])).toMatchObject({
            count: 0,
            outstandingCents: 0,
            progress: 0,
        });
        expect(unitTotals([])).toMatchObject({
            units: 0,
            occupancy: 0,
            rentCents: 0,
        });
    });
});
