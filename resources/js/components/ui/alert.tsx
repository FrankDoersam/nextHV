import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Alert({ className, ...props }: ComponentProps<"div">) {
    return <div role="alert" data-slot="alert" className={cn("relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-3 py-2.5 text-sm has-[>svg]:grid-cols-[12px_1fr] has-[>svg]:gap-x-2.5 [&>svg]:mt-0.5 [&>svg]:size-4", className)} {...props} />;
}
export function AlertTitle({ className, ...props }: ComponentProps<"div">) {
    return <div data-slot="alert-title" className={cn("col-start-2 min-h-4 font-medium tracking-tight", className)} {...props} />;
}
export function AlertDescription({ className, ...props }: ComponentProps<"div">) {
    return <div data-slot="alert-description" className={cn("col-start-2 text-sm text-muted-foreground [&_p]:leading-relaxed", className)} {...props} />;
}
