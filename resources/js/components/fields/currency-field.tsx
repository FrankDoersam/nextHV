import {
    NumberField,
    NumberFieldGroup,
    NumberFieldInput,
} from "@/components/reui/number-field";
import type { ComponentProps } from "react";
/** Locale formatting belongs to Base UI. Form/API state remains a numeric Euro amount. */
export function CurrencyField({
    value,
    onChange,
    currency = "EUR",
    locale = "de-DE",
    min,
    max,
    disabled,
    id,
    ...input
}: Omit<
    ComponentProps<typeof NumberFieldInput>,
    "value" | "onChange" | "min" | "max"
> & {
    value: unknown;
    onChange: (value: number | null) => void;
    currency?: string;
    locale?: string;
    min?: number;
    max?: number;
}) {
    return (
        <NumberField
            id={id}
            locale={locale}
            value={
                typeof value === "number" && Number.isFinite(value)
                    ? value
                    : null
            }
            onValueChange={onChange}
            min={min}
            max={max}
            step={0.01}
            disabled={disabled}
            format={{
                style: "currency",
                currency,
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            }}
        >
            <NumberFieldGroup className="h-9 bg-background">
                <NumberFieldInput {...input} className="text-left" />
            </NumberFieldGroup>
        </NumberField>
    );
}
