import type {
    CellColorRule,
    CellCondition,
    CellDraftValues,
    CellScalar,
    ColumnDefinition,
    ColumnExpression,
    RecordData,
} from "../types";

const FORBIDDEN_PATHS = new Set(["__proto__", "prototype", "constructor"]);

export function cellNumber(value: unknown): number | null {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (
        typeof value !== "string" ||
        !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())
    )
        return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function scalar(value: unknown): CellScalar {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    return typeof value === "string" || typeof value === "boolean"
        ? value
        : null;
}

function calendarParts(
    value: unknown,
): { year: number; month: number; day: number; iso: string } | null {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value))
        return null;
    const iso = value.slice(0, 10);
    const [year, month, day] = iso.split("-").map(Number);
    const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
    const calendar = new Date(`${iso}T00:00:00Z`);
    if (
        !Number.isFinite(date.getTime()) ||
        calendar.getUTCFullYear() !== year ||
        calendar.getUTCMonth() + 1 !== month ||
        calendar.getUTCDate() !== day
    )
        return null;
    return { year, month, day, iso };
}

function declaredInput(value: unknown, column: ColumnDefinition): CellScalar {
    const input = column.input!;
    if (value == null || value === "") return null;
    if (["number", "percent", "currency"].includes(input.kind)) {
        const number = cellNumber(value);
        return number === null ||
            (input.integer && !Number.isInteger(number)) ||
            (input.min !== undefined && number < input.min) ||
            (input.max !== undefined && number > input.max)
            ? null
            : number;
    }
    if (input.kind === "date") {
        const date = calendarParts(value);
        return !date ||
            (input.minDate && date.iso < input.minDate) ||
            (input.maxDate && date.iso > input.maxDate)
            ? null
            : date.iso;
    }
    if (input.kind === "boolean")
        return typeof value === "boolean" ? value : null;
    if (input.kind === "choice")
        return (
            (input.options ?? column.options)?.find(
                (option) => option.value === value,
            )?.value ?? null
        );
    return typeof value === "string" || typeof value === "number"
        ? String(value)
        : null;
}

function readField(row: RecordData, field: string): unknown {
    if (typeof field !== "string") return undefined;
    const parts = field.split(".");
    if (parts.some((part) => !part || FORBIDDEN_PATHS.has(part)))
        return undefined;
    if (Object.hasOwn(row, field)) return row[field];
    return parts.reduce<unknown>(
        (value, part) =>
            value && typeof value === "object" && Object.hasOwn(value, part)
                ? (value as Record<string, unknown>)[part]
                : undefined,
        row,
    );
}

interface Evaluation {
    row: RecordData;
    columns: Map<string, ColumnDefinition>;
    draft: CellDraftValues;
    visiting: Set<string>;
    steps: number;
}

function context(
    row: RecordData,
    columns: readonly ColumnDefinition[],
    draft: CellDraftValues,
): Evaluation {
    return {
        row,
        columns: new Map(columns.map((column) => [column.field, column])),
        draft,
        visiting: new Set(),
        steps: 0,
    };
}

function bounded(state: Evaluation, depth: number): boolean {
    state.steps += 1;
    return depth <= 32 && state.steps <= 512;
}

function columnValue(
    column: ColumnDefinition,
    state: Evaluation,
    depth: number,
): unknown {
    if (!bounded(state, depth) || state.visiting.has(column.field)) return null;
    state.visiting.add(column.field);
    try {
        if (column.computed)
            return expressionValue(column.computed, state, depth + 1);
        const value = readField(state.row, column.field);
        return column.input
            ? declaredInput(
                  Object.hasOwn(state.draft, column.field)
                      ? state.draft[column.field]
                      : (value ?? column.input.initial ?? null),
                  column,
              )
            : value;
    } finally {
        state.visiting.delete(column.field);
    }
}

