import { describe, expect, it } from "vitest";
import { panelSearch, readPanels, type PanelLink } from "./panels";

const createUnit: PanelLink = {
    key: "p1",
    resource: "units",
    mode: "create",
    presentation: "sheet",
    reduced: true,
    context: { resource: "properties", id: 16, field: "property_id" },
};
describe("portable panel links", () => {
    it("produces a readable parent-bound create link without serializing private input or random UI keys", () => {
        const url = panelSearch("tab=unitsproperty_id", [
            {
                ...createUnit,
                key: "random-ui-id",
                ...{ values: { name: "Private input" } },
            },
        ]);
        expect(url).toBe(
            "tab=unitsproperty_id&panel=units/new&parent=properties/16&bind=property_id&reduced=1",
        );
        expect(readPanels(url)).toEqual([createUnit]);
    });
    it("roundtrips nested edits, locked contexts and return-to-view while preserving collection state", () => {
        const edit: PanelLink = {
            key: "p2",
            resource: "contracts",
            id: 12,
            mode: "edit",
            presentation: "dialog",
            fields: ["code", "notes"],
            returnToView: true,
            context: {
                resource: "units",
                id: 5,
                field: "unit_id",
                mode: "prefill",
            },
        };
        const url = panelSearch("q=Berlin&page=2", [createUnit, edit]);
        expect(readPanels(url)).toEqual([createUnit, edit]);
        expect(panelSearch(url, [createUnit])).toBe(
            "q=Berlin&page=2&panel=units/new&parent=properties/16&bind=property_id&reduced=1",
        );
        expect(panelSearch(url, [])).toBe("q=Berlin&page=2");
    });
    it("still opens old shared JSON links and rewrites them on the next navigation", () => {
        const legacy = new URLSearchParams({
            q: "Linden",
            panels: JSON.stringify([{ ...createUnit, key: "old-uuid" }]),
        }).toString();
        expect(readPanels(legacy)).toEqual([createUnit]);
        expect(panelSearch(legacy, readPanels(legacy))).toBe(
            "q=Linden&panel=units/new&parent=properties/16&bind=property_id&reduced=1",
        );
    });
    it("normalizes older wizard dialog URLs to the same right-side sheet", () => {
        const old = "panel=properties/new&layout=dialog&wizard=1";
        const [wizard] = readPanels(old);
        expect(wizard).toEqual({
            key: "p1",
            resource: "properties",
            mode: "create",
            presentation: "sheet",
            wizard: true,
        });
        expect(panelSearch(old, [wizard])).toBe("panel=properties/new&wizard=1");
        const legacy = new URLSearchParams({
            panels: JSON.stringify([{ ...wizard, presentation: "dialog" }]),
        }).toString();
        expect(readPanels(legacy)).toEqual([wizard]);
    });
    it.each([
        "panel=units/0/edit",
        "panel=units/new&parent=properties/16",
        "panel=units/new&bind=property_id",
        "panel=units/new&parent=properties/16&bind=__proto__.id",
        "panel=units/4/edit&fields=notes,secret.path",
        "panel=units/new&layout=fullscreen",
        "panel=units/new&p3.panel=contracts/new",
    ])("rejects malformed links: %s", (url) => {
        expect(readPanels(url)).toEqual([]);
    });
});
