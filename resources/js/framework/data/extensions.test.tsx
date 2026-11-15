import React from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { dataProvider } from "./provider";
import { useResourceMany } from "./many";
import { invalidateResource } from "./invalidate";
import { useResourceForm } from "../forms/use-resource-form";
import { ApiError } from "./http";
import type { ResourceDefinition } from "../types";
const resource: ResourceDefinition = {
    name: "properties",
    label: "Objekte",
    singular: "Objekt",
    description: "",
    icon: Building2,
    titleField: "name",
    columns: [],
    actions: [],
    fields: [
        { name: "name", label: "Name" },
        { name: "notes", label: "Notiz" },
        { name: "parent_id", label: "Bezug" },
    ],
};
function setup() {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return {
        client,
        wrapper: ({ children }: { children: React.ReactNode }) => (
            <QueryClientProvider client={client}>
                {children}
            </QueryClientProvider>
        ),
    };
}
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});
it("deduplicates batch queries while preserving each consumer's selection order", async () => {
    const { wrapper } = setup();
    const list = vi.spyOn(dataProvider, "list").mockResolvedValue({
        data: [
            { id: 1, updated_at: "v1" },
            { id: 2, updated_at: "v1" },
        ],
        total: 2,
        current_page: 1,
        last_page: 1,
    });
    const { result } = renderHook(
        () => [
            useResourceMany(resource, [2, 1, 2, 9]),
            useResourceMany(resource, [9, 1, 2]),
        ],
        { wrapper },
    );
    await waitFor(() => expect(result.current[0].isSuccess).toBe(true));
    expect(list).toHaveBeenCalledTimes(1);
    expect(result.current[0].records.map((r) => r.id)).toEqual([2, 1]);
    expect(result.current[1].records.map((r) => r.id)).toEqual([1, 2]);
    expect(result.current[0].missingIds).toEqual([9]);
});
it("splits large ID selections into bounded requests and never reads an empty selection", async () => {
    const { wrapper } = setup();
    const list = vi.spyOn(dataProvider, "list").mockResolvedValue({
        data: [],
        total: 0,
        current_page: 1,
        last_page: 1,
    });
    const { result, rerender } = renderHook(
        ({ ids }) => useResourceMany(resource, ids),
        { wrapper, initialProps: { ids: [] as number[] } },
    );
    expect(list).not.toHaveBeenCalled();
    rerender({ ids: Array.from({ length: 101 }, (_, i) => i + 1) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(list).toHaveBeenCalledTimes(2);
    expect(list.mock.calls[0][1]?.filters?.[0]).toMatchObject({
        value: expect.arrayContaining([1, 100]),
    });
    expect(list.mock.calls[1][1]?.filters?.[0]).toMatchObject({ value: [101] });
});
it("invalidates targeted detail and selection caches without touching other providers or editors", async () => {
    const { client } = setup();
    const keys = [
        ["resources", "properties", "detail", 1],
        ["resources", "properties", "detail", 2],
        ["resources", "properties", "many", { ids: [1, 3] }],
        ["providers", "external", "resources", "properties", "detail", 1],
        ["panel", "key", "properties", 1],
    ];
    keys.forEach((key) => client.setQueryData(key, {}));
    await invalidateResource(client, resource, {
        kinds: ["detail", "many"],
        ids: [1],
        refetchType: "none",
    });
    expect(keys.map((key) => client.getQueryState(key)?.isInvalidated)).toEqual(
        [true, false, true, false, false],
    );
});
it("runs a custom headless form with server errors, transforms and a locked parent reference", async () => {
    const { wrapper } = setup();
    const save = vi
        .spyOn(dataProvider, "save")
        .mockRejectedValueOnce(
            new ApiError(422, "Ungültig", {
                "mutate.0.attributes.name": ["Name fehlt."],
            }),
        )
        .mockResolvedValue({
            id: 4,
            updated_at: "v1",
            name: "NEU",
            parent_id: 7,
        });
    const onSaved = vi.fn();
    const { result } = renderHook(
        () =>
            useResourceForm({
                resource,
                context: { resource: "properties", field: "parent_id", id: 7 },
                transformValues: (values) => ({
                    ...values,
                    name: String(values.name).toUpperCase(),
                    parent_id: 99,
                }),
                onSaved,
            }),
        { wrapper },
    );
    result.current.form.register("name");
    await act(async () => {
        await result.current.save();
    });
    expect(result.current.form.getFieldState("name").error?.message).toBe(
        "Name fehlt.",
    );
    await act(async () => {
        result.current.form.setValue("name", "neu");
        await result.current.save();
    });
    expect(save.mock.lastCall?.[1]).toMatchObject({
        name: "NEU",
        parent_id: 7,
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
});
it("refreshes server values without erasing unsaved input and uses the fresh version", async () => {
    const { wrapper } = setup();
    const row = { id: 1, updated_at: "v1", name: "Alt", notes: "Alt" };
    vi.spyOn(dataProvider, "one").mockResolvedValue({
        ...row,
        updated_at: "v2",
        name: "Server",
        notes: "Server",
    });
    const { result } = renderHook(() => useResourceForm({ resource, row }), {
        wrapper,
    });
    act(() =>
        result.current.form.setValue("name", "Lokal", { shouldDirty: true }),
    );
    await act(async () => {
        await result.current.refresh();
    });
    expect(result.current.form.getValues()).toMatchObject({
        name: "Lokal",
        notes: "Server",
    });
    expect(result.current.version?.updated_at).toBe("v2");
});
