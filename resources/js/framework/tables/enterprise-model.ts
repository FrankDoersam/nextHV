import type { PaginationState, SortingState } from "@tanstack/react-table";
import type {
    FilterField,
    FilterNode,
    FilterQuery,
    FilterRule,
} from "@/components/reui/filters/filters-types";
import { resolveFilterOperators } from "@/components/reui/filters/filters-operators";
import type {
    EnterpriseColumn,
    EnterpriseGroup,
    EnterpriseModuleConfig,
    EnterpriseRecord,
} from "./enterprise-types";

export type EnterpriseDisplayRow<T> =
    | { kind: "record"; id: string; record: T }
    | { kind: "group"; id: string; label: string; rows: readonly T[] };

const collator = new Intl.Collator("de-DE", {
    numeric: true,
    sensitivity: "base",
});
const csvNumber = new Intl.NumberFormat("de-DE", {
    useGrouping: false,
    maximumFractionDigits: 20,
});
const normalize = (value: unknown) =>
    String(value ?? "")
        .normalize("NFKC")
        .toLocaleLowerCase("de-DE");
const isEmpty = (value: unknown) =>
    value == null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0);

function numericValue(value: unknown): number | undefined {
    if (typeof value === "number")
        return Number.isFinite(value) ? value : undefined;
    if (typeof value !== "string" || value.trim() === "") return undefined;
    const text = value.trim().replace(",", ".");
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return undefined;
    const number = Number(text);
    return Number.isFinite(number) ? number : undefined;
}

