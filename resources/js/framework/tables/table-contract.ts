import type { SortingState } from "@tanstack/react-table";
import type { Filter } from "../types";
import type { GridFilters } from "./filter-rules";

export type PaginationMode = "server" | "client" | "off";
export interface TablePaginationOptions {
    mode: PaginationMode;
    currentPage?: number;
    pageSize?: number;
    /** Client/off never fetch beyond the native REST limit; oversized results fail explicitly. */
    maxRecords?: number;
}
export interface TableFilterPresets {
    initial?: GridFilters;
    permanent?: Filter[];
    defaultBehavior?: "merge" | "replace";
}
export type TableSort = { field: string; direction: "asc" | "desc" };
export interface TableSortPresets {
    initial?: SortingState;
    permanent?: TableSort[];
}
export interface TableQueryOptions {
    staleTime?: number;
    retry?: boolean | number;
    refetchOnWindowFocus?: boolean;
    enabled?: boolean;
}
export const SAFE_FULL_FETCH_LIMIT = 100;

export function tablePagination(
    pagination: boolean | TablePaginationOptions | undefined,
    compact: boolean,
): Required<TablePaginationOptions> {
    const options = typeof pagination === "object" ? pagination : undefined;
    const mode = options?.mode ?? (pagination === false ? "off" : "server");
    const requestedSize = options?.pageSize ?? (compact ? 10 : 25);
    const pageSize = [10, 25, 50, 100].includes(requestedSize) ? requestedSize : (compact ? 10 : 25);
    const currentPage = Number.isSafeInteger(options?.currentPage) && (options?.currentPage ?? 0) > 0
        ? Math.min(options!.currentPage!, 100001)
        : 1;
    // The API explicitly allows 10/25/50/100; unlimited fetching is never implied.
    const maxRecords = Math.max(10, Math.min(SAFE_FULL_FETCH_LIMIT, options?.maxRecords ?? SAFE_FULL_FETCH_LIMIT));
    return { mode, pageSize, currentPage, maxRecords };
}

export function mergeTableFilters(
    current: GridFilters,
    incoming: GridFilters,
    behavior: "merge" | "replace" = "merge",
): GridFilters {
    return behavior === "replace" ? { ...incoming } : { ...current, ...incoming };
}
