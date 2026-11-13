import type { RecordData } from "./types";
export interface PermissionAdapter {
    can: (resource: string, action: string, row?: RecordData) => boolean;
}
export const permissionConfig: {
    enabled: boolean;
    adapter: PermissionAdapter;
} = { enabled: false, adapter: { can: () => true } };
export function can(resource: string, action: string, row?: RecordData) {
    return (
        !permissionConfig.enabled ||
        permissionConfig.adapter.can(resource, action, row)
    );
}
