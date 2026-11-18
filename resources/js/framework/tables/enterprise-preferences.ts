import type {
    ColumnPinningState,
    ColumnVisibilityState,
    SortingState,
} from "@tanstack/react-table";
import { DEFAULT_FILTER_OPERATOR_LABELS } from "@/components/reui/filters/filters-operators";
import type { FilterQuery } from "@/components/reui/filters/filters-types";

export interface EnterpriseViewState {
    search: string;
    query: FilterQuery;
    sorting: SortingState;
    groupBy: string;
    visibility: ColumnVisibilityState;
    density: "comfortable" | "compact";
    columnOrder: string[];
    pinning: ColumnPinningState;
}

export interface SavedEnterpriseView {
    id: string;
    label: string;
    state: EnterpriseViewState;
}

const MAX_VIEWS = 12;
const MAX_COLUMNS = 100;
const MAX_QUERY_NODES = 100;
const MAX_QUERY_DEPTH = 6;
const MAX_STORAGE_LENGTH = 200_000;
const operators = new Set(["", ...Object.keys(DEFAULT_FILTER_OPERATOR_LABELS)]);
const reservedKeys = new Set(["__proto__", "prototype", "constructor"]);

function isRecord(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
    return Object.keys(value).every((key) => keys.includes(key));
}

function isText(value: unknown, maxLength: number): value is string {
    return typeof value === "string" && value.length <= maxLength;
}

function isId(value: unknown): value is string {
    return (
        isText(value, 200) &&
        value.trim().length > 0 &&
        !reservedKeys.has(value)
    );
}

function isIdList(value: unknown, maximum = MAX_COLUMNS): value is string[] {
    return (
        Array.isArray(value) &&
        value.length <= maximum &&
        value.every(isId) &&
        new Set(value).size === value.length
    );
}

function isPrimitive(value: unknown): boolean {
    return (
        value === null ||
        value === undefined ||
        typeof value === "boolean" ||
        (typeof value === "number" && Number.isFinite(value)) ||
        isText(value, 1_000)
    );
}

function isQuery(value: unknown): value is FilterQuery {
    const ids = new Set<string>();
    let count = 0;

    function visit(node: unknown, depth: number): boolean {
        count += 1;
        if (
            count > MAX_QUERY_NODES ||
            depth > MAX_QUERY_DEPTH ||
            !isRecord(node) ||
            !isId(node.id) ||
            ids.has(node.id)
        ) {
            return false;
        }
        ids.add(node.id);

        if (node.type === "group") {
            return (
                hasOnlyKeys(node, ["id", "type", "combinator", "rules"]) &&
                (node.combinator === "and" || node.combinator === "or") &&
                Array.isArray(node.rules) &&
                node.rules.length <= MAX_QUERY_NODES &&
                node.rules.every((child) => visit(child, depth + 1))
            );
        }

        return (
            node.type === "rule" &&
            hasOnlyKeys(node, [
                "id",
                "type",
                "path",
                "operator",
                "value",
                "negated",
            ]) &&
            Array.isArray(node.path) &&
            node.path.length > 0 &&
            node.path.length <= 10 &&
            node.path.every(isId) &&
            typeof node.operator === "string" &&
            operators.has(node.operator) &&
            (node.negated === undefined || typeof node.negated === "boolean") &&
            (Array.isArray(node.value)
                ? node.value.length <= 100 && node.value.every(isPrimitive)
                : isPrimitive(node.value))
        );
    }

    return isRecord(value) && value.type === "group" && visit(value, 0);
}

function isState(value: unknown): value is EnterpriseViewState {
    if (
        !isRecord(value) ||
        !hasOnlyKeys(value, [
            "search",
            "query",
            "sorting",
            "groupBy",
            "visibility",
            "density",
            "columnOrder",
            "pinning",
        ]) ||
        !isText(value.search, 1_000) ||
        !isQuery(value.query) ||
        !isText(value.groupBy, 200) ||
        (value.density !== "comfortable" && value.density !== "compact") ||
        !isIdList(value.columnOrder) ||
        !Array.isArray(value.sorting) ||
        value.sorting.length > MAX_COLUMNS ||
        !value.sorting.every(
            (sort) =>
                isRecord(sort) &&
                hasOnlyKeys(sort, ["id", "desc"]) &&
                isId(sort.id) &&
                typeof sort.desc === "boolean",
        ) ||
        new Set(value.sorting.map((sort) => sort.id)).size !==
            value.sorting.length ||
        !isRecord(value.visibility) ||
        Object.keys(value.visibility).length > MAX_COLUMNS ||
        !Object.entries(value.visibility).every(
            ([id, visible]) => isId(id) && typeof visible === "boolean",
        ) ||
        !isRecord(value.pinning) ||
        !hasOnlyKeys(value.pinning, ["start", "end"]) ||
        !isIdList(value.pinning.start) ||
        !isIdList(value.pinning.end)
    ) {
        return false;
    }

    const { start, end } = value.pinning;
    return !start.some((id) => end.includes(id));
}

function isViews(value: unknown): value is SavedEnterpriseView[] {
    return (
        Array.isArray(value) &&
        value.length <= MAX_VIEWS &&
        value.every(
            (view) =>
                isRecord(view) &&
                hasOnlyKeys(view, ["id", "label", "state"]) &&
                isId(view.id) &&
                isText(view.label, 80) &&
                view.label.trim().length > 0 &&
                isState(view.state),
        ) &&
        new Set(value.map((view) => view.id)).size === value.length
    );
}

function storageKey(moduleId: string): string | null {
    return /^[a-z0-9][a-z0-9._-]{0,127}$/i.test(moduleId)
        ? `nexthv.enterprise-demo.${moduleId}.views.v1`
        : null;
}

export function loadEnterpriseViews(moduleId: string): SavedEnterpriseView[] {
    try {
        const key = storageKey(moduleId);
        if (!key || typeof window === "undefined") return [];
        const stored = window.localStorage.getItem(key);
        if (!stored || stored.length > MAX_STORAGE_LENGTH) return [];
        const value: unknown = JSON.parse(stored);
        return isViews(value) ? value : [];
    } catch {
        return [];
    }
}

export function saveEnterpriseViews(
    moduleId: string,
    views: SavedEnterpriseView[],
): boolean {
    try {
        const key = storageKey(moduleId);
        if (!key || typeof window === "undefined" || !isViews(views))
            return false;
        const stored = JSON.stringify(views);
        if (stored.length > MAX_STORAGE_LENGTH) return false;
        window.localStorage.setItem(key, stored);
        return true;
    } catch {
        return false;
    }
}
