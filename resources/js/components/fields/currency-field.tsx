import {
    NumberField,
    NumberFieldGroup,
    NumberFieldInput,
} from "@/components/reui/number-field";
import { useId, type ComponentProps } from "react";
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
    const currencyId = useId();
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
                style: "decimal",
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            }}
        >
            <NumberFieldGroup className="h-(--control-height) bg-card">
                <NumberFieldInput
                    {...input}
                    aria-describedby={[input["aria-describedby"], currencyId]
                        .filter(Boolean)
                        .join(" ")}
                    className="text-left"
                />
                <span
                    id={currencyId}
                    data-slot="currency-suffix"
                    className="flex shrink-0 items-center pr-3 text-xs font-medium text-muted-foreground select-none"
                >
                    {currency}
                </span>
            </NumberFieldGroup>
        </NumberField>
    );
}
