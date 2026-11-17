import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Base UI / ReUI Nova item anatomy, shared by upload and file lists. */
const itemClass = "group/item flex w-full flex-wrap items-center gap-3 rounded-lg border border-border bg-background p-3 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";
export function Item({ className, ...props }: ComponentProps<"div">) {
    return <div data-slot="item" data-variant="outline" className={cn(itemClass, className)} {...props} />;
}
export function ItemButton({ className, ...props }: ComponentProps<"button">) {
    return <button data-slot="item" data-variant="outline" className={cn(itemClass, "cursor-pointer disabled:cursor-not-allowed disabled:opacity-50", className)} {...props} />;
}
export function ItemGroup({ className, ...props }: ComponentProps<"div">) {
    return <div data-slot="item-group" className={cn("flex w-full flex-col gap-2", className)} {...props} />;
}
export function ItemMedia({ className, ...props }: ComponentProps<"div">) {
    return <div data-slot="item-media" className={cn("flex shrink-0 items-center justify-center text-muted-foreground", className)} {...props} />;
}
export function ItemContent({ className, ...props }: ComponentProps<"div">) {
    return <div data-slot="item-content" className={cn("flex min-w-0 flex-1 flex-col gap-1", className)} {...props} />;
}
export function ItemTitle({ className, ...props }: ComponentProps<"div">) {
    return <div data-slot="item-title" className={cn("min-w-0 truncate font-medium", className)} {...props} />;
}
export function ItemDescription({ className, ...props }: ComponentProps<"p">) {
    return <p data-slot="item-description" className={cn("text-sm font-normal text-muted-foreground", className)} {...props} />;
}
export function ItemActions({ className, ...props }: ComponentProps<"div">) {
    return <div data-slot="item-actions" className={cn("flex shrink-0 items-center gap-2", className)} {...props} />;
}