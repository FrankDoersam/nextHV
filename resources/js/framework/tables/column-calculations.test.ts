import { describe, expect, it } from "vitest";
import { buildRentScenarioColumns } from "@/modules/contracts/rent-scenario-columns";
import type {
    CellDraftValues,
    ColumnDefinition,
    ColumnExpression,
    RecordData,
} from "../types";
import {
    cellNumber,
    evaluateColumn,
    evaluateExpression,
    matchesCellCondition,
    resolveCellColor,
} from "./column-calculations";

const record = (): RecordData => ({
    id: 8,
    updated_at: "2026-11-18T09:00:00Z",
    base_rent: "1200.00",
});

function scenario(field: string, draft: CellDraftValues = {}, row = record()) {
    const columns = buildRentScenarioColumns(2027);
    return evaluateColumn(
        row,
        columns.find((column) => column.field === field)!,
        columns,
        draft,
    );
}

describe("declarative column calculations", () => {
    it("calculates a rent scenario from stored rent and separate drafts without mutating the record", () => {
        const row = Object.freeze(record());
        const draft = Object.freeze({
            scenario_adjustment_percent: 7.5,
            scenario_effective_from: "2027-07-01",
            scenario_valuation: 300000,
        });

        expect(scenario("scenario_new_rent", draft, row)).toBe(1290);
        expect(scenario("scenario_monthly_delta", draft, row)).toBe(90);
        expect(scenario("scenario_year_delta", draft, row)).toBe(540);
        expect(scenario("scenario_gross_yield", draft, row)).toBe(4.98);
        expect(row).toEqual({
            id: 8,
            updated_at: "2026-11-18T09:00:00Z",
            base_rent: "1200.00",
        });
        expect(
            scenario("scenario_monthly_delta", {
                ...draft,
                scenario_enabled: false,
            }),
        ).toBe(0);
    });

    it.each([
        ["2026-12-15", 12, 720],
        ["2027-01-01", 12, 720],
        ["2027-07-01", 6, 360],
        ["2027-07-15", 5, 300],
        ["2027-12-02", 0, 0],
        ["2028-01-01", 0, 0],
    ])(
        "counts only full calendar months from %s in the chosen preview year",
        (date, months, income) => {
            expect(
                scenario("scenario_full_months", {
                    scenario_effective_from: date,
                }),
            ).toBe(months);
            expect(
                scenario("scenario_year_delta", {
                    scenario_effective_from: date,
                }),
            ).toBe(income);
        },
    );

    it("keeps missing, invalid and zero-denominator results unavailable instead of inventing zero", () => {
        expect(
            scenario("scenario_new_rent", {}, { ...record(), base_rent: null }),
        ).toBeNull();
        expect(
            scenario("scenario_new_rent", {
                scenario_adjustment_percent: null,
            }),
        ).toBeNull();
        expect(
            scenario("scenario_new_rent", { scenario_adjustment_percent: 101 }),
        ).toBeNull();
        expect(
            scenario("scenario_new_rent", { scenario_rounding: 3 }),
        ).toBeNull();
        expect(
            scenario("scenario_year_delta", {
                scenario_effective_from: "2027-02-30",
            }),
        ).toBeNull();
        expect(
            scenario("scenario_year_delta", { scenario_year: 2027.5 }),
        ).toBeNull();
        expect(
            scenario("scenario_gross_yield", { scenario_valuation: 0 }),
        ).toBeNull();
        expect(scenario("scenario_gross_yield")).toBeNull();
        expect(cellNumber(" ")).toBeNull();
        expect(cellNumber(false)).toBeNull();
        expect(cellNumber("0")).toBe(0);
        expect(
            evaluateExpression(
                {
                    type: "operation",
                    operator: "multiply",
                    values: [
                        { type: "literal", value: 1e308 },
                        { type: "literal", value: 1e308 },
                    ],
                },
                record(),
            ),
        ).toBeNull();
    });

    it("resolves typed choices and colored conditions without treating missing values as a match", () => {
        const columns = buildRentScenarioColumns(2027);
        const delta = columns.find(
            (column) => column.field === "scenario_monthly_delta",
        )!;
        const row = { ...record(), base_rent: 999.99 };
        expect(
            scenario("scenario_new_rent", { scenario_rounding: 0 }, row),
        ).toBe(1050);
        expect(
            resolveCellColor(delta, row, columns, {
                scenario_adjustment_percent: -10,
            }),
        ).toMatchObject({ tone: "warning", label: "Minderung" });
        expect(
            resolveCellColor(delta, row, columns, {
                scenario_adjustment_percent: null,
            }),
        ).toBeUndefined();
        expect(
            matchesCellCondition(
                {
                    type: "not",
                    condition: {
                        type: "compare",
                        left: { type: "field", field: "missing" },
                        operator: "eq",
                        right: { type: "literal", value: 0 },
                    },
                },
                row,
            ),
        ).toBe(false);
    });

    it("rejects cyclic and excessive expressions and inherited object paths", () => {
        const columns: ColumnDefinition[] = [
            {
                field: "first",
                label: "First",
                computed: { type: "column", field: "second" },
            },
            {
                field: "second",
                label: "Second",
                computed: { type: "column", field: "first" },
            },
        ];
        expect(evaluateColumn(record(), columns[0], columns)).toBeNull();
        expect(
            evaluateExpression(
                { type: "field", field: "constructor.name" },
                record(),
            ),
        ).toBeNull();
        expect(
            evaluateExpression(
                { type: "column", field: "missing" },
                record(),
                columns,
            ),
        ).toBeNull();
        let expression: ColumnExpression = { type: "literal", value: 1 };
        for (let index = 0; index < 40; index += 1)
            expression = {
                type: "operation",
                operator: "add",
                values: [expression],
            };
        expect(evaluateExpression(expression, record())).toBeNull();
        expect(
            evaluateExpression(
                {
                    type: "javascript",
                    source: "throw new Error()",
                } as unknown as ColumnExpression,
                record(),
            ),
        ).toBeNull();
    });
});
