import type { ReactNode } from "react";
import {
    Frame,
    FrameHeader,
    FrameTitle,
    FramePanel,
    FrameFooter,
} from "@/components/reui/frame";
import { cn } from "@/lib/utils";
export function WorkspaceCard({
    title,
    icon,
    actions,
    footer,
    children,
    compact = false,
}: {
    title: string;
    icon?: ReactNode;
    actions?: ReactNode;
    footer?: ReactNode;
    children: ReactNode;
    compact?: boolean;
}) {
    return (
        <Frame
            spacing={compact ? "sm" : "default"}
            className="min-w-0 h-full bg-muted/50"
        >
            <FrameHeader className="min-w-0 flex-row flex-wrap items-center justify-between gap-2">
                <FrameTitle className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground [&>svg]:size-3.5 [&>svg]:shrink-0">
                    {icon}
                    {title}
                </FrameTitle>
                {actions}
            </FrameHeader>
            <FramePanel
                className={cn("min-w-0", compact ? "p-3" : "p-4 lg:p-5")}
            >
                {children}
            </FramePanel>
            {footer && (
                <FrameFooter className="flex-row flex-wrap items-center justify-between gap-2 text-[11px] leading-5 text-muted-foreground">
                    {footer}
                </FrameFooter>
            )}
        </Frame>
    );
}
export function WorkspaceColumns({
    children,
    variant = "main",
}: {
    children: ReactNode;
    variant?: "main" | "metrics";
}) {
    return (
        <div
            className={
                variant === "main"
                    ? "grid min-w-0 items-stretch gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)] [&>*]:min-w-0 [&>*:only-child]:col-span-full"
                    : "grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0"
            }
        >
            {children}
        </div>
    );
}
