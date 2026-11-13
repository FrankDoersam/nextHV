import { DynamicList, ListRow } from "@/components/blocks/content";
import { LazyTabs } from "@/components/blocks/lazy-tabs";
import { Button } from "@/components/ui/button";
import { CloneAction } from "@/modules/properties/clone-action";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Building2 } from "lucide-react";
import React from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteAction, EditAction } from "./actions";
import { dataProvider } from "./data/provider";
import { ResourceCollection } from "./tables/resource-collection";
import type { ResourceDefinition } from "./types";
import { WorkbenchProvider, useWorkbench } from "./workbench";
Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
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
const resource: ResourceDefinition = {
    name: "properties",
    label: "Objekte",
    singular: "Objekt",
    description: "Test",
    icon: Building2,
    titleField: "name",
    groups: [
        { id: "general", label: "Grunddaten" },
        { id: "address", label: "Adresse" },
    ],
    fields: [
        { name: "code", label: "Nummer", required: true, group: "general" },
        {
            name: "name",
            label: "Bezeichnung",
            required: true,
            group: "general",
        },
        { name: "city", label: "Ort", required: true, group: "address" },
    ],
    columns: [
        { field: "name", label: "Objekt" },
        { field: "city", label: "Ort" },
    ],
    groupBy: [{ value: "city", label: "Standort" }],
    actions: [new EditAction(), new CloneAction(), new DeleteAction()],
};
const rows = [
    {
        id: 1,
        name: "Lindenhöfe",
        code: "P1",
        city: "Berlin",
        updated_at: "2026-01-01T00:00:00Z",
    },
    {
        id: 2,
        name: "Sonnenhof",
        code: "P2",
        city: "München",
        updated_at: "2026-01-01T00:00:00Z",
    },
];
function wrap(element: React.ReactNode) {
    return render(
        <MemoryRouter>
            <QueryClientProvider
                client={
                    new QueryClient({
                        defaultOptions: {
                            queries: { retry: false },
                            mutations: { retry: false },
                        },
                    })
                }
            >
                <WorkbenchProvider>{element}</WorkbenchProvider>
            </QueryClientProvider>
        </MemoryRouter>,
    );
}
function OpenForm({ wizard = false }: { wizard?: boolean }) {
    const w = useWorkbench();
    return (
        <Button
            onClick={() =>
                w.openForm({
                    resource,
                    mode: "create",
                    wizard,
                    presentation: "dialog",
                })
            }
        >
            Öffnen
        </Button>
    );
}
beforeEach(() => {
    vi.spyOn(dataProvider, "metadata").mockResolvedValue({
        data: { defaults: {}, forced: [], createOnly: [], deleteRestrictions: [] },
    });
    vi.spyOn(dataProvider, "list").mockResolvedValue({
        data: rows,
        total: 2,
        current_page: 1,
        last_page: 1,
    });
    vi.spyOn(dataProvider, "save").mockResolvedValue(rows[0]);
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});
describe("CRUD interactions", () => {
    it("validates each wizard step, preserves values when going back and submits once", async () => {
        const user = userEvent.setup();
        wrap(<OpenForm wizard />);
        await user.click(screen.getByRole("button", { name: "Öffnen" }));
        await user.click(screen.getByRole("button", { name: "Weiter" }));
        expect(
            await screen.findAllByText("Dieses Feld ist erforderlich."),
        ).toHaveLength(2);
        await user.type(
            screen.getByLabelText("Nummer", { exact: false }),
            "P3",
        );
        await user.type(
            screen.getByLabelText("Bezeichnung", { exact: false }),
            "Testobjekt",
        );
        await user.click(screen.getByRole("button", { name: "Weiter" }));
        await user.type(screen.getByLabelText("Ort", { exact: false }), "Bonn");
        await user.click(screen.getByRole("button", { name: "Zurück" }));
        expect(screen.getByLabelText("Nummer", { exact: false })).toHaveValue(
            "P3",
        );
        await user.click(screen.getByRole("button", { name: "Weiter" }));
        await user.click(screen.getByRole("button", { name: "Speichern" }));
        await waitFor(() => expect(dataProvider.save).toHaveBeenCalledTimes(1));
        expect(dataProvider.save).toHaveBeenCalledWith(
            resource,
            { code: "P3", name: "Testobjekt", city: "Bonn" },
            undefined,
        );
    });
    it("requires an explicit discard of dirty forms", async () => {
        const user = userEvent.setup();
        wrap(<OpenForm />);
        await user.click(screen.getByRole("button", { name: "Öffnen" }));
        await user.type(
            screen.getByLabelText("Nummer", { exact: false }),
            "changed",
        );
        await user.click(screen.getByRole("button", { name: "Abbrechen" }));
        expect(
            await screen.findByRole("heading", {
                name: "Änderungen verwerfen?",
            }),
        ).toBeVisible();
        await user.click(
            screen.getByRole("button", { name: "Weiter bearbeiten" }),
        );
        expect(screen.getByLabelText("Nummer", { exact: false })).toHaveValue(
            "changed",
        );
    });
    it("renders real REUI grid and forwards debounced search to the provider", async () => {
        const user = userEvent.setup();
        wrap(<ResourceCollection resource={resource} />);
        expect(
            await screen.findByRole("button", { name: "Lindenhöfe" }),
        ).toBeVisible();
        await user.type(
            screen.getByRole("textbox", { name: "Objekte durchsuchen" }),
            "Linden",
        );
        await waitFor(() =>
            expect(dataProvider.list).toHaveBeenLastCalledWith(
                resource,
                expect.objectContaining({ query: "Linden", page: 1 }),
            ),
        );
    });
    it("exposes only enabled bulk actions for selected rows", async () => {
        const user = userEvent.setup();
        wrap(<ResourceCollection resource={resource} />);
        await screen.findByRole("button", { name: "Lindenhöfe" });
        await user.click(
            screen.getByRole("checkbox", {
                name: "Alle Zeilen dieser Seite auswählen",
            }),
        );
        expect(await screen.findByText("2 ausgewählt")).toBeVisible();
        expect(screen.getByRole("button", { name: "Löschen" })).toBeVisible();
        expect(
            screen.queryByRole("button", { name: "Duplizieren" }),
        ).not.toBeInTheDocument();
    });
    it("does not load inactive detail tabs", async () => {
        const user = userEvent.setup();
        const load = vi.fn(() => <p>Geladene Verträge</p>);
        wrap(
            <LazyTabs
                tabs={[
                    {
                        id: "overview",
                        label: "Übersicht",
                        render: () => <p>Grunddaten</p>,
                    },
                    { id: "contracts", label: "Verträge", render: load },
                ]}
            />,
        );
        expect(load).not.toHaveBeenCalled();
        await user.click(screen.getByRole("tab", { name: "Verträge" }));
        expect(load).toHaveBeenCalled();
        expect(screen.getByText("Geladene Verträge")).toBeVisible();
    });
    it("supports searchable custom list renderers", async () => {
        const user = userEvent.setup();
        wrap(
            <DynamicList
                items={rows}
                search
                searchText={(r) => r.name}
                getKey={(r) => r.id}
                renderItem={(r) => (
                    <ListRow title={r.name} description={r.city} />
                )}
            />,
        );
        await user.type(
            screen.getByRole("textbox", { name: "Liste durchsuchen" }),
            "Sonne",
        );
        expect(screen.queryByText("Lindenhöfe")).not.toBeInTheDocument();
        expect(screen.getByText("Sonnenhof")).toBeVisible();
    });
    it("shares column visibility across grouped grids", async () => {
        const user = userEvent.setup();
        wrap(<ResourceCollection resource={resource} />);
        await screen.findByRole("button", { name: "Lindenhöfe" });
        await user.click(screen.getByRole("combobox", { name: "Gruppierung" }));
        await user.click(
            await screen.findByRole("option", { name: "Standort" }),
        );
        expect(await screen.findAllByText("1 auf dieser Seite")).toHaveLength(
            2,
        );
        await user.click(screen.getByRole("button", { name: "Spalten" }));
        await user.click(
            await screen.findByRole("menuitemcheckbox", { name: "Objekt" }),
        );
        await user.keyboard("{Escape}");
        expect(
            screen.queryByRole("button", { name: "Lindenhöfe" }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Sonnenhof" }),
        ).not.toBeInTheDocument();
    });
});
