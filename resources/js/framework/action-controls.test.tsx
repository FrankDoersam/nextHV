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
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FormProvider, useForm } from "react-hook-form";
import { Building2 } from "lucide-react";
import { WorkbenchProvider, useWorkbench } from "./workbench";
import { ActionMenu } from "./action-controls";
import {
    actionAt,
    ActionGroup,
    BulkEditAction,
    ResourceAction,
} from "./actions";
import { FormActionScope } from "./forms/form-action-scope";
import { ResourceField } from "@/components/fields/field";
import { PropertyNameActions } from "@/modules/properties/name-actions";
import { ResourceCollection } from "./tables/resource-collection";
import { dataProvider, mutationPayload } from "./data/provider";
import type { ActionContext, ResourceDefinition, Values } from "./types";

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
const resource: ResourceDefinition = {
    name: "properties",
    label: "Objekte",
    singular: "Objekt",
    description: "Test",
    icon: Building2,
    titleField: "name",
    fields: [
        {
            name: "name",
            label: "Bezeichnung",
            suffixActions: [new PropertyNameActions()],
        },
        { name: "street", label: "Straße" },
        { name: "notes", label: "Notiz", kind: "textarea", nullable: true },
    ],
    columns: [{ field: "name", label: "Objekt" }],
    bulkEditable: ["notes"],
    actions: [new BulkEditAction()],
};
const rows = [
    { id: 1, name: "Haus A", notes: "A", updated_at: "2026-01-01" },
    { id: 2, name: "Haus B", notes: "B", updated_at: "2026-01-02" },
];
function mount(node: React.ReactNode) {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    render(
        <MemoryRouter>
            <QueryClientProvider client={client}>
                <WorkbenchProvider>{node}</WorkbenchProvider>
            </QueryClientProvider>
        </MemoryRouter>,
    );
    return client;
}
beforeEach(() => {
    vi.spyOn(dataProvider, "list").mockResolvedValue({
        data: rows,
        total: 2,
        current_page: 1,
        last_page: 1,
    });
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe("shared action runtime", () => {
    it.each([true, false])(
        "keeps grouped keyboard actions and accessible reasons with icons=%s",
        async (icons) => {
            const user = userEvent.setup();
            const execute = vi.fn();
            class Report extends ResourceAction {
                id = "report";
                label = "Bericht erstellen";
                description = "Auswertung des ausgewählten Objekts.";
                interaction = "immediate" as const;
                refresh = false;
                async execute(context: ActionContext) {
                    execute(context.rows);
                }
            }
            class Blocked extends Report {
                id = "blocked";
                label = "Archivieren";
                group = "Verwalten";
                enabled() {
                    return "Der Datensatz ist noch aktiv.";
                }
            }
            class Hidden extends Report {
                id = "hidden";
                label = "Verborgene Aktion";
                visible() {
                    return false;
                }
            }
            const reports = new ActionGroup("reports", "Berichte", [
                new Report(),
                new Hidden(),
            ]);
            reports.group = "Auswertung";
            mount(
                <ActionMenu
                    actions={[
                        reports,
                        new Blocked(),
                        new ActionGroup("hidden-group", "Verborgene Gruppe", [
                            new Hidden(),
                        ]),
                    ]}
                    target={{ resource, rows: [rows[0]] }}
                    placement="row"
                    icons={icons}
                />,
            );
            await user.click(screen.getByRole("button", { name: "Aktionen" }));
            expect(
                await screen.findByRole("menuitem", { name: "Archivieren" }),
            ).toHaveAttribute("aria-disabled", "true");
            expect(
                screen.getByRole("menuitem", { name: "Archivieren" }),
            ).toHaveAccessibleDescription("Der Datensatz ist noch aktiv.");
            expect(
                screen.queryByRole("menuitem", { name: "Verborgene Gruppe" }),
            ).not.toBeInTheDocument();
            expect(screen.getByText("Auswertung")).toBeVisible();
            expect(screen.getByText("Verwalten")).toBeVisible();

            screen.getByRole("menuitem", { name: "Berichte" }).focus();
            await user.keyboard("{ArrowRight}");
            const report = await screen.findByRole("menuitem", {
                name: "Bericht erstellen",
            });
            expect(report).toHaveAccessibleDescription(
                "Auswertung des ausgewählten Objekts.",
            );
            expect(
                screen.queryByRole("menuitem", { name: "Verborgene Aktion" }),
            ).not.toBeInTheDocument();
            report.focus();
            await user.keyboard("{Enter}");

            await waitFor(() =>
                expect(execute).toHaveBeenCalledExactlyOnceWith([rows[0]]),
            );
        },
    );

    it("patches a live unsaved form from a field submenu and reevaluates enabled reasons", async () => {
        function Form() {
            const form = useForm<Values>({
                defaultValues: { name: "  Haus   A  ", street: "" },
            });
            return (
                <FormActionScope target={{ resource, rows: [] }}>
                    <FormProvider {...form}>
                        {resource.fields.slice(0, 2).map((field) => (
                            <ResourceField
                                key={field.name}
                                definition={field}
                            />
                        ))}
                    </FormProvider>
                </FormActionScope>
            );
        }
        mount(<Form />);
        const user = userEvent.setup();
        await user.click(
            screen.getByRole("button", { name: "Bezeichnung aufbereiten" }),
        );
        expect(
            await screen.findByRole("menuitem", { name: /Adresse übernehmen/ }),
        ).toHaveAttribute("aria-disabled", "true");
        await user.click(
            screen.getByRole("menuitem", { name: /Leerzeichen bereinigen/ }),
        );
        await waitFor(() =>
            expect(screen.getByLabelText("Bezeichnung")).toHaveValue("Haus A"),
        );
        await user.type(screen.getByLabelText("Straße"), "Parkstraße");
        await user.click(
            screen.getByRole("button", { name: "Bezeichnung aufbereiten" }),
        );
        await user.click(
            await screen.findByRole("menuitem", { name: /Adresse übernehmen/ }),
        );
        await waitFor(() =>
            expect(screen.getByLabelText("Bezeichnung")).toHaveValue(
                "Parkstraße",
            ),
        );
    });
    it("shows a centered selection bar and sends only selected bulk properties, patching rows without refetch", async () => {
        const save = vi.spyOn(dataProvider, "saveMany").mockResolvedValue({
            records: rows.map((row) => ({ ...row, notes: "Neue Notiz" })),
        });
        const client = mount(
            <ResourceCollection resource={resource} syncWithLocation={false} />,
        );
        const user = userEvent.setup();
        await screen.findByRole("button", { name: "Haus A" });
        await user.click(
            screen.getByRole("checkbox", {
                name: "Alle Zeilen dieser Seite auswählen",
            }),
        );
        const bar = screen.getByRole("region", { name: "Auswahlaktionen" });
        expect(within(bar).getByText("2 ausgewählt")).toBeVisible();
        await user.click(
            within(bar).getByRole("button", { name: "Bearbeiten" }),
        );
        await screen.findByRole("heading", { name: "Bearbeiten" });
        const dialog = screen.getByRole("dialog");
        await waitFor(() =>
            expect(
                within(dialog).getByRole("button", {
                    name: "Bearbeiten",
                }),
            ).toBeDisabled(),
        );
        await user.click(
            within(dialog).getByRole("checkbox", { name: "Notiz ändern" }),
        );
        await user.type(
            within(dialog).getByLabelText("Notiz", { exact: true }),
            "Neue Notiz",
        );
        const before = vi.mocked(dataProvider.list).mock.calls.length;
        await user.click(
            within(dialog).getByRole("button", {
                name: "Bearbeiten",
            }),
        );
        await waitFor(() =>
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
        );
        expect(save).toHaveBeenCalledWith(
            resource,
            { notes: "Neue Notiz" },
            rows,
        );
        expect(
            client.getQueryData(["resources", "properties", "detail", 1]),
        ).toMatchObject({ notes: "Neue Notiz", name: "Haus A" });
        expect(dataProvider.list).toHaveBeenCalledTimes(before);
        await user.click(
            within(bar).getByRole("button", { name: "Auswahl aufheben" }),
        );
        expect(
            screen.queryByRole("region", { name: "Auswahlaktionen" }),
        ).not.toBeInTheDocument();
    });
    it("enforces disabled actions even when dispatched directly and honors exact placements", async () => {
        const execute = vi.fn();
        class DisabledAction extends ResourceAction {
            id = "disabled";
            label = "Nicht verfügbar";
            placements = ["detail"] as const as "detail"[];
            enabled() {
                return "Noch nicht freigegeben.";
            }
            async execute(_context: ActionContext) {
                execute();
            }
        }
        const action = new DisabledAction();
        function Direct() {
            const workbench = useWorkbench();
            return (
                <>
                    <button
                        onClick={() =>
                            workbench.runAction(action, {
                                resource,
                                rows: [rows[0]],
                            })
                        }
                    >
                        Direkt ausführen
                    </button>
                    <ActionMenu
                        actions={[action]}
                        target={{ resource, rows: [rows[0]] }}
                        placement="row"
                        label="Zeilenaktionen"
                    />
                </>
            );
        }
        mount(<Direct />);
        const user = userEvent.setup();
        expect(
            screen.queryByRole("button", { name: "Zeilenaktionen" }),
        ).not.toBeInTheDocument();
        expect(actionAt(action, "detail")).toBe(true);
        await user.click(screen.getByText("Direkt ausführen"));
        expect(execute).not.toHaveBeenCalled();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    it("uses native versioned batch payloads, excludes readonly and unknown properties, and preserves explicit clearing", () => {
        expect(
            mutationPayload(
                {
                    ...resource,
                    fields: [
                        ...resource.fields,
                        { name: "code", label: "Nr", readonlyOnEdit: true },
                    ],
                },
                { notes: "", unknown: true, code: "X" },
                rows,
            ).mutate,
        ).toEqual(
            rows.map((row) => ({
                operation: "update",
                key: row.id,
                version: row.updated_at,
                attributes: { notes: null },
            })),
        );
    });
});
