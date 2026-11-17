import { describe, expect, it } from "vitest";
import {
    addInvoice, addOrder, cloneFinance, financeStatus,
    financeTotals, initialFinance, setBudget,
} from "./finance";

describe("Kernsanierung – budget, purchasing and incoming invoices", () => {
    const state = initialFinance();
    it("keeps amounts as gross euro cents and does not double-count invoiced orders", () => {
        const all = financeTotals(state);
        expect(all.budget).toBeGreaterThan(0);
        expect(all.ordered).toBeGreaterThan(all.invoiced);
        expect(all.open).toBe(all.invoiced - all.paid);
        expect(all.exposure).toBeLessThanOrEqual(all.ordered + all.invoiced);
        const window = financeTotals(state,"fenster-neu");
        expect(window.exposure).toBe(1285000);
        expect(window.invoiced).toBe(390000);
        expect(window.open).toBe(390000);
    });
    it("distinguishes open, part paid, fully paid invoices", () => {
        expect(financeStatus(state.invoices[0])).toBe("offen");
        expect(financeStatus(state.invoices[2])).toBe("teilbezahlt");
        expect(financeStatus(state.invoices[3])).toBe("bezahlt");
    });
    it("updates a single budget immutably", () => {
        const copy = cloneFinance(state);
        const after = setBudget(copy,"fenster-neu",1500000);
        expect(financeTotals(after,"fenster-neu").budget).toBe(1500000);
        expect(financeTotals(copy,"fenster-neu").budget).not.toBe(1500000);
    });
    it("rejects invalid values, duplicate invoices and duplicate purchase orders", () => {
        expect(() => setBudget(state,"fenster-neu",-1)).toThrow();
        expect(() => addOrder(state,state.orders[0])).toThrow("Bestellnummer");
        expect(() => addInvoice(state,state.invoices[0])).toThrow("Doppelte");
        expect(() => addInvoice(state,{...state.invoices[1],id:"extra",paidCents:900000})).toThrow("unplausibel");
    });
});