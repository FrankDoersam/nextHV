import { parseRecordId } from "@/framework/record-id";
import type { ReactNode } from "react";
import { useParams } from "react-router";
import { EmptyState, Loading } from "@/components/blocks/content";
import { useAccess, type PermissionRecord } from "./permissions";

/** A UI boundary only. Every API endpoint still needs its own server policy. */
export function PermissionBoundary({
    resource,
    action,
    row,
    children,
}: {
    resource: string;
    action: string;
    row?: PermissionRecord;
    children: ReactNode;
}) {
    const decision = useAccess(resource, action, row);
    if (decision.pending) return <Loading />;
    if (!decision.allowed)
        return (
            <EmptyState
                title="Kein Zugriff"
                description={
                    decision.reason ??
                    "Für diesen Bereich fehlt die Berechtigung."
                }
            />
        );
    return children;
}
export function ResourceRouteBoundary({
    resource,
    detail = false,
    children,
}: {
    resource: string;
    detail?: boolean;
    children: ReactNode;
}) {
    const { id } = useParams();
    return (
        <PermissionBoundary
            resource={resource}
            action={detail ? "view" : "list"}
            row={detail && id ? { id: parseRecordId(id) ?? "" } : undefined}
        >
            {children}
        </PermissionBoundary>
    );
}
