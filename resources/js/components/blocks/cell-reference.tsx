import type { ReactNode } from "react";
import { Cell } from "./cell";

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
        <Cell
            to={`/${resource}/${id}`}
            className="truncate"
            onDoubleClick={(event) => event.stopPropagation()}
        >
            {children}
        </Cell>
    ) : (
        <>{children}</>
    );
}
