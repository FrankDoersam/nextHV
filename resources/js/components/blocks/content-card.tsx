import type { ReactNode } from "react";
import {
    Frame,
    FrameHeader,
    FrameTitle,
    FrameDescription,
    FramePanel,
    FrameFooter,
} from "@/components/reui/frame";
import { cn } from "@/lib/utils";
/** One REUI frame anatomy for dashboard, forms and record cards. */
export function ContentCard({
    title,
    description,
    icon,
    actions,
    footer,
    children,
    compact = false,
    flush = false,
    grow = false,
    fill = false,
}: {
    title?: string;
    description?: string;
    icon?: ReactNode;
    actions?: ReactNode;
    footer?: ReactNode;
    children: ReactNode;
    compact?: boolean;
    flush?: boolean;
    grow?: boolean;
    fill?: boolean;
}) {
    const header = !!(title || description || actions);
    return (
        <Frame
            data-slot="content-card"
            spacing={compact ? "sm" : "default"}
            dense={!header}
            className={cn(
                "min-w-0 bg-muted/40",
                grow && "min-h-0 flex-1 overflow-hidden",
                fill && "h-full",
            )}
        >
            {header && (
                <FrameHeader className="min-w-0 flex-row flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <FrameTitle className="flex min-w-0 items-center gap-2 text-sm font-semibold [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground">
                            {icon}
                            {title}
                        </FrameTitle>
                        {description && (
                            <FrameDescription className="mt-1 text-xs leading-5">
                                {description}
                            </FrameDescription>
                        )}
                    </div>
                    {actions && (
                        <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
                            {actions}
                        </div>
                    )}
                </FrameHeader>
            )}
            <FramePanel
                className={cn(
                    "min-w-0",
                    compact ? "p-3" : "p-4 sm:p-5",
                    !header && "border-0",
                    flush && "p-0 sm:p-0",
                    grow && "flex min-h-0 flex-1 flex-col overflow-hidden",
                )}
            >
                {children}
            </FramePanel>
            {footer && (
                <FrameFooter className="flex-row flex-wrap items-center justify-between gap-2 text-xs leading-5 text-muted-foreground">
                    {footer}
                </FrameFooter>
            )}
        </Frame>
    );
}
