import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
    act,
    cleanup,
    render,
    renderHook,
    screen,
    waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import {
    useCollectionSummary,
    useResource,
    useResourceList,
    useSaveRecord,
} from "./data/hooks";
import { dataProvider } from "./data/provider";
import { ApiError } from "./data/http";
import {
    EditableKeyValueList,
    BooleanPropertyList,
} from "./forms/editable-key-value-list";
import type { ResourceDefinition } from "./types";
const resource: ResourceDefinition = {
    name: "properties",
    label: "Objekte",
    singular: "Objekt",
    description: "",
    icon: Building2,
    titleField: "name",
    actions: [],
    columns: [],
    fields: [
        { name: "name", label: "Bezeichnung", required: true, minLength: 3 },
        { name: "notes", label: "Notizen", kind: "textarea" },
        { name: "has_balcony", label: "Balkon", kind: "checkbox" },
    ],
};
const old = {
    id: 1,
    name: "Alt",
    updated_at: "2026-11-13T10:00:00Z",
    notes: "Vorher",
    has_balcony: false,
};
const other = { id: 2, name: "Andere Zeile", updated_at: old.updated_at };
function setup() {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    const key = ["resources", "properties", "list", {}];
    client.setQueryData(key, { data: [old, other], total: 2 });
    client.setQueryData(["resources", "properties", "detail", 1], old);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return { client, key, wrapper };
}
beforeEach(() => {
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    );
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: vi.fn(() => ({
            matches: false,
            addEventListener() {},
            removeEventListener() {},
        })),
    });
    Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
