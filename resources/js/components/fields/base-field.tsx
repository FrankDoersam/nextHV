import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Info, LockKeyhole } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
export function BaseField({
    id,
    label,
    required,
    help,
    description,
    error,
    counter,
    wide,
    inline = false,
    lockedReason,
    children,
}: {
    id: string;
    label: string;
    required?: boolean;
    help?: string;
    description?: string;
    error?: string;
    counter?: ReactNode;
    wide?: boolean;
    inline?: boolean;
    lockedReason?: string;
    children: ReactNode;
}) {
    return (
        <div
            className={cn(
                "flex min-w-0 flex-col gap-2",
                wide && "col-span-full",
                inline && "justify-end",
            )}
        >
            <div
                className={cn(
                    "flex min-h-5 items-center gap-1.5",
                    inline && "min-h-9 gap-2.5 rounded-lg border bg-card px-3",
                )}
            >
                {inline && children}
                <Label htmlFor={id} id={`${id}-label`}>
                    {label}
                    {required && (
                        <span aria-hidden className="text-destructive">
                            *
                        </span>
                    )}
                </Label>
                {help && (
                    <Popover>
                        <PopoverTrigger
                            render={
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    aria-label={`Hilfe: ${label}`}
                                />
                            }
                        >
                            <Info className="size-3.5 text-muted-foreground" />
                        </PopoverTrigger>
                        <PopoverContent className="max-w-72 text-sm leading-6">
                            {help}
                        </PopoverContent>
                    </Popover>
                )}
                {lockedReason && (
                    <LockKeyhole
                        aria-label={lockedReason}
                        className="size-3 text-muted-foreground"
                    />
                )}
            </div>
            {!inline && (
                <div data-slot="field-control" className="min-w-0">
                    {children}
                </div>
            )}
            {(description || lockedReason || counter) && (
                <div className="flex items-start justify-between gap-3 text-xs leading-5 text-muted-foreground">
                    <p id={`${id}-help`}>{lockedReason ?? description}</p>
                    {counter && (
                        <span
                            className="shrink-0 tabular-nums"
                            aria-live="polite"
                        >
                            {counter}
                        </span>
                    )}
                </div>
            )}
            {error && (
                <p
                    id={`${id}-error`}
                    role="alert"
                    className="text-xs leading-5 text-destructive"
                >
                    {error}
                </p>
            )}
        </div>
    );
}
