"use client";

import { Radio } from "@base-ui/react/radio";
import { RadioGroup as GroupPrimitive } from "@base-ui/react/radio-group";
import { cn } from "@/lib/utils";

export function RadioGroup({
    className,
    ...props
}: GroupPrimitive.Props) {
    return <GroupPrimitive data-slot="radio-group" className={cn("cn-radio-group grid gap-2", className)} {...props} />;
}
export function RadioGroupItem({
    className,
    ...props
}: Radio.Root.Props) {
    return (
        <Radio.Root
            data-slot="radio-group-item"
            className={cn(
                "cn-radio-group-item peer relative flex size-4 shrink-0 items-center justify-center rounded-full border border-input bg-background outline-none after:absolute after:-inset-2 focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:border-primary data-checked:bg-primary data-disabled:opacity-50",
                className,
            )}
            {...props}
        >
            <Radio.Indicator data-slot="radio-group-indicator" className="cn-radio-group-indicator relative flex size-4 items-center justify-center">
                <span className="cn-radio-group-indicator-icon" />
            </Radio.Indicator>
        </Radio.Root>
    );
}
