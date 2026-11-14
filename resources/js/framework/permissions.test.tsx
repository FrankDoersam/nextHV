import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
    access,
    can,
    configurePermissions,
    invalidatePermissions,
    useAccess,
} from "./permissions";
import { PermissionBoundary } from "./permission-boundary";

function Decision() {
    const result = useAccess("contracts", "edit", { id: 7 });
    return (
        <span>
            {result.pending
                ? "Prüfung"
                : result.allowed
                  ? "Freigegeben"
                  : (result.reason ?? "Gesperrt")}
        </span>
    );
}
afterEach(() => {
    cleanup();
    configurePermissions({ enabled: false, adapter: { can: () => true } });
    vi.restoreAllMocks();
});
it("deduplicates asynchronous decisions across surfaces and displays the denial reason", async () => {
    let finish!: (value: { allowed: boolean; reason: string }) => void;
    const check = vi.fn(
        () =>
            new Promise<{ allowed: boolean; reason: string }>((resolve) => {
                finish = resolve;
            }),
    );
    configurePermissions({ enabled: true, adapter: { can: check } });
    render(
        <>
            <Decision />
            <Decision />
        </>,
    );
    expect(screen.getAllByText("Prüfung")).toHaveLength(2);
    expect(check).toHaveBeenCalledTimes(1);
    await act(async () =>
        finish({ allowed: false, reason: "Nur lesender Zugriff" }),
    );
    expect(await screen.findAllByText("Nur lesender Zugriff")).toHaveLength(2);
    expect(can("contracts", "edit", { id: 7 })).toBe(false);
    expect(check).toHaveBeenCalledTimes(1);
});
it("keeps protected children unmounted until access is resolved", async () => {
    let finish!: (value: boolean) => void;
    configurePermissions({
        enabled: true,
        adapter: {
            can: () =>
                new Promise<boolean>((resolve) => {
                    finish = resolve;
                }),
        },
    });
    const load = vi.fn();
    function Protected() {
        load();
        return <span>Vertragsinhalt</span>;
    }
    render(
        <PermissionBoundary resource="contracts" action="list">
            <Protected />
        </PermissionBoundary>,
    );
    expect(screen.getByRole("status", { name: "Wird geladen" })).toBeVisible();
    expect(load).not.toHaveBeenCalled();
    await act(async () => finish(false));
    expect(await screen.findByText("Kein Zugriff")).toBeVisible();
    expect(load).not.toHaveBeenCalled();
});
it("fails closed when the remote adapter rejects instead of causing an unhandled rejection", async () => {
    configurePermissions({
        enabled: true,
        adapter: {
            can: async () => {
                throw new Error("offline");
            },
        },
    });
    render(<Decision />);
    expect(
        await screen.findByText("Berechtigung konnte nicht geprüft werden."),
    ).toBeVisible();
});
it("updates mounted controls when the adapter is replaced", async () => {
    configurePermissions({ enabled: true, adapter: { can: () => false } });
    render(<Decision />);
    expect(screen.getByText("Gesperrt")).toBeVisible();
    act(() =>
        configurePermissions({ enabled: true, adapter: { can: () => true } }),
    );
    expect(await screen.findByText("Freigegeben")).toBeVisible();
});
it("aborts stale decisions on identity reset and never restores the old grant", async () => {
    let finish!: (value: boolean) => void;
    let signal!: AbortSignal;
    configurePermissions({
        enabled: true,
        adapter: {
            can: (_resource, _action, _row, context) => {
                signal = context!.signal;
                return new Promise<boolean>((resolve) => {
                    finish = resolve;
                });
            },
        },
    });
    render(<Decision />);
    act(() =>
        configurePermissions({ enabled: true, adapter: { can: () => false } }),
    );
    expect(signal.aborted).toBe(true);
    await act(async () => finish(true));
    expect(await screen.findByText("Gesperrt")).toBeVisible();
});
it("isolates decisions by record attributes and rechecks expired entries", async () => {
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const check = vi.fn(
        async (
            _resource: string,
            _action: string,
            row?: { id: number; status?: unknown },
        ) => row?.status === "draft",
    );
    configurePermissions({
        enabled: true,
        adapter: { can: check },
        staleTime: 100,
    });
    expect(
        access("contracts", "edit", { id: 7, status: "draft" }).pending,
    ).toBe(true);
    await waitFor(() =>
        expect(can("contracts", "edit", { id: 7, status: "draft" })).toBe(true),
    );
    expect(
        access("contracts", "edit", { id: 7, status: "active" }).pending,
    ).toBe(true);
    await waitFor(() =>
        expect(
            access("contracts", "edit", { id: 7, status: "active" }).pending,
        ).not.toBe(true),
    );
    expect(can("contracts", "edit", { id: 7, status: "active" })).toBe(false);
    now = 1101;
    expect(
        access("contracts", "edit", { id: 7, status: "draft" }).pending,
    ).toBe(true);
    await waitFor(() =>
        expect(can("contracts", "edit", { id: 7, status: "draft" })).toBe(true),
    );
    expect(check).toHaveBeenCalledTimes(3);
    invalidatePermissions();
});
