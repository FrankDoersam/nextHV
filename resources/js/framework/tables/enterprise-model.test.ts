import { describe, expect, it } from "vitest";
import type {
    FilterNode,
    FilterQuery,
    FilterRule,
} from "@/components/reui/filters/filters-types";
import type { EnterpriseModuleConfig } from "./enterprise-types";
import {
    buildEnterprisePage,
    enterpriseCsv,
    selectEnterpriseRows,
} from "./enterprise-model";

interface DemoRow {
    id: string;
    property: string;
    name: string;
    status: string;
    amount: number | null;
    tags: string[];
}

const row = (id: string, changes: Partial<DemoRow> = {}): DemoRow => ({
    id,
    property: "Birkenhof",
    name: "Einheit " + id,
    status: "offen",
    amount: 10,
    tags: [],
    ...changes,
});
const rule = (
    field: string,
    operator: string,
    value?: unknown,
    negated = false,
): FilterRule => ({
    id: field + operator,
    type: "rule",
    path: [field],
    operator,
    value,
    negated,
});
const query = (...rules: FilterNode[]): FilterQuery => ({
    id: "root",
    type: "group",
    combinator: "and",
    rules,
});

function config(
    rows: readonly DemoRow[] = [],
): EnterpriseModuleConfig<DemoRow> {
    return {
        id: "test",
        title: "Test",
        description: "",
        itemLabel: "Einheiten",
        rows,
        columns: [
            {
                id: "name",
                label: "Name",
                value: (entry) => entry.name,
                render: (entry) => entry.name,
            },
            {
                id: "amount",
                label: "Betrag",
                value: (entry) => entry.amount,
                render: (entry) => entry.amount,
                aggregate: (entries) =>
                    entries.reduce(
                        (sum, entry) => sum + (entry.amount ?? 0),
                        0,
                    ),
            },
        ],
        filters: [
            {
                id: "name",
                label: "Name",
                type: "text",
                getValue: (entry) => entry.name,
            },
            {
                id: "status",
                label: "Status",
                type: "select",
                getValue: (entry) => entry.status,
            },
            {
                id: "amount",
                label: "Betrag",
                type: "number",
                getValue: (entry) => entry.amount,
            },
            {
                id: "tags",
                label: "Tags",
                type: "multiselect",
                getValue: (entry) => entry.tags,
            },
        ],
        groups: [
            {
                id: "property",
                label: "Objekt",
                value: (entry) => entry.property,
            },
        ],
        views: [],
        searchText: (entry) => `${entry.name} ${entry.property}`,
        metrics: () => [],
        detailTitle: (entry) => entry.name,
        renderDetail: () => null,
    };
}

describe("enterprise filtered records", () => {
    it("ignores field and value drafts without broadening an OR query", () => {
        const rows = [row("open"), row("paid", { status: "ausgeglichen" })];
        const fieldDraft = rule("status", "");
        const valueDraft = rule("amount", "gte");
        const partialRange = rule("amount", "between", [0, undefined]);
        const active = rule("status", "is", "offen");
        const select = (filter: FilterQuery) =>
            selectEnterpriseRows(rows, config(), {
                search: "",
                sorting: [],
                query: filter,
            }).map((entry) => entry.id);

        expect(select(query(fieldDraft))).toEqual(["open", "paid"]);
        expect(select(query(valueDraft, partialRange))).toEqual([
            "open",
            "paid",
        ]);
        expect(select(query(active, fieldDraft, valueDraft))).toEqual(["open"]);
        expect(
            select({
                ...query(active, fieldDraft, valueDraft),
                combinator: "or",
            }),
        ).toEqual(["open"]);
        expect(
            select(
                query(active, {
                    id: "draft-group",
                    type: "group",
                    combinator: "or",
                    rules: [fieldDraft, valueDraft],
                }),
            ),
        ).toEqual(["open"]);
    });

    it("combines German search, nested conditions, inclusive ranges and negated tags", () => {
        const rows = [
            row("1", { name: "Müller", amount: 0, tags: ["priorität"] }),
            row("2", { name: "Müller", amount: 50, status: "teilbezahlt" }),
            row("3", { name: "Müller", amount: 51 }),
            row("4", { name: "Müller", amount: 25, tags: ["gesperrt"] }),
            row("5", { name: "Müller", amount: 20, status: "ausgeglichen" }),
            row("6", { name: "Schmidt", amount: 30 }),
        ];

        const result = selectEnterpriseRows(rows, config(rows), {
            search: "  MÜLLER   birkenhof  ",
            sorting: [],
            query: query(
                rule("amount", "between", [0, 50]),
                {
                    id: "status-choice",
                    type: "group",
                    combinator: "or",
                    rules: [
                        rule("status", "is", "offen"),
                        rule("status", "is", "teilbezahlt"),
                    ],
                },
                rule("tags", "has_any_of", ["gesperrt"], true),
            ),
        });

        expect(result.map((entry) => entry.id)).toEqual(["1", "2"]);
        expect(rows).toHaveLength(6);
    });

    it("never treats an absent number as zero, including negated comparisons", () => {
        const rows = [
            row("none", { amount: null }),
            row("zero", { amount: 0 }),
            row("positive", { amount: 12.5 }),
        ];
        const select = (condition: FilterRule) =>
            selectEnterpriseRows(rows, config(), {
                search: "",
                sorting: [],
                query: query(condition),
            }).map((entry) => entry.id);

        expect(select(rule("amount", "eq", 0))).toEqual(["zero"]);
        expect(select(rule("amount", "neq", 0))).toEqual(["positive"]);
        expect(select(rule("amount", "eq", "12,5"))).toEqual(["positive"]);
        expect(select(rule("amount", "eq", 0, true))).toEqual(["positive"]);
        expect(select(rule("amount", "empty"))).toEqual(["none"]);
    });

    it.each([
        ["unknown field", rule("missing", "is", "offen", true)],
        ["unknown operator", rule("amount", "magic", 12, true)],
        ["incomplete number", rule("amount", "eq", "", true)],
        ["reversed range", rule("amount", "between", [20, 0], true)],
        ["incomplete range", rule("amount", "between", [0], true)],
        ["malformed choices", rule("status", "is_any_of", "offen", true)],
    ])(
        "keeps an invalid %s from matching even when negated",
        (_label, condition) => {
            const result = selectEnterpriseRows([row("1")], config(), {
                search: "",
                sorting: [],
                query: query(condition),
            });

            expect(result).toEqual([]);
        },
    );

    it("sorts numeric values and secondary names stably with missing values last", () => {
        const rows = [
            row("a", { amount: 10, name: "Einheit 10" }),
            row("b", { amount: 2, name: "Einheit 2" }),
            row("c", { amount: 10, name: "Einheit 2" }),
            row("d", { amount: 10, name: "Einheit 2" }),
            row("e", { amount: null, name: "Einheit 1" }),
        ];

        const result = selectEnterpriseRows(rows, config(), {
            search: "",
            query: query(),
            sorting: [
                { id: "amount", desc: true },
                { id: "name", desc: false },
            ],
        });
        const ascending = selectEnterpriseRows(rows, config(), {
            search: "",
            query: query(),
            sorting: [{ id: "amount", desc: false }],
        });

        expect(result.map((entry) => entry.id)).toEqual([
            "c",
            "d",
            "a",
            "b",
            "e",
        ]);
        expect(ascending.map((entry) => entry.id)).toEqual([
            "b",
            "a",
            "c",
            "d",
            "e",
        ]);
        expect(rows.map((entry) => entry.id)).toEqual([
            "a",
            "b",
            "c",
            "d",
            "e",
        ]);
    });
});