describe("standard record mutations", () => {
    it("updates only the affected cached row and detail without refetching an active table", async () => {
        const { client, key, wrapper } = setup();
        const stableOther = client.getQueryData<{ data: unknown[] }>(key)!
            .data[1];
        const list = vi.spyOn(dataProvider, "list");
        const saved = {
            ...old,
            name: "Neu",
            updated_at: "2026-11-13T11:00:00Z",
            full_address: "Parkstraße 5, Berlin",
        };
        vi.spyOn(dataProvider, "save").mockResolvedValue(saved);
        const { result } = renderHook(
            () => {
                useResourceList(resource);
                return useSaveRecord(resource);
            },
            { wrapper },
        );

        await act(async () => {
            await result.current({ name: "Neu" }, old);
        });

        expect(client.getQueryData<{ data: unknown[] }>(key)!.data[0]).toEqual(
            saved,
        );
        expect(client.getQueryData<{ data: unknown[] }>(key)!.data[1]).toBe(
            stableOther,
        );
        expect(
            client.getQueryData(["resources", "properties", "detail", 1]),
        ).toEqual(saved);
        expect(list).not.toHaveBeenCalled();
    });
    it("refreshes filtered rollups on save while the table keeps its other rows and makes no list request", async () => {
        const { client, key, wrapper } = setup();
        const definition = {
            ...resource,
            summary: {
                metric: "summary",
                items: [{ key: "total", label: "Objekte" }],
            },
        };
        const metricKey = [
            "resources",
            "properties",
            "metric",
            "summary",
            { query: "Linden", filters: [] },
        ];
        client.setQueryData(metricKey, { data: { total: 2 } });
        const summary = vi
            .spyOn(dataProvider, "summary")
            .mockResolvedValue({ data: { total: 1 } });
        const list = vi.spyOn(dataProvider, "list");
        vi.spyOn(dataProvider, "save").mockResolvedValue({
            ...old,
            name: "Neu",
        });
        const { result } = renderHook(
            () => {
                useResourceList(definition);
                useCollectionSummary(definition, {
                    query: "Linden",
                    filters: [],
                });
                return useSaveRecord(definition);
            },
            { wrapper },
        );
        await act(async () => {
            await result.current({ name: "Neu" }, old);
        });
        expect(summary).toHaveBeenCalledExactlyOnceWith(
            definition,
            "summary",
            { query: "Linden", filters: [] },
            expect.any(AbortSignal),
        );
        expect(client.getQueryData(metricKey)).toEqual({ data: { total: 1 } });
        expect(client.getQueryData<{ data: unknown[] }>(key)!.data[1]).toEqual(
            other,
        );
        expect(list).not.toHaveBeenCalled();
    });
    it("refreshes only a cached foreign-key parent after a child save", async () => {
        const { client, wrapper } = setup();
        const contract = {
            id: 7,
            updated_at: old.updated_at,
            conditions_count: 1,
        };
        const parentKey = ["resources", "contracts", "detail", 7];
        client.setQueryData(parentKey, contract);
        const conditionResource = {
            ...resource,
            name: "rent-conditions",
            fields: [
                {
                    name: "contract_id",
                    label: "Vertrag",
                    kind: "relation" as const,
                    resource: "contracts",
                },
            ],
        };
        const saved = { id: 9, updated_at: old.updated_at, contract_id: 7 };
        vi.spyOn(dataProvider, "save").mockResolvedValue(saved);
        const one = vi
            .spyOn(dataProvider, "one")
            .mockResolvedValue({ ...contract, conditions_count: 2 });
        const list = vi.spyOn(dataProvider, "list");
        const { result } = renderHook(() => useSaveRecord(conditionResource), {
            wrapper,
        });

        await act(async () => {
            await result.current({ contract_id: 7 });
        });

        expect(one).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ name: "contracts" }),
            7,
        );
        expect(client.getQueryData(parentKey)).toMatchObject({
            conditions_count: 2,
        });
        expect(list).not.toHaveBeenCalled();
    });
    it("does not report a successful child mutation as failed when its optional parent refresh fails", async () => {
        const { client, wrapper } = setup();
        const parentKey = ["resources", "contracts", "detail", 7];
        client.setQueryData(parentKey, { id: 7, updated_at: old.updated_at });
        const child = {
            ...resource,
            name: "rent-conditions",
            fields: [
                {
                    name: "contract_id",
                    label: "Vertrag",
                    kind: "relation" as const,
                    resource: "contracts",
                },
            ],
        };
        const saved = { id: 9, updated_at: old.updated_at, contract_id: 7 };
        vi.spyOn(dataProvider, "save").mockResolvedValue(saved);
        vi.spyOn(dataProvider, "one").mockRejectedValue(new Error("Offline"));
        const { result } = renderHook(() => useSaveRecord(child), { wrapper });
        await expect(result.current({ contract_id: 7 })).resolves.toEqual(
            saved,
        );
        expect(client.getQueryState(parentKey)?.isInvalidated).toBe(true);
    });
    it("keeps the original row when the server rejects a stale version", async () => {
        const { client, key, wrapper } = setup();
        const before = client.getQueryData(key);
        vi.spyOn(dataProvider, "save").mockRejectedValue(
            new ApiError(409, "Zwischenzeitlich geändert"),
        );
        const { result } = renderHook(() => useSaveRecord(resource), {
            wrapper,
        });
        await expect(
            result.current({ notes: "Update" }, old),
        ).rejects.toMatchObject({ status: 409 });
        expect(client.getQueryData(key)).toBe(before);
    });
    it("validates an inline property and sends only that property with the original version", async () => {
        const { wrapper } = setup();
        const save = vi
            .spyOn(dataProvider, "save")
            .mockRejectedValueOnce(
                new ApiError(422, "Serverprüfung", {
                    "mutate.0.attributes.name": [
                        "Dieses Feld ist erforderlich.",
                    ],
                }),
            )
            .mockResolvedValue({ ...old, name: "Lindenhof" });
        const user = userEvent.setup();
        render(
            <EditableKeyValueList
                resource={resource}
                record={old}
                properties={[{ name: "name", editable: true }, "notes"]}
            />,
            { wrapper },
        );
        expect(
            screen.queryByRole("button", { name: "Notizen bearbeiten" }),
        ).not.toBeInTheDocument();
        await user.click(
            screen.getByRole("button", { name: "Bezeichnung bearbeiten" }),
        );
        await user.clear(screen.getByRole("textbox", { name: /Bezeichnung/ }));
        await user.click(screen.getByRole("button", { name: "Speichern" }));
        expect(
            (await screen.findAllByText("Dieses Feld ist erforderlich."))[0],
        ).toBeVisible();
        expect(save).toHaveBeenCalledWith(resource, { name: "" }, old);
        await user.type(
            screen.getByRole("textbox", { name: /Bezeichnung/ }),
            "Lindenhof",
        );
        await user.click(screen.getByRole("button", { name: "Speichern" }));
        await waitFor(() =>
            expect(save).toHaveBeenCalledWith(
                resource,
                { name: "Lindenhof" },
                old,
            ),
        );
    });
    it("keeps an inline edit open on a server validation error without changing the visible value", async () => {
        const { wrapper } = setup();
        vi.spyOn(dataProvider, "save").mockRejectedValue(
            new ApiError(422, "Fehler", {
                "mutate.0.attributes.name": ["Bereits vergeben"],
            }),
        );
        const user = userEvent.setup();
        render(
            <EditableKeyValueList
                resource={resource}
                record={old}
                properties={[{ name: "name", editable: true }]}
            />,
            { wrapper },
        );
        await user.click(
            screen.getByRole("button", { name: "Bezeichnung bearbeiten" }),
        );
        await user.click(screen.getByRole("button", { name: "Speichern" }));
        expect(
            (await screen.findAllByText("Bereits vergeben")).length,
        ).toBeGreaterThan(0);
        expect(
            screen.getByRole("form", { name: "Bezeichnung ändern" }),
        ).toBeVisible();
        await user.click(screen.getByRole("button", { name: "Abbrechen" }));
        expect(screen.getByText("Alt")).toBeVisible();
    });
    it("commits checkbox cards immediately and gets their checked state from the saved record", async () => {
        const { wrapper } = setup();
        const save = vi
            .spyOn(dataProvider, "save")
            .mockResolvedValue({ ...old, has_balcony: true });
        function Demo() {
            const record = useResource(resource, 1).data!;
            return (
                <BooleanPropertyList
                    resource={resource}
                    record={record}
                    names={["has_balcony"]}
                />
            );
        }
        const user = userEvent.setup();
        render(<Demo />, { wrapper });
        await user.click(screen.getByRole("checkbox", { name: "Balkon" }));
        await waitFor(() =>
            expect(
                screen.getByRole("checkbox", { name: "Balkon" }),
            ).toBeChecked(),
        );
        expect(save).toHaveBeenCalledWith(resource, { has_balcony: true }, old);
    });
});

