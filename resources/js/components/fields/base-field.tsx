import { Button } from "@/components/ui/button";
import {
    Field,
    FieldContent,
    FieldDescription,
    FieldError,
    FieldLabel,
} from "@/components/ui/field";
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
    const heading = (
        <div className="flex min-w-0 items-center gap-1.5">
            <FieldLabel htmlFor={id} id={`${id}-label`}>
                {label}
                {required && (
                    <span aria-hidden className="text-destructive">
                        *
                    </span>
                )}
            </FieldLabel>
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
                        <Info aria-hidden="true" />
                    </PopoverTrigger>
                    <PopoverContent>{help}</PopoverContent>
                </Popover>
            )}
            {lockedReason && (
                <LockKeyhole
                    aria-label={lockedReason}
                    className="size-3 text-muted-foreground"
                />
            )}
        </div>
    );
    const details = (
        <>
            {(description || lockedReason || counter) && (
                <div className="flex items-start justify-between gap-3">
                    <FieldDescription id={`${id}-help`}>
                        {lockedReason ?? description}
                    </FieldDescription>
                    {counter && (
                        <FieldDescription
                            aria-live="polite"
                            className="shrink-0 tabular-nums"
                        >
                            {counter}
                        </FieldDescription>
                    )}
                </div>
            )}
            <FieldError id={`${id}-error`}>{error}</FieldError>
        </>
    );
    return (
        <Field
            orientation={inline ? "horizontal" : "vertical"}
            data-invalid={!!error}
            className={cn("min-w-0", wide && "col-span-full")}
        >
            {inline ? (
                <>
                    {children}
                    <FieldContent>
                        {heading}
                        {details}
                    </FieldContent>
                </>
            ) : (
                <>
                    {heading}
                    <div data-slot="field-control" className="min-w-0">
                        {children}
                    </div>
                    {details}
                </>
            )}
        </Field>
    );
}