describe("enterprise grouped pages", () => {
    it("paginates complete filtered groups while totals count each record once", () => {
        const rows = [
            row("1", { property: "Zedernhof", amount: 100 }),
            row("2", { property: "Birkenhof", amount: 10 }),
            row("3", { property: "Zedernhof", amount: 50 }),
            row("4", { property: "Birkenhof", amount: 20 }),
            row("5", {
                property: "Birkenhof",
                amount: 900,
                status: "ausgeglichen",
            }),
        ];
        const definition = config(rows);
        const filtered = selectEnterpriseRows(rows, definition, {
            search: "",
            sorting: [],
            query: query(rule("status", "is", "offen")),
        });

        const firstPage = buildEnterprisePage(
            filtered,
            definition.groups[0],
            { pageIndex: 0, pageSize: 1 },
            new Set(),
        );
        const secondPage = buildEnterprisePage(
            filtered,
            definition.groups[0],
            { pageIndex: 1, pageSize: 1 },
            new Set(),
        );

        expect(firstPage.recordCount).toBe(2);
        expect(firstPage.pageCount).toBe(2);
        expect(firstPage.displayRows.map((entry) => entry.id)).toEqual([
            "group:property:Birkenhof",
            "record:2",
            "record:4",
        ]);
        expect(secondPage.displayRows.map((entry) => entry.id)).toEqual([
            "group:property:Zedernhof",
            "record:1",
            "record:3",
        ]);
        expect(definition.columns[1].aggregate!(filtered)).toBe(180);
        expect(
            firstPage.groups.map((entry) =>
                definition.columns[1].aggregate!(entry.rows),
            ),
        ).toEqual([30, 150]);
    });

    it("retains the full group summary when its detail rows are collapsed", () => {
        const rows = [row("1", { amount: 15 }), row("2", { amount: 25 })];
        const definition = config(rows);

        const page = buildEnterprisePage(
            rows,
            definition.groups[0],
            { pageIndex: 0, pageSize: 2 },
            new Set(["group:property:Birkenhof"]),
        );

        expect(page.displayRows).toEqual([
            {
                kind: "group",
                id: "group:property:Birkenhof",
                label: "Birkenhof",
                rows,
            },
        ]);
        expect(page.recordCount).toBe(1);
        expect(definition.columns[1].aggregate!(page.groups[0].rows)).toBe(40);
    });

    it("clamps a stale page after filtering and handles an empty result", () => {
        const rows = [row("1"), row("2"), row("3")];

        const page = buildEnterprisePage(
            rows,
            undefined,
            { pageIndex: 9, pageSize: 2 },
            new Set(),
        );
        const empty = buildEnterprisePage(
            [],
            undefined,
            { pageIndex: 9, pageSize: 2 },
            new Set(),
        );

        expect(page.pageIndex).toBe(1);
        expect(page.recordCount).toBe(3);
        expect(page.displayRows.map((entry) => entry.id)).toEqual(["record:3"]);
        expect(empty.pageIndex).toBe(0);
        expect(empty.recordCount).toBe(0);
        expect(empty.displayRows).toEqual([]);
    });
});

describe("enterprise CSV", () => {
    it("exports values with German decimals and safely quotes formulas and line breaks", () => {
        const rows = [
            row("1", {
                name: '  \t=HYPERLINK("https://example.test")',
                amount: 1200.5,
            }),
            row("2", { name: "Name;mit\nZeilenumbruch", amount: -25.75 }),
            row("3", { name: "@SUM(A1)", amount: null }),
        ];

        const csv = enterpriseCsv(rows, config().columns);

        expect(csv).toBe(
            '\uFEFF"Name";"Betrag"\r\n"\'  \t=HYPERLINK(""https://example.test"")";"1200,5"\r\n"Name;mit\nZeilenumbruch";"-25,75"\r\n"\'@SUM(A1)";""',
        );
    });
});