function expressionValue(
    expression: ColumnExpression,
    state: Evaluation,
    depth: number,
): CellScalar {
    if (!expression || !bounded(state, depth)) return null;
    switch (expression.type) {
        case "literal":
            return scalar(expression.value);
        case "field":
            return scalar(readField(state.row, expression.field));
        case "column": {
            const column = state.columns.get(expression.field);
            return column
                ? scalar(columnValue(column, state, depth + 1))
                : null;
        }
        case "if": {
            const condition = conditionValue(
                expression.condition,
                state,
                depth + 1,
            );
            return condition === null
                ? null
                : expressionValue(
                      condition ? expression.then : expression.otherwise,
                      state,
                      depth + 1,
                  );
        }
        case "date-part": {
            const value = expressionValue(expression.value, state, depth + 1);
            const parts = calendarParts(value);
            return parts && ["year", "month", "day"].includes(expression.part)
                ? parts[expression.part]
                : null;
        }
        case "operation": {
            if (
                !Array.isArray(expression.values) ||
                expression.values.length === 0 ||
                expression.values.length > 64
            )
                return null;
            if (expression.operator === "coalesce") {
                for (const part of expression.values) {
                    const value = expressionValue(part, state, depth + 1);
                    if (value !== null) return value;
                }
                return null;
            }
            const values = expression.values.map((part) =>
                cellNumber(expressionValue(part, state, depth + 1)),
            );
            if (values.some((value) => value === null)) return null;
            const numbers = values as number[];
            let result: number;
            switch (expression.operator) {
                case "add":
                    result = numbers.reduce((sum, value) => sum + value, 0);
                    break;
                case "multiply":
                    result = numbers.reduce(
                        (product, value) => product * value,
                        1,
                    );
                    break;
                case "subtract":
                    if (numbers.length !== 2) return null;
                    result = numbers[0] - numbers[1];
                    break;
                case "divide":
                    if (numbers.length !== 2 || numbers[1] === 0) return null;
                    result = numbers[0] / numbers[1];
                    break;
                case "min":
                    result = Math.min(...numbers);
                    break;
                case "max":
                    result = Math.max(...numbers);
                    break;
                case "round": {
                    const places = numbers[1] ?? 0;
                    if (
                        numbers.length > 2 ||
                        !Number.isInteger(places) ||
                        places < 0 ||
                        places > 8
                    )
                        return null;
                    const scale = 10 ** places;
                    result =
                        Math.round((numbers[0] + Number.EPSILON) * scale) /
                        scale;
                    break;
                }
                default:
                    return null;
            }
            return Number.isFinite(result) ? result : null;
        }
        default:
            return null;
    }
}

function conditionValue(
    condition: CellCondition,
    state: Evaluation,
    depth: number,
): boolean | null {
    if (!condition || !bounded(state, depth)) return null;
    if (condition.type === "not") {
        const value = conditionValue(condition.condition, state, depth + 1);
        return value === null ? null : !value;
    }
    if (condition.type === "all" || condition.type === "any") {
        if (
            !Array.isArray(condition.conditions) ||
            !condition.conditions.length ||
            condition.conditions.length > 64
        )
            return null;
        const values = condition.conditions.map((part) =>
            conditionValue(part, state, depth + 1),
        );
        if (condition.type === "all" && values.includes(false)) return false;
        if (condition.type === "any" && values.includes(true)) return true;
        if (values.includes(null)) return null;
        return condition.type === "all";
    }
    if (condition.type !== "compare") return null;
    const left = expressionValue(condition.left, state, depth + 1);
    const right = expressionValue(condition.right, state, depth + 1);
    if (left === null || right === null) return null;
    if (condition.operator === "eq") return left === right;
    if (condition.operator === "ne") return left !== right;
    const leftNumber = cellNumber(left),
        rightNumber = cellNumber(right);
    if (leftNumber === null || rightNumber === null) return null;
    switch (condition.operator) {
        case "gt":
            return leftNumber > rightNumber;
        case "gte":
            return leftNumber >= rightNumber;
        case "lt":
            return leftNumber < rightNumber;
        case "lte":
            return leftNumber <= rightNumber;
        default:
            return null;
    }
}

/** Stored fields remain immutable; only explicitly declared inputs read the separate draft. */
export function evaluateColumn(
    row: RecordData,
    column: ColumnDefinition,
    columns: readonly ColumnDefinition[] = [],
    draft: CellDraftValues = {},
): unknown {
    const state = context(row, columns, draft);
    state.columns.set(column.field, column);
    return columnValue(column, state, 0);
}

export function evaluateExpression(
    expression: ColumnExpression,
    row: RecordData,
    columns: readonly ColumnDefinition[] = [],
    draft: CellDraftValues = {},
): CellScalar {
    return expressionValue(expression, context(row, columns, draft), 0);
}

export function matchesCellCondition(
    condition: CellCondition,
    row: RecordData,
    columns: readonly ColumnDefinition[] = [],
    draft: CellDraftValues = {},
): boolean {
    return conditionValue(condition, context(row, columns, draft), 0) === true;
}

export function resolveCellColor(
    column: ColumnDefinition,
    row: RecordData,
    columns: readonly ColumnDefinition[] = [],
    draft: CellDraftValues = {},
): CellColorRule | undefined {
    const available = [
        ...columns.filter((entry) => entry.field !== column.field),
        column,
    ];
    return column.colors?.find((rule) =>
        matchesCellCondition(rule.when, row, available, draft),
    );
}
