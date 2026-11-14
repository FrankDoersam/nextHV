import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
    cleanup,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { FileText } from "lucide-react";
import * as registry from "@/modules/registry";
import { WorkbenchProvider } from "./workbench";
import { ResourceEditor } from "./forms/resource-editor";
import {
    dataProvider,
    mutationPayload,
    normalizeValidationErrors,
} from "./data/provider";
import { ApiError } from "./data/http";
import type { ResourceDefinition } from "./types";

Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    })),
});
global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
};
Element.prototype.scrollIntoView = vi.fn();
Element.prototype.getAnimations = vi.fn(() => []);

const child: ResourceDefinition = {
    name: "entries",
    label: "Beteiligte",
    singular: "Beteiligter",
    description: "",
    icon: FileText,
    titleField: "name",
    columns: [],
    actions: [],
    fields: [
        { name: "contract_id", label: "Vertrag", kind: "number" },
        { name: "name", label: "Name" },
    ],
};
const parent: ResourceDefinition = {
    name: "contracts",
    label: "Verträge",
    singular: "Vertrag",
    description: "",
    icon: FileText,
    titleField: "code",
    columns: [],
    actions: [],
    fields: [{ name: "code", label: "Nummer", group: "base" }],
    groups: [
        { id: "base", label: "Grunddaten" },
        { id: "parties", label: "Beteiligte" },
    ],
    createRelations: [
        {
            relation: "parties",
            resource: () => child,
            foreignKey: "contract_id",
            group: "parties",
            label: "Vertragsbeteiligte",
            singular: "Beteiligter",
        },
    ],
};
function mount(wizard = false) {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const onClose = vi.fn();
    const router = createMemoryRouter([
        {
            path: "*",
            element: (
                <QueryClientProvider client={client}>
                    <WorkbenchProvider>
                        <ResourceEditor
                            request={{
                                resource: parent,
                                mode: "create",
                                wizard,
                                defaults: { code: "MV-NEW" },
                            }}
                            onClose={onClose}
                        />
                    </WorkbenchProvider>
                </QueryClientProvider>
            ),
        },
    ]);
    render(<RouterProvider router={router} />);
    return onClose;
}
beforeEach(() => {
    vi.spyOn(registry, "getResource").mockImplementation((name) =>
        name === "entries" ? child : parent,
    );
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe("native create relation repeaters", () => {
    it("serializes only allowed child attributes in a single parent mutation and maps nested errors", () => {
        const values = {
            code: "MV-1",
            parties: [
                { name: "Anna", contract_id: 999, id: 42, status: "active" },
                { name: "Ben" },
            ],
        };
        expect(mutationPayload(parent, values).mutate).toEqual([
            {
                operation: "create",
                attributes: { code: "MV-1" },
                relations: {
                    parties: [
                        { operation: "create", attributes: { name: "Anna" } },
                        { operation: "create", attributes: { name: "Ben" } },
                    ],
                },
            },
        ]);
        expect(
            mutationPayload(parent, values, [{ id: 1, updated_at: "v1" }])
                .mutate[0],
        ).not.toHaveProperty("relations");
        expect(
            normalizeValidationErrors({
                "mutate.0.relations.parties.1.attributes.name": ["Name fehlt."],
                "mutate.0.attributes.code": ["Nummer fehlt."],
            }),
        ).toEqual({ "parties.1.name": "Name fehlt.", code: "Nummer fehlt." });
    });
    it("keeps child values when rows are removed and shows an indexed server error before saving atomically", async () => {
        const user = userEvent.setup();
        const save = vi
            .spyOn(dataProvider, "save")
            .mockRejectedValueOnce(
                new ApiError(422, "Validierung", {
                    "mutate.0.relations.parties.0.attributes.name": [
                        "Dieser Name ist bereits vergeben.",
                    ],
                }),
            )
            .mockResolvedValue({ id: 42, updated_at: "v1", code: "MV-NEW" });
        const onClose = mount();
        expect(screen.queryByLabelText("Vertrag")).not.toBeInTheDocument();
        await user.type(screen.getByLabelText("Name"), "Anna");
        await user.click(
            screen.getByRole("button", { name: "Beteiligter hinzufügen" }),
        );
        await user.type(
            within(
                screen.getByRole("region", { name: "Beteiligter 2" }),
            ).getByLabelText("Name"),
            "Ben",
        );
        await user.click(
            screen.getByRole("button", { name: "Beteiligter 1 entfernen" }),
        );
        expect(screen.getByLabelText("Name")).toHaveValue("Ben");
        expect(save).not.toHaveBeenCalled();
        await user.click(screen.getByRole("button", { name: "Speichern" }));
        await waitFor(() =>
            expect(screen.getByLabelText("Name")).toHaveAttribute(
                "aria-invalid",
                "true",
            ),
        );
        expect(onClose).not.toHaveBeenCalled();
        await user.clear(screen.getByLabelText("Name"));
        await user.type(screen.getByLabelText("Name"), "Benedikt");
        await user.click(screen.getByRole("button", { name: "Speichern" }));
        await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
        expect(save).toHaveBeenLastCalledWith(
            parent,
            { code: "MV-NEW", parties: [{ name: "Benedikt" }] },
            undefined,
        );
    });
    it("validates wizard steps without intermediate writes and retains child rows on back", async () => {
        const user = userEvent.setup();
        const validate = vi
            .spyOn(dataProvider, "validate")
            .mockResolvedValue(undefined);
        const save = vi.spyOn(dataProvider, "save");
        mount(true);
        await user.click(screen.getByRole("button", { name: "Weiter" }));
        await user.type(await screen.findByLabelText("Name"), "Anna");
        await user.click(screen.getByRole("button", { name: "Zurück" }));
        await user.click(screen.getByRole("button", { name: "Weiter" }));
        expect(screen.getByLabelText("Name")).toHaveValue("Anna");
        expect(validate).toHaveBeenCalledWith(
            parent,
            expect.objectContaining({ code: "MV-NEW" }),
            undefined,
            ["code"],
        );
        expect(save).not.toHaveBeenCalled();
    });
});