it("patches infinite pages without replacing unrelated rows, pages or another provider", async () => {
    const { client, wrapper } = setup();
    const first = { data: [old], total: 2, current_page: 1, last_page: 2 };
    const second = { data: [other], total: 2, current_page: 2, last_page: 2 };
    const key = ["resources", "properties", "infinite", {}];
    const otherKey = [
        "providers",
        "external",
        "resources",
        "properties",
        "infinite",
        {},
    ];
    const data = { pages: [first, second], pageParams: [1, 2] };
    client.setQueryData(key, data);
    client.setQueryData(otherKey, data);
    const otherBefore = client.getQueryData(otherKey);
    const saved = { ...old, name: "Aktualisiert" };
    vi.spyOn(dataProvider, "save").mockResolvedValue(saved);
    const { result } = renderHook(() => useSaveRecord(resource), { wrapper });
    await act(async () => {
        await result.current({ name: saved.name }, old);
    });
    const patched = client.getQueryData<typeof data>(key)!;
    expect(patched.pages[0].data[0].name).toBe("Aktualisiert");
    expect(patched.pages[1]).toBe(second);
    expect(client.getQueryData(otherKey)).toBe(otherBefore);
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
});

it("cancels a detail lookup when its observer unmounts", async () => {
    const { wrapper } = setup();
    let signal: AbortSignal | undefined;
    vi.spyOn(dataProvider, "one").mockImplementation(
        (_resource, _id, abort) => {
            signal = abort;
            return new Promise(() => {});
        },
    );
    const { unmount } = renderHook(() => useResource(resource, 99), {
        wrapper,
    });
    await waitFor(() => expect(signal).toBeDefined());
    unmount();
    expect(signal!.aborted).toBe(true);
});

it("separates list response projections when the same resource gains relation includes", async () => {
    const { client, wrapper } = setup();
    client.clear();
    const list = vi
        .spyOn(dataProvider, "list")
        .mockImplementation(async (_resource, params) => ({
            data: [
                {
                    ...old,
                    ...(params?.includes?.length
                        ? { units: [{ id: 44 }] }
                        : {}),
                },
            ],
            total: 1,
            current_page: 1,
            last_page: 1,
        }));
    const { result, rerender } = renderHook(
        ({ related }) =>
            useResourceList({
                ...resource,
                includes: related ? [{ relation: "units" }] : undefined,
            }),
        { wrapper, initialProps: { related: false } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ related: true });
    await waitFor(() =>
        expect(result.current.data?.data[0].units).toEqual([{ id: 44 }]),
    );
    expect(list).toHaveBeenCalledTimes(2);
});