function dateValue(value: unknown): number | undefined {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        return undefined;
    const date = new Date(value + "T00:00:00Z");
    return Number.isFinite(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
        ? date.getTime()
        : undefined;
}

function scalarEquals(actual: unknown, expected: unknown): boolean {
    if (typeof actual === "boolean" || typeof expected === "boolean")
        return actual === expected;
    if (typeof actual === "number") return numericValue(expected) === actual;
    return normalize(actual) === normalize(expected);
}

/** Undefined means an invalid condition, which must stay invalid when negated. */
function matchOperator(
    actual: unknown,
    rule: FilterRule,
    field: FilterField,
): boolean | undefined {
    const operator = resolveFilterOperators(field).find(
        (entry) => entry.value === rule.operator,
    );
    if (!operator) return undefined;
    if (operator.arity !== "none" && isEmpty(rule.value)) return undefined;
    if (
        operator.arity === "many" &&
        (!Array.isArray(rule.value) || !rule.value.length)
    )
        return undefined;
    if (
        operator.arity === "range" &&
        (!Array.isArray(rule.value) || rule.value.length !== 2)
    )
        return undefined;

    const expected = rule.value;
    if (rule.operator === "empty") return isEmpty(actual);
    if (rule.operator === "not_empty") return !isEmpty(actual);
    if (actual == null) return undefined;

    switch (rule.operator) {
        case "contains":
            return normalize(actual).includes(normalize(expected));
        case "not_contains":
            return !normalize(actual).includes(normalize(expected));
        case "starts_with":
            return normalize(actual).startsWith(normalize(expected));
        case "ends_with":
            return normalize(actual).endsWith(normalize(expected));
        case "is":
            return scalarEquals(actual, expected);
        case "is_not":
            return !scalarEquals(actual, expected);
        case "is_any_of":
            return (expected as unknown[]).some((value) =>
                scalarEquals(actual, value),
            );
        case "is_none_of":
            return !(expected as unknown[]).some((value) =>
                scalarEquals(actual, value),
            );
        case "has_any_of":
        case "has_all_of":
        case "has_none_of": {
            if (!Array.isArray(actual)) return undefined;
            const membership = (expected as unknown[]).map((value) =>
                actual.some((item) => scalarEquals(item, value)),
            );
            if (rule.operator === "has_all_of")
                return membership.every(Boolean);
            return rule.operator === "has_none_of"
                ? !membership.some(Boolean)
                : membership.some(Boolean);
        }
        case "eq":
        case "neq":
        case "gt":
        case "gte":
        case "lt":
        case "lte": {
            const left = numericValue(actual);
            const right = numericValue(expected);
            if (left === undefined || right === undefined) return undefined;
            if (rule.operator === "eq") return left === right;
            if (rule.operator === "neq") return left !== right;
            if (rule.operator === "gt") return left > right;
            if (rule.operator === "gte") return left >= right;
            if (rule.operator === "lt") return left < right;
            return left <= right;
        }
        case "between":
        case "not_between": {
            const left = numericValue(actual);
            const [minimum, maximum] = (expected as unknown[]).map(
                numericValue,
            );
            if (
                left === undefined ||
                minimum === undefined ||
                maximum === undefined ||
                minimum > maximum
            )
                return undefined;
            const within = left >= minimum && left <= maximum;
            return rule.operator === "between" ? within : !within;
        }
        case "is_before":
        case "is_after":
        case "is_on_or_before":
        case "is_on_or_after": {
            const left = dateValue(actual);
            const right = dateValue(expected);
            if (left === undefined || right === undefined) return undefined;
            if (rule.operator === "is_before") return left < right;
            if (rule.operator === "is_after") return left > right;
            if (rule.operator === "is_on_or_before") return left <= right;
            return left >= right;
        }
        default:
            return undefined;
    }
}

function matchesQuery<T extends EnterpriseRecord>(
    row: T,
    config: EnterpriseModuleConfig<T>,
    node: FilterNode,
    depth = 0,
): boolean | null {
    if (!node || depth > 16) return false;
    if (node.type === "group") {
        if (
            !Array.isArray(node.rules) ||
            !["and", "or"].includes(node.combinator)
        )
            return false;
        const conditions = node.rules
            .map((child) => matchesQuery(row, config, child, depth + 1))
            .filter((result): result is boolean => result !== null);
        if (conditions.length === 0) return null;
        return node.combinator === "or"
            ? conditions.some(Boolean)
            : conditions.every(Boolean);
    }
    if (
        node.type !== "rule" ||
        !Array.isArray(node.path) ||
        node.path.length === 0
    )
        return false;
    const rootField = config.filters.find((entry) => entry.id === node.path[0]);
    if (!rootField) return false;
    let field: FilterField = rootField;
    let actual: unknown = rootField.getValue(row);
    for (const segment of node.path.slice(1)) {
        const child = field.fields?.find((entry) => entry.id === segment);
        if (
            !child ||
            !actual ||
            typeof actual !== "object" ||
            !Object.hasOwn(actual, segment)
        )
            return false;
        field = child;
        actual = (actual as Record<string, unknown>)[segment];
    }
    // ReUI inserts the field chip before its operator/value are chosen. A
    // draft contributes no condition; treating it as true would widen an OR.
    if (node.operator === "") return null;
    const operator = resolveFilterOperators(field).find(
        (entry) => entry.value === node.operator,
    );
    if (!operator) return false;
    if (operator.arity !== "none" && node.value === undefined) return null;
    if (
        operator.arity === "range" &&
        Array.isArray(node.value) &&
        node.value.length === 2 &&
        node.value.some((value) => value === undefined)
    )
        return null;
    const match = matchOperator(actual, node, field);
    return match === undefined ? false : node.negated ? !match : match;
}

/** Filter once, then use these leaf rows for KPIs, group summaries and totals. */
export function selectEnterpriseRows<T extends EnterpriseRecord>(
    rows: readonly T[],
    config: EnterpriseModuleConfig<T>,
    state: { search: string; query: FilterQuery; sorting: SortingState },
): T[] {
    const searchTerms = normalize(state.search)
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    const result = rows.filter((row) => {
        const searchable = normalize(config.searchText(row));
        return (
            searchTerms.every((term) => searchable.includes(term)) &&
            matchesQuery(row, config, state.query) !== false
        );
    });
    const sortColumns = state.sorting.flatMap((sort) => {
        const column = config.columns.find(
            (candidate) => candidate.id === sort.id,
        );
        return column ? [{ column, descending: sort.desc }] : [];
    });
    return result.sort((left, right) => {
        for (const { column, descending } of sortColumns) {
            const a = column.value(left);
            const b = column.value(right);
            // Missing data stays last in both directions and never becomes zero.
            if (a == null && b == null) continue;
            if (a == null) return 1;
            if (b == null) return -1;
            const order =
                typeof a === "number" && typeof b === "number"
                    ? a - b
                    : collator.compare(String(a), String(b));
            if (order !== 0) return descending ? -order : order;
        }
        return 0;
    });
}

/** Whole-group paging keeps each subtotal attached to all of its detail rows. */
export function buildEnterprisePage<T extends EnterpriseRecord>(
    rows: readonly T[],
    group: EnterpriseGroup<T> | undefined,
    pagination: PaginationState,
    collapsed: ReadonlySet<string>,
): {
    displayRows: EnterpriseDisplayRow<T>[];
    recordCount: number;
    pageIndex: number;
    pageCount: number;
    groups: Array<{ id: string; label: string; rows: readonly T[] }>;
} {
    const grouped = new Map<string, T[]>();
    if (group) {
        for (const row of rows) {
            const label = group.value(row);
            const members = grouped.get(label) ?? [];
            members.push(row);
            grouped.set(label, members);
        }
    }
    const groups = [...grouped]
        .sort(([a], [b]) => collator.compare(a, b))
        .map(([label, members]) => ({
            id: `group:${group!.id}:${encodeURIComponent(label)}`,
            label,
            rows: members,
        }));
    const recordCount = group ? groups.length : rows.length;
    const pageSize = Number.isFinite(pagination.pageSize)
        ? Math.max(1, Math.floor(pagination.pageSize))
        : 10;
    const pageCount = Math.max(1, Math.ceil(recordCount / pageSize));
    const requestedPage = Number.isFinite(pagination.pageIndex)
        ? Math.floor(pagination.pageIndex)
        : 0;
    const pageIndex = Math.max(0, Math.min(requestedPage, pageCount - 1));
    const start = pageIndex * pageSize;
    const recordRow = (record: T): EnterpriseDisplayRow<T> => ({
        kind: "record",
        id: `record:${record.id}`,
        record,
    });
    const displayRows: EnterpriseDisplayRow<T>[] = group
        ? groups
              .slice(start, start + pageSize)
              .flatMap((entry) => [
                  { ...entry, kind: "group" as const },
                  ...(collapsed.has(entry.id) ? [] : entry.rows.map(recordRow)),
              ])
        : rows.slice(start, start + pageSize).map(recordRow);
    return { displayRows, recordCount, pageIndex, pageCount, groups };
}

/** Export domain values only; totals and synthetic group rows are never records. */
export function enterpriseCsv<T extends EnterpriseRecord>(
    rows: readonly T[],
    columns: EnterpriseColumn<T>[],
): string {
    const escape = (value: string | number | null | undefined) => {
        let text =
            typeof value === "number"
                ? Number.isFinite(value)
                    ? csvNumber.format(value)
                    : ""
                : String(value ?? "");
        if (
            typeof value !== "number" &&
            /^[\s\u0000-\u001f\u007f-\u009f]*[=+\-@]/u.test(text)
        )
            text = "'" + text;
        return `"${text.replaceAll('"', '""')}"`;
    };
    return (
        "\uFEFF" +
        [
            columns.map((column) => escape(column.label)).join(";"),
            ...rows.map((row) =>
                columns.map((column) => escape(column.value(row))).join(";"),
            ),
        ].join("\r\n")
    );
}
