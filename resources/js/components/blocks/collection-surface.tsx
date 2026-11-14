import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A single frame for query metrics, views, controls, records and pagination. */
export function CollectionSurface({
    summary,
    navigation,
    compact = false,
    children,
}: {
    summary?: ReactNode;
    navigation?: ReactNode;
    compact?: boolean;
    children: ReactNode;
}) {
    return (
        <div
            data-slot="collection-surface"
            className={cn(
                "flex min-w-0 flex-col",
                !compact &&
                    "rounded-xl border bg-card shadow-xs md:min-h-0 md:flex-1",
            )}
        >
            {summary && (
                <div
                    className={cn(
                        "shrink-0 overflow-hidden border-b",
                        !compact && "rounded-t-xl",
                    )}
                >
                    {summary}
                </div>
            )}
            {navigation && (
                <div className={cn(!compact && "px-3 sm:px-4")}>
                    {navigation}
                </div>
            )}
            {children}
        </div>
    );
}
