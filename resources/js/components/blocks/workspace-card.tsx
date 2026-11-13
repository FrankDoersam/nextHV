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
            className="h-full bg-muted/70"
        >
            <FrameHeader className="flex-row items-center justify-between gap-2">
                <FrameTitle className="flex items-center gap-2 font-mono text-[10px] font-normal uppercase tracking-wider text-muted-foreground [&>svg]:size-3">
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
                <FrameFooter className="flex-row flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
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
                    ? "grid items-stretch gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]"
                    : "grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            }
        >
            {children}
        </div>
    );
}
