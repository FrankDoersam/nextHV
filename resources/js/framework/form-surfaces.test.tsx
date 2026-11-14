import { configurePermissions } from "./permissions";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { Building2 } from "lucide-react";
import * as registry from "@/modules/registry";
import { dataProvider } from "./data/provider";
import { ApiError } from "./data/http";
import { ResourceEditor } from "./forms/resource-editor";
import { panelSearch, readPanels, type PanelLink } from "./navigation/panels";
import { WorkbenchProvider } from "./workbench";
import type { RecordData, ResourceDefinition } from "./types";

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
const NativeRequest = globalThis.Request;
globalThis.Request = class extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(input, { ...init, signal: undefined });
    }
};
Element.prototype.scrollIntoView = vi.fn();
Element.prototype.getAnimations = vi.fn(() => []);

const record: RecordData = {
    id: 8,
    updated_at: "2026-01-01T00:00:00Z",
    name: "Lindenhöfe",
    notes: "Bestand",
    secret: "NICHT ANZEIGEN",
};
const resource: ResourceDefinition = {
    name: "properties",
    label: "Objekte",
    singular: "Objekt",
    description: "Stammdaten",
    icon: Building2,
    titleField: "name",
    columns: [],
    actions: [],
    fields: [
        { name: "name", label: "Name", group: "general" },
        { name: "notes", label: "Notiz", group: "notes" },
        {
            name: "secret",
            label: "Ausweisnummer",
            group: "private",
            writeOnly: true,
        },
    ],
    groups: [
        { id: "general", label: "Stammdaten" },
        {
            id: "notes",
            label: "Hinweise",
            defaultOpen: false,
            summary: (values) => String(values.notes ?? ""),
        },
        { id: "private", label: "Vertraulich" },
    ],
    editor: { sectionStyle: "collapsible" },
    view: { sectionStyle: "collapsible" },
};
const panel: PanelLink = {
    key: "p1",
    resource: "properties",
    mode: "view",
    id: 8,
    presentation: "sheet",
};
function mount(element: React.ReactNode = null, descriptor?: PanelLink) {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const router = createMemoryRouter(
        [
            {
                path: "*",
                element: (
                    <QueryClientProvider client={client}>
                        <WorkbenchProvider>{element}</WorkbenchProvider>
                    </QueryClientProvider>
                ),
            },
        ],
        {
            initialEntries: [
                `/properties?${panelSearch("q=Linden", descriptor ? [descriptor] : [])}`,
            ],
        },
    );
    render(<RouterProvider router={router} />);
    return { router, client };
}
beforeEach(() => {
    vi.spyOn(registry, "getResource").mockImplementation(() => resource);
    vi.spyOn(dataProvider, "one").mockResolvedValue(record);
});
afterEach(() => {
    cleanup();
    configurePermissions({ enabled: false, adapter: { can: () => true } });
    vi.restoreAllMocks();
});

