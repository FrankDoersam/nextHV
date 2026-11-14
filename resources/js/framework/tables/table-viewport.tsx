import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** One definite-height vertical scroll owner; the footer is always its sibling. */
export function TableViewport({
    children,
    compact = false,
}: {
    children: ReactNode;
    compact?: boolean;
}) {
    return (
        <div
            data-slot="scroll-area-viewport"
            tabIndex={0}
            aria-label="Tabelleninhalt"
            className={cn(
                "min-h-0 min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain pb-1 [scrollbar-gutter:stable] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                compact ? "max-h-[30rem]" : "h-full",
            )}
        >
            {children}
        </div>
    );
}
