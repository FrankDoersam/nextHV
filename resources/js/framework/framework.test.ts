import { CloneAction } from "@/modules/properties/clone-action";
import { describe, expect, it, vi } from "vitest";
import { DeleteAction } from "./actions";
import { normalizeValidationErrors, searchPayload } from "./data/provider";
import { initialValues, schemaFor } from "./forms/schema";
import { can, permissionConfig } from "./permissions";
import type { ResourceDefinition } from "./types";
describe("resource contracts", () => {
    it("keeps Currency numeric, including zero, and rejects extra precision", () => {
        const schema = schemaFor([
            {
                name: "rent",
                label: "Miete",
                kind: "currency",
                required: true,
                min: 0,
            },
        ]);
        expect(schema.safeParse({ rent: 0 }).success).toBe(true);
        expect(schema.safeParse({ rent: 1234.56 }).success).toBe(true);
        for (const rent of [-1, 1.234, "12", NaN])
            expect(schema.safeParse({ rent }).success).toBe(false);
    });
    it("validates date and month ranges", () => {
        for (const kind of ["date-range", "month-range"] as const) {
            const schema = schemaFor([
                { name: "range", label: "Zeitraum", kind },
            ]);
            expect(
                schema.safeParse({ range: { from: "2026-12", to: "2026-01" } })
                    .success,
            ).toBe(false);
        }
    });
    it("preserves zero and false defaults and never reads write-only fields into a form", () => {
        expect(
            initialValues(
                [
                    { name: "money", label: "€", default: 1 },
                    { name: "yes", label: "Ja", default: true },
                    { name: "secret", label: "ID", writeOnly: true },
                ],
                { money: 0, yes: false, secret: "secret" },
            ),
        ).toEqual({ money: 0, yes: false, secret: undefined });
    });
    it("maps Laravel nested validation errors", () => {
        expect(
            normalizeValidationErrors({
                "mutate.0.attributes.name": ["Pflichtfeld"],
                "fields.code": ["Vergeben"],
            }),
        ).toEqual({ name: "Pflichtfeld", code: "Vergeben" });
    });
    it("builds the Lomkit search envelope", () => {
        const resource = {
            name: "properties",
            includes: [{ relation: "units" }],
        } as ResourceDefinition;
        expect(
            searchPayload(resource, {
                query: "Linden",
                page: 2,
                limit: 10,
                filters: [{ field: "city", value: "Berlin" }],
            }),
        ).toEqual({
            search: {
                page: 2,
                limit: 10,
                filters: [{ field: "city", value: "Berlin" }],
                sorts: [{ field: "id", direction: "desc" }],
                text: { value: "Linden" },
                includes: [{ relation: "units" }],
            },
        });
    });
    it("skips the permission adapter entirely while disabled", () => {
        const check = vi.fn(() => false);
        permissionConfig.adapter = { can: check };
        permissionConfig.enabled = false;
        expect(can("units", "delete")).toBe(true);
        expect(check).not.toHaveBeenCalled();
        permissionConfig.enabled = true;
        expect(can("units", "delete")).toBe(false);
        permissionConfig.enabled = false;
    });
    it("declares bulk support explicitly", () => {
        expect(new CloneAction().bulk).toBe(false);
        expect(new DeleteAction().bulk).toBe(true);
    });
    it("rejects impossible dates, invalid months, partial ranges and invalid times", () => {
        for (const [kind, value] of [
            ["date", "2026-02-31"],
            ["month", "2026-13"],
            ["time", "24:01"],
            ["date-range", { from: "2026-01-01" }],
        ] as const) {
            expect(
                schemaFor([
                    { name: "value", label: "Wert", kind, required: true },
                ]).safeParse({ value }).success,
            ).toBe(false);
        }
        expect(
            initialValues([{ name: "date", label: "Datum", kind: "date" }], {
                date: "2026-01-01T00:00:00.000000Z",
            }).date,
        ).toBe("2026-01-01");
    });
});
