import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { flowPanel, advanceFlow, type FormFlowDefinition } from "./forms/flow";
import { readPanels, panelSearch } from "./navigation/panels";
import { contractFlow } from "@/modules/contracts/contract-flow";
import { flows } from "@/modules/flows";
import { resources } from "@/modules/registry";
import { WorkbenchProvider, useWorkbench } from "./workbench";
import { ApiError } from "./data/http";
import { dataProvider } from "./data/provider";
import type { ResourceDefinition, RecordData } from "./types";

Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
    })),
});
global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
};
Element.prototype.scrollIntoView = vi.fn();
Element.prototype.getAnimations = vi.fn(() => []);
const NativeRequest = globalThis.Request;
globalThis.Request = class extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(input, { ...init, signal: undefined });
    }
};
const version = "2026-01-01T00:00:00Z";
const fixture: ResourceDefinition = {
    name: "flow-parent",
    label: "Eltern",
    singular: "Elternteil",
    titleField: "name",
    description: "Testablauf",
    icon: Building2,
    fields: [{ name: "name", label: "Bezeichnung", required: true }],
    columns: [{ field: "name", label: "Name" }],
    actions: [],
};
const child: ResourceDefinition = {
    ...fixture,
    name: "flow-child",
    singular: "Folgeschritt",
    fields: [
        {
            name: "parent_id",
            label: "Bezug",
            kind: "relation",
            resource: fixture.name,
            required: true,
        },
        ...fixture.fields,
    ],
};
const definition: FormFlowDefinition = {
    id: "test-flow",
    label: "Testablauf",
    steps: [
        { id: "record", label: "Anlegen", resource: fixture.name },
        {
            id: "child",
            label: "Ergänzen",
            resource: child.name,
            binding: {
                field: "parent_id",
                resource: fixture.name,
                source: "record",
            },
        },
    ],
    completion: { navigateTo: "record" },
};
let originalResources: number;
let originalFlows: number;
beforeEach(() => {
    originalResources = resources.length;
    originalFlows = flows.length;
});
afterEach(() => {
    cleanup();
    resources.splice(originalResources);
    flows.splice(originalFlows);
    vi.restoreAllMocks();
});

describe("declarative form flows", () => {
    it("restores locked context from saved references and removes values from a deep link", () => {
        const first = flowPanel(
            contractFlow,
            {
                id: "new-contract",
                step: 0,
                records: {},
                parent: { resource: "units", id: 7 },
            },
            "f",
            "dialog",
        );
        expect(first.context).toEqual({
            resource: "units",
            id: 7,
            field: "unit_id",
            mode: "locked",
        });
        const second = advanceFlow(contractFlow, first.flow!, {
            id: 19,
            updated_at: version,
            notes: "not in URL",
        });
        const link = flowPanel(contractFlow, second, "f", "dialog");
        const raw = {
            ...link,
            values: { secret: "private" },
            flow: {
                ...link.flow!,
                secret: "private",
                records: {
                    contract: {
                        resource: "contracts",
                        id: 19,
                        notes: "private",
                    },
                },
            },
        };
        const restored = readPanels(panelSearch("?q=Berlin", [raw]));
        expect(restored[0].context).toEqual({
            resource: "contracts",
            id: 19,
            field: "contract_id",
            mode: "locked",
        });
        expect(JSON.stringify(restored)).not.toContain("private");
    });
    it("rejects skipped steps, wrong resource references and unknown flows", () => {
        expect(() =>
            flowPanel(
                contractFlow,
                { id: "new-contract", step: 2, records: {} },
                "f",
                "sheet",
            ),
        ).toThrow("vorheriger");
        expect(() =>
            flowPanel(
                contractFlow,
                {
                    id: "new-contract",
                    step: 1,
                    records: { contract: { resource: "units", id: 2 } },
                },
                "f",
                "sheet",
            ),
        ).toThrow("Bezug");
        expect(
            readPanels(
                panelSearch("", [
                    {
                        key: "f",
                        resource: "contracts",
                        mode: "create",
                        presentation: "sheet",
                        flow: { id: "missing", step: 0, records: {} },
                    },
                ]),
            ),
        ).toEqual([]);
    });
    it("validates, saves, goes back to edit and completes without creating duplicate parents", async () => {
        resources.push(fixture, child);
        flows.push(definition);
        const records = new Map<string, RecordData>();
        let nextId = 1;
        const save = vi
            .spyOn(dataProvider, "save")
            .mockImplementation(async (resource, values, row) => {
                const saved = {
                    ...values,
                    id: row?.id ?? nextId++,
                    updated_at: version,
                };
                records.set(resource.name + saved.id, saved);
                return saved;
            });
        vi.spyOn(dataProvider, "one").mockImplementation(async (resource, id) =>
            records.get(resource.name + id)!,
        );
        vi.spyOn(dataProvider, "list").mockImplementation(async (resource) => ({
            data: [...records.entries()]
                .filter(([key]) => key.startsWith(resource.name))
                .map(([, row]) => row),
            total: 1,
            current_page: 1,
            last_page: 1,
        }));
        function Start() {
            const w = useWorkbench();
            return (
                <button onClick={() => w.openFlow("test-flow")}>
                    Ablauf starten
                </button>
            );
        }
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        const router = createMemoryRouter(
            [
                {
                    path: "*",
                    element: (
                        <QueryClientProvider client={client}>
                            <WorkbenchProvider>
                                <Start />
                            </WorkbenchProvider>
                        </QueryClientProvider>
                    ),
                },
            ],
            { initialEntries: ["/"] },
        );
        render(<RouterProvider router={router} />);
        const user = userEvent.setup();
        save.mockRejectedValueOnce(
            new ApiError(422, "Bezeichnung fehlt", {
                "mutate.0.attributes.name": [
                    "Bitte eine Bezeichnung eingeben.",
                ],
            }),
        );
        await user.click(screen.getByText("Ablauf starten"));
        await user.click(
            await screen.findByRole(
                "button",
                { name: "Speichern & weiter" },
                { timeout: 10000 },
            ),
        );
        await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
        expect(records.size).toBe(0);
        await user.type(
            screen.getByRole("textbox", { name: /Bezeichnung/ }),
            "Vertrag A",
        );
        await user.click(
            screen.getByRole("button", { name: "Speichern & weiter" }),
        );
        expect(
            await screen.findByRole("combobox", { name: /Bezug/ }),
        ).toBeDisabled();
        await user.click(screen.getByRole("button", { name: "Zurück" }));
        expect(
            await screen.findByRole("textbox", { name: /Bezeichnung/ }),
        ).toHaveValue("Vertrag A");
        await user.type(
            screen.getByRole("textbox", { name: /Bezeichnung/ }),
            " geändert",
        );
        await user.click(
            screen.getByRole("button", { name: "Speichern & weiter" }),
        );
        await screen.findByRole("combobox", { name: /Bezug/ });
        await user.type(
            screen.getByRole("textbox", { name: /Bezeichnung/ }),
            "Erste Kondition",
        );
        await user.click(
            screen.getByRole("button", { name: "Ablauf abschließen" }),
        );
        await waitFor(() =>
            expect(router.state.location.pathname).toBe("/flow-parent/1"),
        );
        expect(records.size).toBe(2);
        expect(records.get("flow-child2")?.parent_id).toBe(1);
        expect(save.mock.calls[2][2]?.id).toBe(1);
        expect(router.state.location.search).toBe("");
    }, 15000);
});
