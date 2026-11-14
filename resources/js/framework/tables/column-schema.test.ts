import { describe, expect, it } from "vitest";
import { Building2 } from "lucide-react";
import type { ResourceDefinition } from "../types";
import {
    columnFilters,
    compileGridFilters,
    sanitizeGridFilters,
} from "./filter-rules";
import { resolveColumnLayout } from "./column-layout";
const resource: ResourceDefinition = {
    name: "demo",
    description: "Schema fixture",
    label: "Demo",
    singular: "Demo",
    icon: Building2,
    titleField: "name",
    actions: [],
    fields: [
        { name: "name", label: "Name", kind: "text" },
        {
            name: "status",
            label: "Status",
            kind: "select",
            options: [{ value: "active", label: "Aktiv" }],
        },
        { name: "secret", label: "Secret", kind: "text", writeOnly: true },
    ],
    columns: [
        { field: "name", label: "Name" },
        { field: "status", label: "Status", kind: "badge" },
        {
            field: "area",
            label: "Fläche",
            kind: "number",
            defaultVisible: false,
        },
        { field: "expires_on", label: "Gültig bis", kind: "date" },
        {
            field: "partner.name",
            label: "Partner",
            filter: { field: "businessPartner.full_name" },
        },
        { field: "secret", label: "Secret" },
        { field: "preview", label: "Vorschau", filter: false },
    ],
};
describe("column schema filters", () => {
    it("derives all eligible columns including hidden ones and respects aliases and explicit overrides", () => {
        const definitions = columnFilters({
            ...resource,
            filters: [
                {
                    field: "name",
                    label: "Name",
                    kind: "text",
                    operators: ["contains"],
                },
            ],
        });
        expect(definitions.map((d) => [d.field, d.kind])).toEqual([
            ["name", "text"],
            ["status", "choice"],
            ["area", "number"],
            ["expires_on", "date"],
            ["businessPartner.full_name", "text"],
        ]);
        expect(definitions[0].operators).toEqual(["contains"]);
        expect(definitions[1].options).toEqual([
            { value: "active", label: "Aktiv" },
        ]);
    });
    it("compiles numbers, equal-bound ranges, dates, nulls and text to native API operators", () => {
        const definitions = columnFilters(resource);
        const filters = sanitizeGridFilters(
            {
                area: { operator: "between", values: ["85.5", "85.5"] },
                expires_on: { operator: "is null", values: [] },
                name: { operator: "contains", values: ["O'Neil"] },
                status: "active",
            },
            definitions,
        );
        expect(compileGridFilters(filters, definitions)).toEqual([
            { field: "name", operator: "like", value: "%O'Neil%" },
            { field: "status", operator: "in", value: ["active"] },
            { field: "area", operator: "between", value: [85.5, 85.5] },
            { field: "expires_on", operator: "is null" },
        ]);
        expect(
            sanitizeGridFilters(
                {
                    expires_on: {
                        operator: "between",
                        values: ["2026-01-01", "2026-12-31"],
                    },
                },
                definitions,
            ),
        ).toHaveProperty("expires_on.values", ["2026-01-01", "2026-12-31"]);
    });
    it("discards unknown fields/operators, invalid dates, reversed ranges and unregistered choices", () => {
        const definitions = columnFilters(resource);
        expect(
            sanitizeGridFilters(
                {
                    unknown: "x",
                    name: { operator: "drop", values: ["x"] },
                    status: "injected",
                    area: { operator: "between", values: ["90", "80"] },
                    expires_on: { operator: "=", values: ["2026-02-30"] },
                },
                definitions,
            ),
        ).toEqual({});
        expect(
            sanitizeGridFilters(
                { area: { operator: ">", values: ["1 OR 1=1"] } },
                definitions,
            ),
        ).toEqual({});
    });
});
describe("responsive column widths", () => {
    const columns: ResourceDefinition = {
        ...resource,
        columns: [
            { field: "code", label: "Nr." },
            { field: "name", label: "Name" },
            { field: "full_address", label: "Adresse" },
            { field: "area", label: "m²", kind: "number" },
            { field: "status", label: "Status", kind: "badge" },
        ],
    };
    it("gives spare space to titles and addresses while status and numeric columns stay compact", () => {
        const layout = resolveColumnLayout(columns, 1200, {});
        expect(layout.status.size).toBe(116);
        expect(layout.name.size).toBeGreaterThan(layout.status.size * 2);
        expect(layout.full_address.size).toBe(layout.name.size);
        expect(Object.values(layout).reduce((n, c) => n + c.size, 88)).toBe(
            1200,
        );
    });
    it("allows longer status labels without stretching the status column across spare width", () => {
        const configured = {
            ...columns,
            fields: [
                {
                    name: "status",
                    label: "Status",
                    kind: "select" as const,
                    options: [
                        { value: "maintenance", label: "Instandhaltung" },
                    ],
                },
            ],
        };
        const layout = resolveColumnLayout(configured, 1200, {});
        expect(layout.status.size).toBeGreaterThanOrEqual(160);
        expect(layout.status.size).toBeLessThanOrEqual(180);
        expect(layout.name.size).toBeGreaterThan(layout.status.size);
    });
    it("clamps percentage preferences, respects min/max and frees hidden-column space", () => {
        const configured = {
            ...columns,
            columns: columns.columns.map((c) =>
                c.field === "name"
                    ? {
                          ...c,
                          size: "35%" as const,
                          minSize: 200,
                          maxSize: 350,
                          grow: 0,
                      }
                    : c,
            ),
        };
        const layout = resolveColumnLayout(configured, 1200, { area: false });
        expect(layout.name.size).toBe(350);
        const narrow = resolveColumnLayout(configured, 320, {});
        for (const column of Object.values(narrow))
            expect(column.size).toBeGreaterThanOrEqual(column.minSize);
        expect(
            Object.values(narrow).reduce((n, c) => n + c.size, 88),
        ).toBeGreaterThan(320);
    });
});
