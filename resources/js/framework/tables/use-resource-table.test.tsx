import "@testing-library/jest-dom/vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { Building2 } from "lucide-react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { dataProvider } from "../data/provider";
import {
    registerDataProvider,
    unregisterDataProvider,
} from "../data/provider-registry";
import { useInfiniteResourceList } from "../data/infinite";
import type { RecordData, ResourceDefinition } from "../types";
import { useResourceTable } from "./use-resource-table";

type UnitRow = RecordData & { name: string; status: string };
const rows: UnitRow[] = Array.from({ length: 27 }, (_, i) => ({
    id: i + 1,
    name: `Einheit ${i + 1}`,
    status: i % 2 ? "maintenance" : "ready",
    updated_at: "2026-11-14T12:00:00Z",
}));
const resource: ResourceDefinition = {
    name: "units",
    label: "Einheiten",
    singular: "Einheit",
    description: "",
    icon: Building2,
    titleField: "name",
    actions: [],
    fields: [
        { name: "name", label: "Name", kind: "text" },
        {
            name: "status",
            label: "Status",
            kind: "select",
            options: [
                { value: "ready", label: "Nutzbar" },
                { value: "maintenance", label: "Instandhaltung" },
            ],
        },
    ],
    columns: [
        { field: "name", label: "Name" },
        { field: "status", label: "Status" },
    ],
    groupBy: [{ value: "status", label: "Status" }],
};

let testClient: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
    return (
        <MemoryRouter>
            <QueryClientProvider client={testClient}>
                {children}
            </QueryClientProvider>
        </MemoryRouter>
    );
}

beforeEach(() => {
    testClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    vi.spyOn(dataProvider, "list").mockImplementation(
        async (_resource, params = {}) => {
            const limit = params.limit ?? 25;
            const page = params.page ?? 1;
            return {
                data: rows.slice((page - 1) * limit, page * limit),
                total: rows.length,
                current_page: page,
                last_page: Math.ceil(rows.length / limit),
            };
        },
    );
    vi.spyOn(dataProvider, "groups").mockResolvedValue({
        data: {
            field: "status",
            total: 27,
            groups: [
                { value: "ready", count: 14 },
                { value: "maintenance", count: 13 },
            ],
        },
    });
});
afterEach(() => {
    cleanup();
    unregisterDataProvider("secondary");
    vi.restoreAllMocks();
});

it("enforces permanent filters and sorts separately from editable initial presets", async () => {
    const { result } = renderHook(
        () =>
            useResourceTable<UnitRow>({
                resource,
                filters: {
                    initial: { status: { operator: "in", values: ["ready"] } },
                    permanent: [
                        { field: "name", operator: "like", value: "%Einheit%" },
                    ],
                },
                sorters: {
                    initial: [{ id: "name", desc: true }],
                    permanent: [{ field: "status", direction: "asc" }],
                },
                queryOptions: { retry: false },
            }),
        { wrapper },
    );

    await waitFor(() => expect(dataProvider.list).toHaveBeenCalled());
    expect(result.current.state.filters.status.values).toEqual(["ready"]);
    expect(result.current.apiFilters).toEqual([
        { field: "name", operator: "like", value: "%Einheit%" },
        { field: "status", operator: "in", value: ["ready"] },
    ]);
    expect(result.current.sort).toEqual([
        { field: "status", direction: "asc" },
        { field: "name", direction: "desc" },
    ]);

    act(() =>
        result.current.setFilters(
            {
                status: { operator: "in", values: ["maintenance"] },
            },
            "replace",
        ),
    );
    await waitFor(() =>
        expect(result.current.apiFilters).toEqual([
            { field: "name", operator: "like", value: "%Einheit%" },
            { field: "status", operator: "in", value: ["maintenance"] },
        ]),
    );
});

it("performs bounded local pagination without requesting an unbounded server list", async () => {
    const { result } = renderHook(
        () =>
            useResourceTable<UnitRow>({
                resource,
                pagination: {
                    mode: "client",
                    currentPage: 2,
                    pageSize: 10,
                    maxRecords: 30,
                },
                queryOptions: { retry: false },
            }),
        { wrapper },
    );
    await waitFor(() =>
        expect(result.current.result.data?.data).toHaveLength(10),
    );
    expect(result.current.result.data?.current_page).toBe(2);
    expect(result.current.result.data?.total).toBe(27);
    expect(dataProvider.list).toHaveBeenLastCalledWith(
        resource,
        expect.objectContaining({ page: 1, limit: 100 }),
        expect.any(AbortSignal),
    );
});

it("fails closed when off-mode exceeds its configured cap", async () => {
    vi.mocked(dataProvider.list).mockResolvedValue({
        data: rows,
        total: 101,
        current_page: 1,
        last_page: 2,
    });
    const { result } = renderHook(
        () =>
            useResourceTable({
                resource,
                pagination: { mode: "off", maxRecords: 100 },
                queryOptions: { retry: false },
            }),
        { wrapper },
    );
    await waitFor(() => expect(result.current.result.isError).toBe(true));
    expect(result.current.result.error?.message).toContain("höchstens 100");
    expect(result.current.paginationEnabled).toBe(false);
});

