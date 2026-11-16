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
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
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
    appearance = "frame",
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
    /** One Maia Card surface instead of a nested Frame + FramePanel. */
    appearance?: "frame" | "single";
}) {
    const header = !!(title || description || actions);
    if (appearance === "single") {
        return (
            <Card
                data-slot="content-card"
                size="sm"
                className={cn(
                    "min-w-0 gap-3",
                    compact && "gap-2",
                    grow && "min-h-0 flex-1 overflow-hidden",
                    fill && "h-full",
                )}
            >
                {header && (
                    <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            <CardTitle className="flex min-w-0 items-center gap-2 text-sm font-semibold [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground">
                                {icon}
                                {title}
                            </CardTitle>
                            {description && (
                                <CardDescription className="mt-1 text-xs leading-5">
                                    {description}
                                </CardDescription>
                            )}
                        </div>
                        {actions && (
                            <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
                                {actions}
                            </div>
                        )}
                    </CardHeader>
                )}
                <CardContent
                    className={cn(
                        "min-w-0",
                        flush && "px-0",
                        grow && "flex min-h-0 flex-1 flex-col overflow-hidden",
                    )}
                >
                    {children}
                </CardContent>
                {footer && (
                    <CardFooter className="flex flex-row flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs leading-5 text-muted-foreground">
                        {footer}
                    </CardFooter>
                )}
            </Card>
        );
    }
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
