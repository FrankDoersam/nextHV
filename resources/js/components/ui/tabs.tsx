"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cva, type VariantProps } from "class-variance-authority";

function Tabs({
    className,
    orientation = "horizontal",
    ...props
}: TabsPrimitive.Root.Props) {
    return (
        <TabsPrimitive.Root
            data-slot="tabs"
            orientation={orientation}
            className={cn(
                "group/tabs flex w-full min-w-0 gap-2 data-[orientation=horizontal]:flex-col data-[orientation=vertical]:flex-row",
                className,
            )}
            {...props}
        />
    );
}

const tabsListVariants = cva(
    "group/tabs-list inline-flex w-fit shrink-0 items-center rounded-lg p-[3px] text-muted-foreground data-[orientation=horizontal]:h-8 data-[orientation=vertical]:flex-col data-[variant=line]:rounded-none",
    {
        variants: {
            variant: {
                default: "bg-muted",
                line: "gap-1 bg-transparent p-0",
            },
        },
        defaultVariants: {
            variant: "default",
        },
    },
);

function TabsList({
    className,
    variant = "default",
    responsive = false,
    ...props
}: TabsPrimitive.List.Props &
    VariantProps<typeof tabsListVariants> & { responsive?: boolean }) {
    return (
        <TabsPrimitive.List
            data-slot="tabs-list"
            data-variant={variant}
            className={cn(
                tabsListVariants({ variant }),
                className,
                responsive &&
                    "w-full min-w-0 flex-wrap justify-start gap-x-1 gap-y-0 data-[orientation=horizontal]:h-auto [&>[data-slot=tabs-trigger]]:h-11 [&>[data-slot=tabs-trigger]]:max-w-full [&>[data-slot=tabs-trigger]]:whitespace-normal [&>[data-slot=tabs-trigger]]:text-left",
            )}
            {...props}
        />
    );
}

function TabsTrigger({
    className,
    icon: Icon,
    icons = true,
    children,
    ...props
}: TabsPrimitive.Tab.Props & { icon?: LucideIcon; icons?: boolean }) {
    return (
        <TabsPrimitive.Tab
            data-slot="tabs-trigger"
            className={cn(
                "relative inline-flex h-full shrink-0 items-center justify-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 data-[orientation=vertical]:w-full data-[orientation=vertical]:justify-start [&_svg]:size-3.5 [&_svg]:shrink-0",
                "group-data-[variant=default]/tabs-list:data-active:bg-card group-data-[variant=default]/tabs-list:data-active:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-xs",
                "group-data-[variant=line]/tabs-list:rounded-none group-data-[variant=line]/tabs-list:data-active:text-primary",
                "after:pointer-events-none after:absolute after:bg-primary after:opacity-0 data-[orientation=horizontal]:after:inset-x-3 data-[orientation=horizontal]:after:bottom-0 data-[orientation=horizontal]:after:h-0.5 data-[orientation=vertical]:after:inset-y-2 data-[orientation=vertical]:after:right-0 data-[orientation=vertical]:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
                className,
            )}
            {...props}
        >
            {icons && Icon && <Icon aria-hidden="true" />}
            {children}
        </TabsPrimitive.Tab>
    );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
    return (
        <TabsPrimitive.Panel
            data-slot="tabs-content"
            className={cn(
                "w-full min-w-0 flex-1 text-xs/relaxed outline-none",
                className,
            )}
            {...props}
        />
    );
}

export { Tabs, TabsContent, TabsList, tabsListVariants, TabsTrigger };
