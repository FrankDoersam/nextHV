import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Shared ReUI Field layout for a switch and its associated label. */
export function Field({
    className,
    orientation = "vertical",
    ...props
}: ComponentProps<"div"> & { orientation?: "horizontal" | "vertical" }) {
    return (
        <div
            data-slot="field"
            data-orientation={orientation}
            className={cn(
                "group/field flex w-full gap-2",
                orientation === "horizontal" ? "flex-row items-center gap-3" : "flex-col",
                className,
            )}
            {...props}
        />
    );
}

export function FieldLabel({
    className,
    ...props
}: ComponentProps<"label">) {
    return (
        <label
            data-slot="field-label"
            className={cn("text-sm font-medium leading-normal select-none", className)}
            {...props}
        />
    );
}

export function FieldDescription({
    className,
    ...props
}: ComponentProps<"p">) {
    return (
        <p
            data-slot="field-description"
            className={cn("text-sm text-muted-foreground", className)}
            {...props}
        />
    );
}
