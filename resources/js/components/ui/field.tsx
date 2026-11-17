import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** ReUI Nova field grouping/spacing for forms, including horizontal switches. */
export function FieldGroup({ className, ...props }: ComponentProps<"div">) {
    return <div data-slot="field-group" className={cn("grid w-full gap-5", className)} {...props} />;
}
export function Field({
    className,
    orientation = "vertical",
    ...props
}: ComponentProps<"div"> & { orientation?: "horizontal" | "vertical" }) {
    return <div data-slot="field" data-orientation={orientation}
        className={cn("group/field flex w-full", orientation === "horizontal" ? "flex-row items-start gap-3" : "flex-col gap-2", className)} {...props} />;
}
export function FieldContent({ className, ...props }: ComponentProps<"div">) {
    return <div data-slot="field-content" className={cn("flex min-w-0 flex-1 flex-col gap-0.5 leading-snug", className)} {...props} />;
}
export function FieldLabel({ className, ...props }: ComponentProps<"label">) {
    return <label data-slot="field-label" className={cn("text-sm font-medium leading-normal select-none", className)} {...props} />;
}
export function FieldDescription({ className, ...props }: ComponentProps<"p">) {
    return <p data-slot="field-description" className={cn("text-sm leading-normal text-muted-foreground", className)} {...props} />;
}