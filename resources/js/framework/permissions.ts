import type { RecordData } from "./types";

export type PermissionDecision =
    | boolean
    | { allowed: boolean; reason?: string };

export interface PermissionAdapter {
    can: (
        resource: string,
        action: string,
        row?: RecordData,
    ) => PermissionDecision;
}

export const permissionConfig: {
    enabled: boolean;
    adapter: PermissionAdapter;
} = { enabled: false, adapter: { can: () => true } };

/** UI decisions can carry a denial reason; the Laravel policy remains the security boundary. */
export function access(
    resource: string,
    action: string,
    row?: RecordData,
): PermissionDecision {
    return !permissionConfig.enabled
        ? true
        : permissionConfig.adapter.can(resource, action, row);
}

export function can(resource: string, action: string, row?: RecordData): boolean {
    const decision = access(resource, action, row);
    return typeof decision === "boolean" ? decision : decision.allowed;
}
