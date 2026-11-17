import { describe, expect, it } from "vitest";
import {
    createDemoContacts,
    demoContactsCsv,
    filterAndSortContacts,
    getDemoMetrics,
} from "./demo-contacts";

describe("ReUI CRM demo data", () => {
    it("creates deterministic synthetic rows with unique ids", () => {
        const first = createDemoContacts(84);
        expect(first).toEqual(createDemoContacts(84));
        expect(new Set(first.map((c) => c.id)).size).toBe(84);
        expect(first.every((c) => c.email.endsWith("@example.test"))).toBe(true);
    });
    it("filters and sorts local data without accessing an API", () => {
        const rows = createDemoContacts(12);
        const filtered = filterAndSortContacts(
            rows,
            "Northstar",
            [{ id: "status", value: ["Aktiv"] }],
            [{ id: "dealValue", desc: true }],
        );
        expect(filtered.length).toBeGreaterThan(0);
        expect(filtered.every((r) => r.company === "Northstar" && r.status === "Aktiv")).toBe(true);
        expect(filtered.map((r) => r.dealValue)).toEqual(
            filtered.map((r) => r.dealValue).sort((a, b) => b - a),
        );
        expect(getDemoMetrics(rows).total).toBe(12);
    });
    it("exports quotes and protects spreadsheet formulas", () => {
        const rows = createDemoContacts(1);
        rows[0].company = '=HYPERLINK("https://example.test")';
        const csv = demoContactsCsv(rows);
        expect(csv).toContain("'\u003dHYPERLINK");
        expect(csv).toContain('""https://example.test""');
        expect(csv.startsWith("\uFEFF")).toBe(true);
    });
});