describe("shared view and section editors", () => {
    it("hydrates a read-only deep link and saves a section in the same panel without submitting unrelated attributes", async () => {
        const user = userEvent.setup();
        const saved = {
            ...record,
            name: "Lindenhöfe Nord",
            updated_at: "2026-01-02T00:00:00Z",
        };
        const save = vi.spyOn(dataProvider, "save").mockResolvedValue(saved);
        const { router } = mount(null, panel);
        await screen.findByRole("dialog", { name: "Lindenhöfe" });
        expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
        expect(screen.queryByText("NICHT ANZEIGEN")).not.toBeInTheDocument();
        expect(screen.queryByText("Ausweisnummer")).not.toBeInTheDocument();

        await user.click(
            screen.getByRole("button", { name: "Stammdaten bearbeiten" }),
        );
        const name = await screen.findByRole("textbox", { name: "Name" });
        expect(readPanels(router.state.location.search)).toEqual([
            { ...panel, mode: "edit", fields: ["name"], returnToView: true },
        ]);
        expect(
            screen.queryByRole("textbox", { name: "Notiz" }),
        ).not.toBeInTheDocument();
        await user.clear(name);
        await user.type(name, "Lindenhöfe Nord");
        await user.click(screen.getByRole("button", { name: "Speichern" }));

        await screen.findByRole("dialog", { name: "Lindenhöfe Nord" });
        expect(save).toHaveBeenCalledWith(
            resource,
            { name: "Lindenhöfe Nord" },
            record,
        );
        expect(readPanels(router.state.location.search)).toEqual([panel]);
        expect(new URLSearchParams(router.state.location.search).get("q")).toBe(
            "Linden",
        );
    });

    it("hydrates another record when browser navigation reuses the same panel slot", async () => {
        const nextRecord = { ...record, id: 9, name: "Sonnenhof" };
        vi.mocked(dataProvider.one).mockImplementation(async (_resource, id) =>
            id === 9 ? nextRecord : record,
        );
        const { router } = mount(null, panel);
        await screen.findByRole("dialog", { name: "Lindenhöfe" });
        await router.navigate(
            `/properties?${panelSearch("", [{ ...panel, id: 9 }])}`,
        );
        expect(
            await screen.findByRole("dialog", { name: "Sonnenhof" }),
        ).toBeVisible();
        expect(dataProvider.one).toHaveBeenCalledWith(
            resource,
            9,
            expect.any(AbortSignal),
        );
    });
    it("restores a section edit link with its collapsed-by-default section open and returns to view on cancel", async () => {
        const user = userEvent.setup();
        const { router } = mount(null, {
            ...panel,
            mode: "edit",
            fields: ["notes"],
            returnToView: true,
        });
        expect(
            await screen.findByRole("textbox", { name: "Notiz" }),
        ).toHaveValue("Bestand");
        expect(
            screen.queryByRole("textbox", { name: "Name" }),
        ).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Abbrechen" }));

        await screen.findByRole("dialog", { name: "Lindenhöfe" });
        expect(readPanels(router.state.location.search)).toEqual([panel]);
    });

    it("preserves the locked parent reference when switching a related record between view and section edit", async () => {
        const user = userEvent.setup();
        const unit: ResourceDefinition = {
            ...resource,
            name: "units",
            fields: [
                resource.fields[0],
                {
                    name: "property_id",
                    label: "Objekt",
                    group: "general",
                    kind: "relation",
                    resource: "properties",
                },
            ],
        };
        const linkedRecord = { ...record, property_id: 3 };
        vi.mocked(registry.getResource).mockImplementation((name) =>
            name === "units" ? unit : resource,
        );
        vi.mocked(dataProvider.one).mockImplementation(async (resource, id) =>
            resource.name === "units" ? linkedRecord : { ...record, id },
        );
        const linkedPanel: PanelLink = {
            ...panel,
            resource: "units",
            context: { resource: "properties", id: 3, field: "property_id" },
        };
        const { router } = mount(null, linkedPanel);

        await user.click(
            await screen.findByRole("button", {
                name: "Stammdaten bearbeiten",
            }),
        );

        expect(
            await screen.findByRole("textbox", { name: "Name" }),
        ).toBeVisible();
        expect(readPanels(router.state.location.search)).toEqual([
            {
                ...linkedPanel,
                mode: "edit",
                fields: ["name"],
                returnToView: true,
            },
        ]);
        expect(
            screen.queryByRole("combobox", { name: "Objekt" }),
        ).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Abbrechen" }));
        await screen.findByRole("dialog", { name: "Lindenhöfe" });
        expect(readPanels(router.state.location.search)).toEqual([linkedPanel]);
    });

    it("rejects forged section fields before hydrating an editable record", async () => {
        mount(null, { ...panel, mode: "edit", fields: ["organization_id"] });

        expect(
            await screen.findByText(
                "Der Direktlink enthält nicht bearbeitbare Felder.",
            ),
        ).toBeVisible();
        expect(
            screen.queryByRole("button", { name: "Speichern" }),
        ).not.toBeInTheDocument();
        expect(dataProvider.one).not.toHaveBeenCalled();
        expect(
            readPanels(
                panelSearch("", [
                    { ...panel, mode: "edit", fields: ["prototype.secret"] },
                ]),
            ),
        ).toEqual([]);
    });
});

