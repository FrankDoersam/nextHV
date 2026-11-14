import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** One surface joins view navigation, controls, records and pagination. KPIs stay outside. */
export function CollectionSurface({
    navigation,
    compact = false,
    children,
}: {
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
            {navigation && (
                <div className={cn(!compact && "px-3 sm:px-4")}>
                    {navigation}
                </div>
            )}
            {children}
        </div>
    );
}
