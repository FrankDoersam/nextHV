import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Building } from "lucide-react";
import { ResourceSchemaProvider } from "./resource-schema-provider";
import type { ResourceSchema } from "./resource-schema";
import type { ResourceDefinition } from "../types";
import { ApiError, request } from "./http";
vi.mock("./http", async (original) => ({
    ...(await original<typeof import("./http")>()),
    request: vi.fn(),
}));
const metadata: ResourceSchema = {
    fields: [
        {
            name: "status",
            type: "enum",
            nullable: false,
            select: true,
            sort: true,
            create: true,
            update: true,
            filter: { operators: ["=", "!=", "in", "not in"] },
            rules: { all: [], create: [], update: [] },
        },
    ],
    meta: {
        ui: {
            version: 1,
            fields: {
                status: {
                    options: [{ value: "ready", label: "Nutzbar" }],
                    offeredOptions: [{ value: "ready", label: "Nutzbar" }],
                    default: "ready",
                },
            },
            relations: {},
            labels: { ready: "Nutzbar" },
        },
    },
};
const mounted = vi.fn();
function mount() {
    const resource: ResourceDefinition = {
        name: "units",
        label: "Einheiten",
        singular: "Einheit",
        description: "",
        icon: Building,
        titleField: "status",
        fields: [{ name: "status", label: "Zustand", kind: "select" }],
        columns: [{ field: "status", label: "Zustand" }],
        actions: [],
    };
    function Form() {
        mounted();
        return (
            <select
                aria-label="Zustand"
                defaultValue={String(resource.fields[0].default)}
            >
                {resource.fields[0].options?.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        );
    }
    render(
        <QueryClientProvider
            client={
                new QueryClient({
                    defaultOptions: { queries: { retry: false } },
                })
            }
        >
            <ResourceSchemaProvider resources={[resource]} userId={7}>
                <Form />
            </ResourceSchemaProvider>
        </QueryClientProvider>,
    );
}
beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
});
afterEach(cleanup);
it("mounts forms only after native metadata hydrates the registered resource", async () => {
    let resolve!: (value: { data: ResourceSchema }) => void;
    vi.mocked(request).mockReturnValue(
        new Promise((done) => {
            resolve = done;
        }),
    );
    mount();
    expect(screen.getByRole("status")).toBeVisible();
    expect(mounted).not.toHaveBeenCalled();
    await act(async () => {
        resolve({ data: metadata });
    });
    expect(
        await screen.findByRole("combobox", { name: "Zustand" }),
    ).toHaveValue("ready");
    expect(screen.getByRole("option", { name: "Nutzbar" })).toBeVisible();
    expect(request).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/units?with="),
        undefined,
        "GET",
        expect.any(AbortSignal),
    );
});
it("keeps forms closed on metadata failure and supports an explicit retry", async () => {
    vi.mocked(request)
        .mockRejectedValueOnce(
            new ApiError(503, "Beschreibung nicht erreichbar"),
        )
        .mockResolvedValue({ data: metadata });
    mount();
    expect(
        await screen.findByText("Beschreibung nicht erreichbar"),
    ).toBeVisible();
    expect(mounted).not.toHaveBeenCalled();
    await userEvent.click(
        screen.getByRole("button", { name: "Erneut versuchen" }),
    );
    expect(
        await screen.findByRole("combobox", { name: "Zustand" }),
    ).toHaveValue("ready");
});