describe("collapsible form regions and wizard summary", () => {
    it("does not render a wizard-only summary in the regular edit form", () => {
        mount(
            <ResourceEditor
                request={{
                    resource: {
                        ...resource,
                        editor: {
                            wizardSummary: {
                                title: "Erfassungsübersicht",
                                items: (values) => [
                                    {
                                        id: "name",
                                        label: "Objekt",
                                        value: String(values.name),
                                    },
                                ],
                            },
                        },
                    },
                    mode: "edit",
                    row: record,
                }}
                onClose={vi.fn()}
            />,
        );

        expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue(
            "Lindenhöfe",
        );
        expect(
            screen.queryByRole("region", { name: "Erfassungsübersicht" }),
        ).not.toBeInTheDocument();
    });

    it("retains hidden values and reveals and focuses server-rejected fields", async () => {
        const user = userEvent.setup();
        const save = vi.spyOn(dataProvider, "save").mockRejectedValue(
            new ApiError(422, "Serverprüfung", {
                "mutate.0.attributes.name": ["Name bereits vergeben"],
            }),
        );
        mount(
            <ResourceEditor
                request={{ resource, mode: "edit", row: record }}
                onClose={vi.fn()}
            />,
        );
        await user.clear(screen.getByRole("textbox", { name: "Name" }));
        await user.type(
            screen.getByRole("textbox", { name: "Name" }),
            "Neue Bezeichnung",
        );
        await user.click(screen.getByRole("button", { name: "Stammdaten" }));
        await user.click(screen.getByRole("button", { name: "Hinweise" }));
        await user.clear(screen.getByRole("textbox", { name: "Notiz" }));
        await user.type(
            screen.getByRole("textbox", { name: "Notiz" }),
            "Neue Notiz",
        );
        await user.click(screen.getByRole("button", { name: "Hinweise" }));
        expect(screen.getByText("Neue Notiz")).toBeVisible();

        await user.click(screen.getByRole("button", { name: "Speichern" }));

        await waitFor(() =>
            expect(screen.getByRole("textbox", { name: "Name" })).toHaveFocus(),
        );
        expect(
            screen.getByRole("button", { name: "Stammdaten" }),
        ).toHaveAttribute("aria-expanded", "true");
        expect(save).toHaveBeenCalledWith(
            resource,
            {
                name: "Neue Bezeichnung",
                notes: "Neue Notiz",
                secret: undefined,
            },
            record,
        );
        await user.click(screen.getByRole("button", { name: "Hinweise" }));
        expect(screen.getByRole("textbox", { name: "Notiz" })).toHaveValue(
            "Neue Notiz",
        );
    });

    it("keeps one summary of live form values across validated wizard steps", async () => {
        const user = userEvent.setup();
        const validate = vi
            .spyOn(dataProvider, "validate")
            .mockResolvedValue(undefined);
        const definition: ResourceDefinition = {
            ...resource,
            editor: {
                sectionStyle: "collapsible",
                wizardSummary: {
                    title: "Erfassungsübersicht",
                    items: (values) => [
                        {
                            id: "name",
                            label: "Objekt",
                            value: String(values.name ?? ""),
                        },
                        {
                            id: "notes",
                            label: "Hinweis",
                            value: String(values.notes ?? ""),
                        },
                    ],
                },
            },
        };
        mount(
            <ResourceEditor
                request={{ resource: definition, mode: "create", wizard: true }}
                onClose={vi.fn()}
            />,
        );
        await user.type(
            screen.getByRole("textbox", { name: "Name" }),
            "Parkhof",
        );
        expect(
            screen.getByRole("region", { name: "Erfassungsübersicht" }),
        ).toHaveTextContent("Parkhof");

        await user.click(screen.getByRole("button", { name: "Weiter" }));
        await user.type(
            await screen.findByRole("textbox", { name: "Notiz" }),
            "Rückruf Montag",
        );

        expect(validate).toHaveBeenCalledWith(
            definition,
            expect.objectContaining({ name: "Parkhof" }),
            undefined,
            ["name"],
        );
        expect(
            screen.getAllByRole("region", { name: "Erfassungsübersicht" }),
        ).toHaveLength(1);
        expect(
            screen.getByRole("region", { name: "Erfassungsübersicht" }),
        ).toHaveTextContent("Parkhof");
        expect(
            screen.getByRole("region", { name: "Erfassungsübersicht" }),
        ).toHaveTextContent("Rückruf Montag");
        await user.click(screen.getByRole("button", { name: "Zurück" }));
        expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue(
            "Parkhof",
        );
    });
});

it("retries only the failed follow-up after persistence and never creates the record twice", async () => {
    const save = vi.spyOn(dataProvider, "save").mockResolvedValue(record);
    const onSaved = vi
        .fn()
        .mockRejectedValueOnce(new Error("Picker offline"))
        .mockResolvedValue(undefined);
    const onClose = vi.fn();
    const user = userEvent.setup();
    mount(
        <ResourceEditor
            request={{ resource, mode: "create", onSaved }}
            onClose={onClose}
        />,
    );
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    expect(
        await screen.findByText(
            /Der Datensatz wurde gespeichert. Der Folgeschritt/,
        ),
    ).toBeVisible();
    expect(
        screen.queryByRole("button", { name: "Speichern" }),
    ).not.toBeInTheDocument();
    await user.click(
        screen.getByRole("button", { name: "Folgeschritt wiederholen" }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(2);
    expect(onSaved).toHaveBeenLastCalledWith(record);
});

it("submits only once when two submit events arrive before a React render", async () => {
    let finish!: (row: RecordData) => void;
    const save = vi.spyOn(dataProvider, "save").mockImplementation(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    const onClose = vi.fn();
    mount(
        <ResourceEditor
            request={{ resource, mode: "create" }}
            onClose={onClose}
        />,
    );
    const form = screen.getByRole("textbox", { name: "Name" }).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(
        screen.getByRole("button", { name: /Wird gespeichert/ }),
    ).toBeDisabled();
    await act(async () => finish(record));
    expect(onClose).toHaveBeenCalledTimes(1);
});

it("denies a create deep link before hydrating a parent or mounting a form", async () => {
    configurePermissions({
        enabled: true,
        adapter: {
            can: async () => ({
                allowed: false,
                reason: "Anlegen ist gesperrt.",
            }),
        },
    });
    mount(null, { ...panel, mode: "create", id: undefined });
    expect(await screen.findByText("Anlegen ist gesperrt.")).toBeVisible();
    expect(
        screen.queryByRole("button", { name: "Speichern" }),
    ).not.toBeInTheDocument();
    expect(dataProvider.one).not.toHaveBeenCalled();
});