it("counts filtered groups through the server, not from the current page", async () => {
    const { result } = renderHook(
        () =>
            useResourceTable({
                resource,
                pagination: { mode: "server", pageSize: 10 },
                queryOptions: { retry: false },
            }),
        { wrapper },
    );
    act(() => result.current.update("group", "status"));
    await waitFor(() =>
        expect(result.current.groupResult.data?.total).toBe(27),
    );
    expect(dataProvider.groups).toHaveBeenCalledWith(
        resource,
        "status",
        expect.objectContaining({ filters: [] }),
        expect.any(AbortSignal),
    );
});

it("resolves cross-page bulk selection on the server, limited to 100 exact rows", async () => {
    const { result } = renderHook(
        () =>
            useResourceTable<UnitRow>({
                resource,
                queryOptions: { retry: false },
            }),
        { wrapper },
    );
    await waitFor(() => expect(result.current.result.data?.total).toBe(27));
    await act(async () => {
        const all = await result.current.selectAllFiltered();
        expect(all).toHaveLength(27);
    });
    expect(result.current.globalSelection).toHaveLength(27);
    expect(dataProvider.list).toHaveBeenCalledWith(
        resource,
        expect.objectContaining({ limit: 100, page: 1 }),
    );
});

it("rejects selecting 101 or more rows without issuing a second request", async () => {
    vi.mocked(dataProvider.list).mockResolvedValue({
        data: rows.slice(0, 25),
        total: 101,
        current_page: 1,
        last_page: 5,
    });
    const { result } = renderHook(
        () => useResourceTable({ resource, queryOptions: { retry: false } }),
        { wrapper },
    );
    await waitFor(() => expect(result.current.result.data?.total).toBe(101));
    await expect(result.current.selectAllFiltered()).rejects.toThrow(
        "Maximal 100",
    );
    expect(dataProvider.list).toHaveBeenCalledTimes(1);
});

it("isolates a named backend and exposes the same headless infinite-list contract", async () => {
    const secondaryList = vi.fn(
        async (
            _resource: ResourceDefinition,
            params: { page?: number } = {},
        ) => ({
            data: params.page === 2 ? rows.slice(10, 15) : rows.slice(0, 10),
            total: 15,
            current_page: params.page ?? 1,
            last_page: 2,
        }),
    );
    registerDataProvider("secondary", { ...dataProvider, list: secondaryList });
    const custom = { ...resource, dataProvider: "secondary" };
    const { result } = renderHook(
        () =>
            useInfiniteResourceList<UnitRow>(
                custom,
                { limit: 10 },
                { retry: false },
            ),
        { wrapper },
    );
    await waitFor(() => expect(result.current.records).toHaveLength(10));
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    await act(async () => {
        await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.records).toHaveLength(15));
    expect(result.current.total).toBe(15);
    expect(result.current.hasNextPage).toBe(false);
    expect(secondaryList).toHaveBeenCalledTimes(2);
    expect(dataProvider.list).not.toHaveBeenCalled();
});

it("does not retain rows from another mandatory relation scope while loading", async () => {
    const { result, rerender } = renderHook(
        ({ id }) =>
            useResourceTable({
                resource,
                fixedFilters: [{ field: "property_id", value: id }],
                syncWithLocation: false,
            }),
        { wrapper, initialProps: { id: 1 } },
    );
    await waitFor(() =>
        expect(result.current.result.data?.data).toHaveLength(25),
    );
    vi.mocked(dataProvider.list).mockImplementation(
        () => new Promise(() => {}),
    );
    rerender({ id: 2 });
    expect(result.current.result.data).toBeUndefined();
    expect(result.current.result.isPlaceholderData).toBe(false);
});

it("keeps the previous page visible during ordinary paging and aborts abandoned reads", async () => {
    let signal: AbortSignal | undefined;
    const { result, unmount } = renderHook(
        () => useResourceTable({ resource, syncWithLocation: false }),
        { wrapper },
    );
    await waitFor(() =>
        expect(result.current.result.data?.data).toHaveLength(25),
    );
    vi.mocked(dataProvider.list).mockImplementation(
        (_resource, _params, abort) => {
            signal = abort;
            return new Promise(() => {});
        },
    );
    act(() =>
        result.current.update("pagination", { pageIndex: 1, pageSize: 25 }),
    );
    await waitFor(() =>
        expect(result.current.result.isPlaceholderData).toBe(true),
    );
    expect(result.current.result.data?.data[0].id).toBe(1);
    unmount();
    expect(signal?.aborted).toBe(true);
});

it("does not issue a grouping request when query execution is disabled", async () => {
    const { result } = renderHook(
        () => useResourceTable({ resource, queryOptions: { enabled: false } }),
        { wrapper },
    );
    act(() => result.current.update("group", "status"));
    expect(dataProvider.list).not.toHaveBeenCalled();
    expect(dataProvider.groups).not.toHaveBeenCalled();
});
