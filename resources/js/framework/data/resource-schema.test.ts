import { beforeEach, describe, expect, it, vi } from "vitest";
import { Building } from "lucide-react";
import type { ResourceDefinition } from "../types";
import { label } from "@/lib/format";
import {
    columnFilters,
    compileGridFilters,
    sanitizeGridFilters,
} from "../tables/filter-rules";
import {
    clearResourceSchemaCache,
    hydrateResources,
    loadResourceSchemas,
    parseResourceSchema,
    type ResourceSchema,
} from "./resource-schema";
import { request } from "./http";
vi.mock("./http", () => ({ request: vi.fn() }));
const field = (
    name: string,
    type = "text",
    operators = ["=", "!=", "in", "not in", "like", "not like"],
) => ({
    name,
    type,
    nullable: false,
    select: true,
    sort: true,
    create: true,
    update: true,
    filter: { operators },
    rules: { all: [], create: [], update: [] },
});
const options = [
    { value: "ready", label: "Nutzbar" },
    { value: "maintenance", label: "Instandhaltung" },
];
function schema(): ResourceSchema {
    return {
        fields: [
            field("name"),
            field("status", "enum", ["=", "!=", "in", "not in"]),
            field("property_id", "integer", ["=", "!=", "in", "not in"]),
        ],
        meta: {
            ui: {
                version: 1,
                fields: {
                    status: {
                        options,
                        offeredOptions: [options[0]],
                        default: "ready",
                    },
                },
                relations: {
                    property_id: {
                        relation: "property",
                        responseKey: "property",
                        resource: "properties",
                        labelField: "name",
                        filters: [{ field: "status", value: "active" }],
                        filterFilters: [],
                        creatable: false,
                    },
                },
                labels: { ready: "Nutzbar", maintenance: "Instandhaltung" },
            },
        },
    };
}
function resource(): ResourceDefinition {
    return {
        name: "units",
        label: "Einheiten",
        singular: "Einheit",
        description: "",
        icon: Building,
        titleField: "name",
        actions: [],
        fields: [
            { name: "name", label: "Name" },
            { name: "status", label: "Zustand", kind: "select" },
            { name: "property_id", label: "Objekt", kind: "relation" },
        ],
        columns: [
            { field: "status", label: "Zustand" },
            { field: "property.name", label: "Objekt" },
        ],
        filters: [{ field: "status", label: "Zustand" }],
    };
}
beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
});
describe("native REST description adapter", () => {
    it("hydrates one registry in place, offered form choices and all readable filter choices", () => {
        const definition = resource();
        hydrateResources([definition], { units: schema() });
        expect(definition.fields[1].options).toEqual([options[0]]);
        expect(definition.fields[1].default).toBe("ready");
        expect(definition.filters?.[0].options).toEqual(options);
        expect(label("ready")).toBe("Nutzbar");
        const choices = columnFilters(definition).find(
            (filter) => filter.field === "status",
        );
        expect(choices?.operators).not.toContain("is null");
        expect(choices?.operators).not.toContain("contains");
    });
    it("uses searchable foreign-key pickers while preserving historical grid choices", () => {
        const definition = resource();
        hydrateResources([definition], { units: schema() });
        expect(definition.fields[2]).toMatchObject({
            resource: "properties",
            filters: [{ field: "status", value: "active" }],
            creatable: false,
        });
        const filters = columnFilters(definition);
        expect(
            filters.find((filter) => filter.field === "property_id"),
        ).toMatchObject({
            kind: "relation",
            labelField: "name",
            filters: [],
            multiple: true,
            creatable: false,
        });
        const values = sanitizeGridFilters(
            {
                property_id: {
                    operator: "in",
                    values: ["41", "42", "invalid"],
                },
            },
            filters,
        );
        expect(compileGridFilters(values, filters)).toEqual([
            { field: "property_id", operator: "in", value: [41, 42] },
        ]);
    });
    it("allows explicitly requested nested text filters and resolves snake-case response names", () => {
        const definition = resource();
        definition.filters = [
            { field: "property.name", label: "Objektname", kind: "text" },
        ];
        const metadata = schema();
        metadata.meta.ui.relations.property_id.responseKey = "property_record";
        definition.columns[1].field = "property_record.name";
        hydrateResources([definition], {
            units: metadata,
            properties: { ...schema(), fields: [field("name")] },
        });
        expect(definition.filters?.[0]).toMatchObject({
            field: "property.name",
            kind: "text",
        });
        expect(definition.columns[1].filter).toMatchObject({
            field: "property_id",
            kind: "relation",
        });
    });
    it("honors native readonly fields and input hints without enabling client business validation", () => {
        const definition = resource();
        const metadata = schema();
        metadata.fields[0].rules.all = ["max:70"];
        metadata.fields[0].rules.create = ["required"];
        metadata.fields[0].update = false;
        hydrateResources([definition], { units: metadata });
        expect(definition.fields[0]).toMatchObject({
            maxLength: 70,
            required: true,
            readonlyOnEdit: true,
        });
        expect(definition.fields[0].validate).toBeUndefined();
    });
    it("fails atomically instead of leaving one resource partly hydrated", () => {
        const definition = resource();
        const invalid = { ...resource(), name: "missing" };
        expect(() =>
            hydrateResources([definition, invalid], { units: schema() }),
        ).toThrow();
        expect(definition.fields[1].options).toBeUndefined();
        expect(() =>
            parseResourceSchema({ fields: [], meta: { ui: {} } }),
        ).toThrow();
    });
    it("rehydrates from presentation templates when permissions/offered choices change", () => {
        const definition = resource();
        const first = schema();
        first.fields[0].update = false;
        hydrateResources([definition], { units: first });
        hydrateResources([definition], { units: schema() });
        expect(definition.fields[0].readonlyOnEdit).toBe(false);
    });
    it("caches only declarative metadata per user, refetches expired cache and clears on auth events", async () => {
        vi.mocked(request).mockResolvedValue({ data: schema() });
        await loadResourceSchemas([resource()], 7);
        await loadResourceSchemas([resource()], 7);
        expect(request).toHaveBeenCalledTimes(1);
        await loadResourceSchemas([resource()], 8);
        expect(request).toHaveBeenCalledTimes(2);
        for (const key of Object.keys(sessionStorage)) {
            const cache = JSON.parse(sessionStorage.getItem(key)!);
            cache.expires = 0;
            sessionStorage.setItem(key, JSON.stringify(cache));
        }
        await loadResourceSchemas([resource()], 7);
        expect(request).toHaveBeenCalledTimes(3);
        clearResourceSchemaCache();
        expect(sessionStorage.length).toBe(0);
    });
    it("does not persist partial responses and propagates server errors for retry", async () => {
        vi.mocked(request).mockRejectedValue(
            new Error("Beschreibung nicht erreichbar"),
        );
        await expect(loadResourceSchemas([resource()], 7)).rejects.toThrow(
            "Beschreibung nicht erreichbar",
        );
        expect(sessionStorage.length).toBe(0);
    });
});
