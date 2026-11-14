import {
    NumberField,
    NumberFieldGroup,
    NumberFieldInput,
    NumberFieldIncrement,
    NumberFieldDecrement,
} from "@/components/reui/number-field";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export function NumberStepper({
    value,
    onChange,
    min,
    max,
    step = 1,
    locale = "de-DE",
    steppers = true,
    embedded = false,
    id,
    disabled,
    label,
    ...input
}: Omit<
    ComponentProps<typeof NumberFieldInput>,
    "value" | "onChange" | "min" | "max" | "step"
> & {
    value: unknown;
    onChange: (value: number | null) => void;
    min?: number;
    max?: number;
    step?: number;
    locale?: string;
    steppers?: boolean;
    embedded?: boolean;
    label?: string;
}) {
    return (
        <NumberField
            id={id}
            value={
                typeof value === "number" && Number.isFinite(value)
                    ? value
                    : null
            }
            onValueChange={onChange}
            min={min}
            max={max}
            step={step}
            locale={locale}
            disabled={disabled}
            className={embedded ? "min-w-0 flex-1" : undefined}
        >
            <NumberFieldGroup
                className={cn(
                    "h-9 bg-card",
                    embedded &&
                        "h-full border-0 bg-transparent focus-within:ring-0 focus-within:border-transparent",
                )}
                aria-invalid={input["aria-invalid"]}
            >
                {steppers && (
                    <NumberFieldDecrement
                        aria-label={`${label ?? "Wert"} verringern`}
                    />
                )}
                <NumberFieldInput {...input} />
                {steppers && (
                    <NumberFieldIncrement
                        aria-label={`${label ?? "Wert"} erhöhen`}
                    />
                )}
            </NumberFieldGroup>
        </NumberField>
    );
}
