import type {
    CellCondition,
    CellScalar,
    ColumnDefinition,
    ColumnExpression,
} from "@/framework/types";

const literal = (value: CellScalar): ColumnExpression => ({
    type: "literal",
    value,
});
const field = (name: string): ColumnExpression => ({
    type: "field",
    field: name,
});
const column = (name: string): ColumnExpression => ({
    type: "column",
    field: name,
});
const operation = (
    operator: Extract<ColumnExpression, { type: "operation" }>["operator"],
    ...values: ColumnExpression[]
): ColumnExpression => ({ type: "operation", operator, values });
const compare = (
    left: ColumnExpression,
    operator: Extract<CellCondition, { type: "compare" }>["operator"],
    right: ColumnExpression,
): CellCondition => ({ type: "compare", left, operator, right });
const choose = (
    condition: CellCondition,
    yes: ColumnExpression,
    no: ColumnExpression,
): ColumnExpression => ({ type: "if", condition, then: yes, otherwise: no });
const datePart = (part: "year" | "month" | "day"): ColumnExpression => ({
    type: "date-part",
    part,
    value: column("scenario_effective_from"),
});

/** Uses existing rent-condition fields; each scenario value is a local, unsaved input. */
export function buildRentScenarioColumns(
    year = new Date().getFullYear() + 1,
): ColumnDefinition[] {
    const base: Pick<ColumnDefinition, "entity" | "sortable" | "filter"> = {
        entity: { id: "rent-scenario", label: "Mietvorschau" },
        sortable: false,
        filter: false,
    };
    const enabled = compare(column("scenario_enabled"), "eq", literal(true));
    const fullMonths = choose(
        compare(datePart("year"), "lt", column("scenario_year")),
        literal(12),
        choose(
            compare(datePart("year"), "gt", column("scenario_year")),
            literal(0),
            operation(
                "subtract",
                choose(
                    compare(datePart("day"), "eq", literal(1)),
                    literal(13),
                    literal(12),
                ),
                datePart("month"),
            ),
        ),
    );
    const deltaColors: ColumnDefinition["colors"] = [
        {
            when: compare(column("scenario_monthly_delta"), "gt", literal(0)),
            tone: "success",
            label: "Mehrertrag",
        },
        {
            when: compare(column("scenario_monthly_delta"), "lt", literal(0)),
            tone: "warning",
            label: "Minderung",
        },
    ];
    return [
        {
            ...base,
            field: "scenario_enabled",
            label: "Anpassung aktiv",
            kind: "boolean",
            input: { kind: "boolean", initial: true, nullable: false },
            size: 152,
        },
        {
            ...base,
            field: "scenario_adjustment_percent",
            label: "Mietanpassung · %",
            kind: "percent",
            input: {
                kind: "percent",
                initial: 5,
                min: -100,
                max: 100,
                step: 0.1,
                nullable: false,
            },
            size: 168,
        },
        {
            ...base,
            field: "scenario_effective_from",
            label: "Anpassung ab",
            kind: "date",
            input: { kind: "date", initial: `${year}-01-01`, nullable: false },
            size: 184,
        },
        {
            ...base,
            field: "scenario_year",
            label: "Vorschaujahr",
            kind: "number",
            input: {
                kind: "number",
                initial: year,
                min: 2000,
                max: 2199,
                step: 1,
                integer: true,
                nullable: false,
            },
            size: 144,
        },
        {
            ...base,
            field: "scenario_rounding",
            label: "Rundung",
            input: {
                kind: "choice",
                initial: 2,
                nullable: false,
                options: [
                    { value: 2, label: "Cent" },
                    { value: 0, label: "Volle Euro" },
                ],
            },
            defaultVisible: false,
            size: 160,
        },
        {
            ...base,
            field: "scenario_new_rent",
            label: "Grundmiete · Vorschau",
            kind: "currency",
            size: 208,
            aggregate: "sum",
            computed: choose(
                enabled,
                operation(
                    "round",
                    operation(
                        "multiply",
                        field("base_rent"),
                        operation(
                            "add",
                            literal(1),
                            operation(
                                "divide",
                                column("scenario_adjustment_percent"),
                                literal(100),
                            ),
                        ),
                    ),
                    column("scenario_rounding"),
                ),
                field("base_rent"),
            ),
            cell: {
                type: "comparison",
                target: field("base_rent"),
                targetLabel: "Bestand",
                valueLabel: "Vorschau",
            },
        },
        {
            ...base,
            field: "scenario_monthly_delta",
            label: "Mehrertrag · Monat",
            kind: "currency",
            size: 184,
            aggregate: "sum",
            defaultVisible: false,
            computed: operation(
                "round",
                operation(
                    "subtract",
                    column("scenario_new_rent"),
                    field("base_rent"),
                ),
                literal(2),
            ),
            colors: deltaColors,
        },
        {
            ...base,
            field: "scenario_full_months",
            label: "Volle Monate im Vorschaujahr",
            kind: "number",
            size: 208,
            defaultVisible: false,
            computed: fullMonths,
        },
        {
            ...base,
            field: "scenario_year_delta",
            label: "Mehrertrag · Vorschaujahr",
            kind: "currency",
            size: 224,
            aggregate: "sum",
            computed: operation(
                "round",
                operation(
                    "multiply",
                    column("scenario_monthly_delta"),
                    column("scenario_full_months"),
                ),
                literal(2),
            ),
            colors: deltaColors,
        },
        {
            ...base,
            field: "scenario_valuation",
            label: "Bewertungsbasis · Vorschau",
            kind: "currency",
            size: 216,
            defaultVisible: false,
            input: { kind: "currency", min: 0, nullable: true },
        },
        {
            ...base,
            field: "scenario_gross_yield",
            label: "Bruttorendite · Vorschau",
            kind: "percent",
            size: 200,
            defaultVisible: false,
            computed: choose(
                compare(column("scenario_valuation"), "gt", literal(0)),
                operation(
                    "round",
                    operation(
                        "multiply",
                        operation(
                            "divide",
                            operation(
                                "add",
                                operation(
                                    "multiply",
                                    field("base_rent"),
                                    literal(12),
                                ),
                                column("scenario_year_delta"),
                            ),
                            column("scenario_valuation"),
                        ),
                        literal(100),
                    ),
                    literal(2),
                ),
                literal(null),
            ),
        },
    ];
}

export const rentScenarioColumns = buildRentScenarioColumns();
