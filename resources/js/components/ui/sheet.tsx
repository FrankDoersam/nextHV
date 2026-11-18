"use client";

import { cn } from "@/lib/utils";
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import * as React from "react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ItemMedia } from "@/components/ui/item";

export type SheetSize = "compact" | "details" | "form" | "wide" | "navigation";
const widths: Record<SheetSize, string> = {
    compact: "24rem",
    details: "36rem",
    form: "48rem",
    wide: "64rem",
    navigation: "18rem",
};

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
    return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
    return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
    return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
    return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
    return (
        <SheetPrimitive.Backdrop
            data-slot="sheet-overlay"
            className={cn(
                "cn-sheet-overlay fixed inset-0 z-50 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0",
                className,
            )}
            {...props}
        />
    );
}

/** All application sheets share Nova's viewport edge and surface; size only describes their content. */
function SheetContent({
    className,
    children,
    side = "right",
    size = "compact",
    showCloseButton = true,
    closeLabel = "Schließen",
    stacked = false,
    style,
    ...props
}: SheetPrimitive.Popup.Props & {
    side?: "top" | "right" | "bottom" | "left";
    size?: SheetSize;
    showCloseButton?: boolean;
    closeLabel?: string;
    stacked?: boolean;
}) {
    return (
        <SheetPortal>
            <SheetOverlay />
            <SheetPrimitive.Popup
                data-slot="sheet-content"
                data-side={side}
                data-size={size}
                data-stacked={stacked || undefined}
                className={cn(
                    "cn-sheet-content min-h-0 gap-0 overflow-hidden outline-none data-ending-style:opacity-0 data-starting-style:opacity-0 data-[side=bottom]:max-h-dvh data-[side=bottom]:data-ending-style:translate-y-[2.5rem] data-[side=bottom]:data-starting-style:translate-y-[2.5rem] data-[side=left]:h-dvh data-[side=left]:w-[min(100vw,var(--sheet-width))] data-[side=left]:data-ending-style:translate-x-[-2.5rem] data-[side=left]:data-starting-style:translate-x-[-2.5rem] data-[side=right]:h-dvh data-[side=right]:w-[min(100vw,var(--sheet-width))] data-[side=right]:data-ending-style:translate-x-[2.5rem] data-[side=right]:data-starting-style:translate-x-[2.5rem] data-[side=top]:max-h-dvh data-[side=top]:data-ending-style:translate-y-[-2.5rem] data-[side=top]:data-starting-style:translate-y-[-2.5rem] data-[side=left]:sm:max-w-none data-[side=right]:sm:max-w-none",
                    size === "navigation" &&
                        "bg-sidebar text-sidebar-foreground",
                    "origin-right data-stacked:-translate-x-4 data-stacked:scale-[0.97] data-stacked:brightness-95 motion-reduce:transition-none",
                    className,
                )}
                style={
                    {
                        ...style,
                        "--sheet-width": widths[size],
                    } as React.CSSProperties
                }
                {...props}
            >
                {children}
                {showCloseButton && (
                    <SheetPrimitive.Close
                        data-slot="sheet-close"
                        render={
                            <Button
                                variant="ghost"
                                className="cn-sheet-close"
                                size="icon-sm"
                            />
                        }
                    >
                        <XIcon />
                        <span className="sr-only">{closeLabel}</span>
                    </SheetPrimitive.Close>
                )}
            </SheetPrimitive.Popup>
        </SheetPortal>
    );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="sheet-header"
            className={cn(
                "cn-sheet-header flex shrink-0 flex-col pt-[max(1rem,env(safe-area-inset-top))]",
                className,
            )}
            {...props}
        />
    );
}

function SheetActions({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="sheet-actions"
            className={cn("flex shrink-0 items-center gap-1", className)}
            {...props}
        />
    );
}

function SheetHeading({
    title,
    description,
    badge,
    icon,
    actions,
    reference,
}: {
    title: React.ReactNode;
    description?: React.ReactNode;
    badge?: React.ReactNode;
    icon?: React.ReactNode;
    actions?: React.ReactNode;
    reference?: React.ReactNode;
}) {
    return (
        <div className="flex min-w-0 flex-col gap-2">
            {reference && (
                <div className="flex min-w-0 items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1 font-mono text-xs">
                        {reference}
                    </div>
                    {actions}
                </div>
            )}
            <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                    {icon && <ItemMedia>{icon}</ItemMedia>}
                    <div className="min-w-0 space-y-0.5">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            {title}
                            {badge}
                        </div>
                        {description}
                    </div>
                </div>
                {!reference && actions}
            </div>
        </div>
    );
}

function SheetToolbar({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="sheet-toolbar"
            className={cn("min-w-0 shrink-0 p-4", className)}
            {...props}
        />
    );
}

