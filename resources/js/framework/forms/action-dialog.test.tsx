import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { Building2 } from "lucide-react";
import { ActionDialog } from "./action-dialog";
import { DeleteAction } from "../actions";
import { ApiError } from "../data/http";
import { WorkbenchProvider } from "../workbench";
import type { ActionContext } from "../types";

Element.prototype.getAnimations = vi.fn(() => []);
global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
};
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});
const context: ActionContext = {
    resource: {
        name: "contracts",
        label: "Verträge",
        singular: "Vertrag",
        description: "",
        titleField: "code",
        icon: Building2,
        columns: [],
        fields: [],
        actions: [],
    },
    rows: [{ id: 8, code: "MV-008", updated_at: "2026-01-01" }],
    values: {},
    instance: {
        reload: vi.fn().mockResolvedValue(undefined),
        navigate: vi.fn(),
        openForm: vi.fn(),
        openFlow: vi.fn(),
        openRelation: vi.fn(),
    },
};
function mount(action: DeleteAction) {
    const close = vi.fn();
    const completed = vi.fn();
    render(
        <QueryClientProvider
            client={
                new QueryClient({
                    defaultOptions: { queries: { retry: false } },
                })
            }
        >
            <MemoryRouter>
                <WorkbenchProvider>
                    <ActionDialog
                        action={action}
                        context={context}
                        onClose={close}
                        onComplete={completed}
                    />
                </WorkbenchProvider>
            </MemoryRouter>
        </QueryClientProvider>,
    );
    return { close, completed };
}
describe("one confirmation dialog", () => {
    it("waits for one deliberate click, executes once and closes only after success", async () => {
        const action = new DeleteAction();
        let finish!: (value: unknown) => void;
        const execute = vi.spyOn(action, "execute").mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                }),
        );
        const { close, completed } = mount(action);
        const user = userEvent.setup();
        const button = await screen.findByRole("button", { name: "Löschen" });
        await waitFor(() => expect(button).toBeEnabled());
        expect(execute).not.toHaveBeenCalled();
        await user.click(button);
        await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
        expect(execute).toHaveBeenLastCalledWith(context);
        expect(
            screen.getByRole("button", { name: "Wird gelöscht …" }),
        ).toBeDisabled();
        expect(
            screen.getByRole("button", { name: "Abbrechen" }),
        ).toBeDisabled();
        expect(screen.getAllByRole("dialog")).toHaveLength(1);
        expect(close).not.toHaveBeenCalled();
        finish({ deleted: 1 });
        await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
        expect(completed).toHaveBeenCalledWith({ deleted: 1 });
    });
    it("keeps validation failures in the same dialog without another confirmation or closing", async () => {
        const action = new DeleteAction();
        const execute = vi.spyOn(action, "execute").mockRejectedValueOnce(
            new ApiError(422, "Aktive Verträge können nicht gelöscht werden.", {
                status: ["Aktive Verträge können nicht gelöscht werden."],
            }),
        );
        const { close } = mount(action);
        const user = userEvent.setup();
        const button = await screen.findByRole("button", { name: "Löschen" });
        await waitFor(() => expect(button).toBeEnabled());
        await user.click(button);
        expect(
            await screen.findByText(
                "Aktive Verträge können nicht gelöscht werden.",
            ),
        ).toBeVisible();
        expect(screen.getAllByRole("dialog")).toHaveLength(1);
        expect(button).toBeEnabled();
        expect(close).not.toHaveBeenCalled();
        expect(execute).toHaveBeenCalledTimes(1);
    });
    it("never offers to repeat a successful deletion when only reloading the view fails", async () => {
        const action = new DeleteAction();
        vi.spyOn(action, "execute").mockResolvedValue({ deleted: 1 });
        vi.mocked(context.instance.reload).mockRejectedValueOnce(
            new Error("Offline"),
        );
        const { close } = mount(action);
        const user = userEvent.setup();
        const button = await screen.findByRole("button", { name: "Löschen" });
        await waitFor(() => expect(button).toBeEnabled());
        await user.click(button);
        expect(
            await screen.findByText(
                /Die Ansicht konnte nicht aktualisiert werden/,
            ),
        ).toBeVisible();
        expect(
            screen.queryByRole("button", { name: "Löschen" }),
        ).not.toBeInTheDocument();
        expect(
            screen.getAllByRole("button", { name: "Schließen" }).at(-1),
        ).toBeEnabled();
        expect(close).not.toHaveBeenCalled();
    });
    it("does not automatically repeat a failed deletion", async () => {
        const action = new DeleteAction();
        const execute = vi
            .spyOn(action, "execute")
            .mockRejectedValue(
                new ApiError(
                    503,
                    "Der Dienst ist vorübergehend nicht erreichbar.",
                ),
            );
        const { close } = mount(action);
        const user = userEvent.setup();
        const button = await screen.findByRole("button", { name: "Löschen" });
        await waitFor(() => expect(button).toBeEnabled());
        await user.click(button);
        expect(
            await screen.findByText(
                "Der Dienst ist vorübergehend nicht erreichbar.",
            ),
        ).toBeVisible();
        expect(execute).toHaveBeenCalledTimes(1);
        expect(close).not.toHaveBeenCalled();
    });
});
