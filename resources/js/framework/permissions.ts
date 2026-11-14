import { hashKey, QueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import type { RecordData } from "./types";

export type PermissionRecord = Pick<RecordData, "id"> & Partial<RecordData>;
export type PermissionDecision =
    boolean | { allowed: boolean; reason?: string };
export type AccessState = {
    allowed: boolean;
    reason?: string;
    pending?: boolean;
};
export interface PermissionAdapter {
    can: (
        resource: string,
        action: string,
        row?: PermissionRecord,
        context?: { signal: AbortSignal },
    ) => PermissionDecision | Promise<PermissionDecision>;
}
const pending: AccessState = {
    allowed: false,
    pending: true,
    reason: "Berechtigung wird geprüft …",
};
const failed: AccessState = {
    allowed: false,
    reason: "Berechtigung konnte nicht geprüft werden.",
};
const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 300_000 } },
});
let enabled = false;
let adapter: PermissionAdapter = { can: () => true };
let staleTime = 30_000;
let revision = 0;
let notificationQueued = false;
const listeners = new Set<() => void>();
function notify() {
    revision++;
    if (notificationQueued) return;
    notificationQueued = true;
    queueMicrotask(() => {
        notificationQueued = false;
        for (const listener of listeners) listener();
    });
}
cache.getQueryCache().subscribe(notify);

/** Call after identity/role changes; stale in-flight decisions cannot restore access. */
export function invalidatePermissions() {
    cache.clear();
    notify();
}
/** Backwards-compatible configuration. Disabled means no adapter calls at all. */
export const permissionConfig = {
    get enabled() {
        return enabled;
    },
    set enabled(value: boolean) {
        enabled = value;
        invalidatePermissions();
    },
    get adapter() {
        return adapter;
    },
    set adapter(value: PermissionAdapter) {
        adapter = value;
        invalidatePermissions();
    },
    get staleTime() {
        return staleTime;
    },
    set staleTime(value: number) {
        staleTime = Number.isFinite(value) ? Math.max(1, value) : 30_000;
        invalidatePermissions();
    },
};
export function configurePermissions(options: {
    enabled: boolean;
    adapter: PermissionAdapter;
    staleTime?: number;
}) {
    adapter = options.adapter;
    enabled = options.enabled;
    staleTime = Number.isFinite(options.staleTime)
        ? Math.max(1, options.staleTime!)
        : 30_000;
    invalidatePermissions();
}
function normalize(decision: PermissionDecision): AccessState {
    return typeof decision === "boolean"
        ? { allowed: decision }
        : {
              allowed: decision?.allowed === true,
              reason: decision?.reason,
          };
}

/** Cached async adapter bridge for both headless action classes and reactive controls. */
export function access(
    resource: string,
    action: string,
    row?: PermissionRecord,
): AccessState {
    if (!enabled) return { allowed: true };
    const key = ["permission", resource, action, hashKey([row ?? null])];
    const state = cache.getQueryState<AccessState>(key);
    if (state?.fetchStatus === "fetching") return pending;
    if (state?.data && Date.now() - state.dataUpdatedAt < staleTime)
        return state.data;
    const controller = new AbortController();
    try {
        const decision = adapter.can(resource, action, row, {
            signal: controller.signal,
        });
        if (!(
            decision &&
            typeof (decision as Promise<PermissionDecision>).then === "function"
        )) {
            return normalize(decision as PermissionDecision);
        }
        void cache
            .fetchQuery({
                queryKey: key,
                staleTime: 0,
                queryFn: async ({ signal }) => {
                    const abort = () => controller.abort();
                    signal.addEventListener("abort", abort, { once: true });
                    if (signal.aborted) abort();
                    try {
                        return normalize(await decision);
                    } catch {
                        return failed;
                    } finally {
                        signal.removeEventListener("abort", abort);
                    }
                },
            })
            .catch(() => {
                /* Session reset cancels the cached decision. */
            });
        return pending;
    } catch {
        return failed;
    }
}
export function can(
    resource: string,
    action: string,
    row?: PermissionRecord,
): boolean {
    return access(resource, action, row).allowed;
}
function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
export function usePermissionRevision() {
    return useSyncExternalStore(
        subscribe,
        () => revision,
        () => 0,
    );
}
export function useAccess(
    resource: string,
    action: string,
    row?: PermissionRecord,
): AccessState {
    usePermissionRevision();
    return access(resource, action, row);
}