function SheetWorkspace({
    sidebar,
    sidebarSlot = "sheet-sidebar",
    children,
}: {
    sidebar?: React.ReactNode;
    sidebarSlot?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="@container/overlay flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col @min-[48rem]/overlay:flex-row">
                {sidebar && (
                    <aside
                        data-slot={sidebarSlot}
                        className="w-full min-w-0 shrink-0 border-b bg-muted/30 p-4 @min-[48rem]/overlay:w-60 @min-[48rem]/overlay:overflow-y-auto @min-[48rem]/overlay:border-r @min-[48rem]/overlay:border-b-0"
                    >
                        {sidebar}
                    </aside>
                )}
                {children}
            </div>
        </div>
    );
}

function SheetBody({
    className,
    inset = true,
    scroll = "auto",
    ...props
}: React.ComponentProps<"div"> & {
    inset?: boolean;
    scroll?: "auto" | "managed";
}) {
    return (
        <div
            data-slot="sheet-body"
            className={cn(
                "@container/form min-h-0 min-w-0 flex-1 space-y-4 overscroll-contain",
                inset && "p-4",
                scroll === "managed"
                    ? "flex flex-col overflow-hidden"
                    : "overflow-y-auto scroll-py-4",
                className,
            )}
            {...props}
        />
    );
}

function SheetTabBar({
    className,
    children,
    inset = true,
    ...props
}: React.ComponentProps<"div"> & { inset?: boolean }) {
    return (
        <div
            data-slot="sheet-tabs"
            className={cn("min-w-0 shrink-0", inset && "px-4", className)}
            {...props}
        >
            <TabsList responsive variant="line">
                {children}
            </TabsList>
        </div>
    );
}

function SheetTabs({ className, ...props }: React.ComponentProps<typeof Tabs>) {
    return (
        <Tabs className={cn("min-h-0 flex-1 gap-0", className)} {...props} />
    );
}

function SheetTabTrigger(props: React.ComponentProps<typeof TabsTrigger>) {
    return <TabsTrigger {...props} />;
}

function SheetFooter({
    className,
    leading,
    children,
    ...props
}: React.ComponentProps<"div"> & { leading?: React.ReactNode }) {
    return (
        <div
            data-slot="sheet-footer"
            className={cn(
                "cn-sheet-footer flex shrink-0 flex-row flex-wrap items-center justify-end pb-[max(1rem,env(safe-area-inset-bottom))]",
                className,
            )}
            {...props}
        >
            {leading && (
                <div className="me-auto flex min-w-0 flex-wrap items-center gap-2">
                    {leading}
                </div>
            )}
            <div className="ms-auto flex flex-wrap items-center justify-end gap-2">
                {children}
            </div>
        </div>
    );
}

function SheetHint({ className, ...props }: React.ComponentProps<"span">) {
    return (
        <span
            data-slot="sheet-hint"
            className={cn(
                "flex items-center gap-2 text-xs text-muted-foreground [&_svg]:size-3.5",
                className,
            )}
            {...props}
        />
    );
}

/** The same Nova Card anatomy serves field groups, summaries and other sheet sections. */
function SheetSection({
    title,
    description,
    actions,
    hideHeading = false,
    inset = true,
    children,
    ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
    title?: React.ReactNode;
    description?: React.ReactNode;
    actions?: React.ReactNode;
    hideHeading?: boolean;
    inset?: boolean;
}) {
    return (
        <Card size="sm" data-slot="sheet-section" {...props}>
            {((!hideHeading && (title || description)) || actions) && (
                <CardHeader>
                    {!hideHeading && title && <CardTitle>{title}</CardTitle>}
                    {!hideHeading && description && (
                        <CardDescription>{description}</CardDescription>
                    )}
                    {actions && <CardAction>{actions}</CardAction>}
                </CardHeader>
            )}
            <CardContent
                className={cn(
                    "min-w-0 space-y-4",
                    !inset && "overflow-x-auto px-0",
                )}
            >
                {children}
            </CardContent>
        </Card>
    );
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
    return (
        <SheetPrimitive.Title
            data-slot="sheet-title"
            className={cn(
                "cn-font-heading cn-sheet-title min-w-0 break-words",
                className,
            )}
            {...props}
        />
    );
}

function SheetDescription({
    className,
    ...props
}: SheetPrimitive.Description.Props) {
    return (
        <SheetPrimitive.Description
            data-slot="sheet-description"
            className={cn("cn-sheet-description break-words", className)}
            {...props}
        />
    );
}

export {
    Sheet,
    SheetActions,
    SheetBody,
    SheetClose,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetHeading,
    SheetHint,
    SheetSection,
    SheetTabBar,
    SheetTabs,
    SheetTabTrigger,
    SheetTitle,
    SheetToolbar,
    SheetTrigger,
    SheetWorkspace,
};
