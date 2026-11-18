import { afterEach, describe, expect, it, vi } from "vitest";
import {
    loadEnterpriseViews,
    saveEnterpriseViews,
    type SavedEnterpriseView,
} from "./enterprise-preferences";

function savedView(id = "view-1"): SavedEnterpriseView {
    return {
        id,
        label: "Offene Positionen",
        state: {
            search: "Musterhof",
            query: {
                id: "root",
                type: "group",
                combinator: "and",
                rules: [
                    {
                        id: "amount",
                        type: "rule",
                        path: ["open"],
                        operator: "gte",
                        value: 0,
                    },
                    {
                        id: "group-1",
                        type: "group",
                        combinator: "or",
                        rules: [
                            {
                                id: "status",
                                type: "rule",
                                path: ["status"],
                                operator: "is_any_of",
                                value: ["open", "partial"],
                            },
                            {
                                id: "empty",
                                type: "rule",
                                path: ["owner"],
                                operator: "empty",
                                value: undefined,
                                negated: true,
                            },
                        ],
                    },
                ],
            },
            sorting: [{ id: "open", desc: true }],
            groupBy: "property",
            visibility: { paid: false, open: true },
            density: "compact",
            columnOrder: ["invoice", "open", "paid"],
            pinning: { start: ["invoice"], end: ["actions"] },
        },
    };
}

afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
});

describe("saved enterprise views", () => {
    it("restores nested filters and table presentation without storing row data", () => {
        const view = savedView();

        const stored = saveEnterpriseViews("payments", [view]);
        const restored = loadEnterpriseViews("payments");

        expect(stored).toBe(true);
        expect(restored).toEqual([view]);
        expect(
            window.localStorage.getItem(
                "nexthv.enterprise-demo.payments.views.v1",
            ),
        ).toBe(JSON.stringify([view]));
        expect(restored[0]).not.toBe(view);
    });

    it("keeps module preferences isolated when a different module is changed", () => {
        const objects = savedView("objects-view");
        const payments = savedView("payments-view");
        saveEnterpriseViews("objects", [objects]);
        saveEnterpriseViews("payments", [payments]);

        saveEnterpriseViews("payments", []);

        expect(loadEnterpriseViews("objects")).toEqual([objects]);
        expect(loadEnterpriseViews("payments")).toEqual([]);
        expect(loadEnterpriseViews("unconfigured")).toEqual([]);
    });

    it.each([
        ["invalid JSON", "{broken"],
        ["wrong root shape", JSON.stringify({ rows: [] })],
        [
            "unsupported operator",
            JSON.stringify([
                {
                    ...savedView(),
                    state: {
                        ...savedView().state,
                        query: {
                            id: "root",
                            type: "group",
                            combinator: "and",
                            rules: [
                                {
                                    id: "bad",
                                    type: "rule",
                                    path: ["status"],
                                    operator: "execute",
                                    value: "open",
                                },
                            ],
                        },
                    },
                },
            ]),
        ],
        [
            "object filter values",
            JSON.stringify([
                {
                    ...savedView(),
                    state: {
                        ...savedView().state,
                        query: {
                            id: "root",
                            type: "group",
                            combinator: "and",
                            rules: [
                                {
                                    id: "bad",
                                    type: "rule",
                                    path: ["status"],
                                    operator: "is",
                                    value: [{ record: "private" }],
                                },
                            ],
                        },
                    },
                },
            ]),
        ],
        [
            "non-boolean sorting",
            JSON.stringify([
                {
                    ...savedView(),
                    state: {
                        ...savedView().state,
                        sorting: [{ id: "open", desc: "false" }],
                    },
                },
            ]),
        ],
        [
            "non-boolean visibility",
            JSON.stringify([
                {
                    ...savedView(),
                    state: {
                        ...savedView().state,
                        visibility: { open: "yes" },
                    },
                },
            ]),
        ],
        [
            "conflicting pinning",
            JSON.stringify([
                {
                    ...savedView(),
                    state: {
                        ...savedView().state,
                        pinning: { start: ["open"], end: ["open"] },
                    },
                },
            ]),
        ],
        [
            "unexpected record data",
            JSON.stringify([
                {
                    ...savedView(),
                    state: { ...savedView().state, rows: [{ id: "private" }] },
                },
            ]),
        ],
        [
            "duplicate view identifiers",
            JSON.stringify([savedView(), savedView()]),
        ],
        [
            "oversized preferences",
            JSON.stringify(
                Array.from({ length: 13 }, (_, i) => savedView(`view-${i}`)),
            ),
        ],
    ])("ignores corrupted storage with %s", (_, stored) => {
        window.localStorage.setItem(
            "nexthv.enterprise-demo.payments.views.v1",
            stored,
        );

        expect(loadEnterpriseViews("payments")).toEqual([]);
    });

    it("rejects deeply nested or cyclic queries without replacing existing preferences", () => {
        const original = savedView();
        saveEnterpriseViews("payments", [original]);
        const nested = savedView("nested");
        for (let level = 0; level < 10; level += 1) {
            nested.state.query = {
                id: `group-${level}`,
                type: "group",
                combinator: "and",
                rules: [nested.state.query],
            };
        }
        const cyclic = savedView("cyclic");
        cyclic.state.query.rules = [cyclic.state.query];

        expect(saveEnterpriseViews("payments", [nested])).toBe(false);
        expect(saveEnterpriseViews("payments", [cyclic])).toBe(false);
        expect(loadEnterpriseViews("payments")).toEqual([original]);
    });

    it("returns a failure result when browser storage access is denied", () => {
        vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
            throw new DOMException("Storage is unavailable", "SecurityError");
        });

        expect(loadEnterpriseViews("payments")).toEqual([]);
        expect(saveEnterpriseViews("payments", [savedView()])).toBe(false);
    });

    it("preserves existing preferences when the browser storage quota is exhausted", () => {
        const original = savedView();
        saveEnterpriseViews("payments", [original]);
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new DOMException("Quota exceeded", "QuotaExceededError");
        });

        expect(saveEnterpriseViews("payments", [savedView("new")])).toBe(false);
        expect(loadEnterpriseViews("payments")).toEqual([original]);
    });
});
