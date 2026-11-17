"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "@/lib/utils";

/** Base UI switch with nextHV's existing design tokens. */
export function Switch({
    className,
    ...props
}: SwitchPrimitive.Root.Props) {
    return (
        <SwitchPrimitive.Root
            data-slot="switch"
            data-size="default"
            className={cn(
                "peer group/switch relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-input after:absolute after:-inset-x-3 after:-inset-y-2 bg-input transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:border-primary data-checked:bg-primary data-disabled:cursor-not-allowed data-disabled:opacity-50",
                className,
            )}
            {...props}
        >
            <SwitchPrimitive.Thumb
                data-slot="switch-thumb"
                className="ml-0.5 size-3.5 rounded-full bg-background shadow-sm transition-transform data-checked:translate-x-4"
            />
        </SwitchPrimitive.Root>
    );
}
