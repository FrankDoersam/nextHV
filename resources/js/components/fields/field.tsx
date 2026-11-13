import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { FieldDefinition, Values } from "@/framework/types";
import { useId } from "react";
import { Controller, useFormContext } from "react-hook-form";
import {
    DatePicker,
    MonthPicker,
    RangePicker,
    RelationPicker,
    TimeField,
} from "./pickers";
import { BaseField } from "./base-field";
import { CurrencyField } from "./currency-field";
import { MultiSelect } from "./multi-select";
export function ResourceField({
    definition: d,
    editing = false,
}: {
    definition: FieldDefinition;
    editing?: boolean;
}) {
    const { control } = useFormContext<Values>();
    const id = useId();
    const disabled = d.disabled || (editing && d.readonlyOnEdit);
    return (
        <Controller
            name={d.name}
            control={control}
            render={({ field, fieldState }) => {
                const common = {
                    id,
                    disabled,
                    "aria-invalid": !!fieldState.error,
                    "aria-describedby": [
                        d.description || d.lockedReason ? `${id}-help` : "",
                        fieldState.error ? `${id}-error` : "",
                    ]
                        .filter(Boolean)
                        .join(" "),
                    "aria-required": d.required,
                };
                const picker = {
                    ...common,
                    value: field.value,
                    onChange: field.onChange,
                };
                let input;
                switch (d.kind) {
                    case "relation":
                        input = (
                            <RelationPicker
                                {...picker}
                                resource={d.resource!}
                                labelField={d.labelField}
                                filters={d.filters}
                            />
                        );
                        break;
                    case "date":
                        input = <DatePicker {...picker} />;
                        break;
                    case "month":
                        input = <MonthPicker {...picker} />;
                        break;
                    case "time":
                        input = <TimeField {...picker} />;
                        break;
                    case "date-range":
                    case "month-range":
                        input = (
                            <RangePicker
                                {...picker}
                                month={d.kind === "month-range"}
                            />
                        );
                        break;
                    case "select":
                        input = (
                            <Select
                                value={String(field.value ?? "")}
                                onValueChange={field.onChange}
                                disabled={disabled}
                                items={d.options}
                            >
                                <SelectTrigger
                                    {...common}
                                    className="h-9 w-full bg-background"
                                >
                                    <SelectValue
                                        placeholder={
                                            d.placeholder ?? "Bitte auswählen"
                                        }
                                    />
                                </SelectTrigger>
                                <SelectContent>
                                    {d.options?.map((o) => (
                                        <SelectItem
                                            key={o.value}
                                            value={o.value}
                                        >
                                            {o.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        );
                        break;
                    case "multiselect":
                    case "checkbox-group":
                        input = (
                            <MultiSelect
                                {...picker}
                                options={d.options}
                                checkboxes={d.kind === "checkbox-group"}
                            />
                        );
                        break;
                    case "checkbox":
                        input = (
                            <Checkbox
                                {...common}
                                checked={!!field.value}
                                onCheckedChange={field.onChange}
                                onBlur={field.onBlur}
                                ref={field.ref}
                            />
                        );
                        break;
                    case "textarea":
                        input = (
                            <Textarea
                                {...common}
                                ref={field.ref}
                                value={String(field.value ?? "")}
                                onChange={field.onChange}
                                onBlur={field.onBlur}
                                rows={d.rows ?? 4}
                                minLength={d.minLength}
                                maxLength={d.maxLength}
                                placeholder={d.placeholder}
                                className="min-h-28 bg-background"
                            />
                        );
                        break;
                    case "currency":
                        input = (
                            <CurrencyField
                                {...picker}
                                ref={field.ref}
                                onBlur={field.onBlur}
                                min={d.min}
                                max={d.max}
                                currency={d.currency}
                                locale={d.locale}
                            />
                        );
                        break;
                    case "number":
                        input = (
                            <Input
                                {...common}
                                ref={field.ref}
                                type="number"
                                inputMode="decimal"
                                step={d.step ?? "any"}
                                min={d.min}
                                max={d.max}
                                value={
                                    field.value == null
                                        ? ""
                                        : String(field.value)
                                }
                                onChange={(e) =>
                                    field.onChange(
                                        e.target.value === ""
                                            ? null
                                            : Number(e.target.value),
                                    )
                                }
                                onBlur={field.onBlur}
                                className="h-9 bg-background"
                            />
                        );
                        break;
                    default:
                        input = (
                            <Input
                                {...common}
                                ref={field.ref}
                                type={d.kind === "email" ? "email" : "text"}
                                value={String(field.value ?? "")}
                                onChange={field.onChange}
                                onBlur={field.onBlur}
                                maxLength={d.maxLength}
                                minLength={d.minLength}
                                placeholder={d.placeholder}
                                className="h-9 bg-background"
                            />
                        );
                }
                const counter =
                    d.kind === "textarea"
                        ? `${String(field.value ?? "").length}${d.maxLength ? ` / ${d.maxLength}` : ""} Zeichen${d.minLength ? ` · min. ${d.minLength}` : ""}`
                        : undefined;
                return (
                    <BaseField
                        id={id}
                        label={d.label}
                        required={d.required}
                        help={d.help}
                        description={d.description}
                        lockedReason={d.lockedReason}
                        error={fieldState.error?.message}
                        wide={
                            d.kind === "textarea" || d.kind === "checkbox-group"
                        }
                        counter={counter}
                    >
                        {input}
                    </BaseField>
                );
            }}
        />
    );
}
