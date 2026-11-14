import type { ReactNode } from "react";
import { Link } from "react-router";

/** Shared relation navigation for tables and key/value content. */
export function CellReference({
    resource,
    id,
    children,
}: {
    resource: string;
    id: unknown;
    children: ReactNode;
}) {
    return Number.isInteger(Number(id)) && Number(id) > 0 ? (
        <Link
            to={`/${resource}/${id}`}
            className="block min-w-0 max-w-full truncate text-left font-medium text-primary decoration-primary/40 underline-offset-4 hover:underline"
            onDoubleClick={(event) => event.stopPropagation()}
        >
            {children}
        </Link>
    ) : (
        <>{children}</>
    );
}
