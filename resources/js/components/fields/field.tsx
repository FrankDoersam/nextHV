import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
export function ResourceField({
    definition,
    editing = false,
}: {
    definition: FieldDefinition;
    editing?: boolean;
}) {
    const { control } = useFormContext<Values>();
    const d = definition;
    const id = useId();
    const disabled = editing && d.readonlyOnEdit;
    return (
        <Controller
            name={d.name}
            control={control}
            render={({ field, fieldState }) => {
                const common = {
                    id,
                    disabled,
                    "aria-invalid": !!fieldState.error,
                    "aria-describedby": `${id}-help ${id}-error`,
                };
                let input;
                switch (d.kind) {
                    case "relation":
                        input = (
                            <RelationPicker
                                {...common}
                                resource={d.resource!}
                                value={field.value}
                                onChange={field.onChange}
                                labelField={d.labelField}
                                filters={d.filters}
                            />
                        );
                        break;
                    case "date":
                        input = (
                            <DatePicker
                                {...common}
                                value={field.value}
                                onChange={field.onChange}
                            />
                        );
                        break;
                    case "month":
                        input = (
                            <MonthPicker
                                id={id}
                                value={field.value}
                                onChange={field.onChange}
                            />
                        );
                        break;
                    case "date-range":
                    case "month-range":
                        input = (
                            <RangePicker
                                id={id}
                                value={field.value}
                                onChange={field.onChange}
                                month={d.kind === "month-range"}
                            />
                        );
                        break;
                    case "time":
                        input = (
                            <TimeField
                                id={id}
                                value={field.value}
                                onChange={field.onChange}
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
                                <SelectTrigger {...common} className="w-full">
                                    <SelectValue placeholder="Bitte auswählen" />
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
                    case "checkbox":
                        input = (
                            <Checkbox
                                {...common}
                                checked={!!field.value}
                                onCheckedChange={field.onChange}
                            />
                        );
                        break;
                    case "textarea":
                        input = (
                            <Textarea
                                {...common}
                                value={String(field.value ?? "")}
                                onChange={field.onChange}
                                onBlur={field.onBlur}
                                rows={4}
                                maxLength={d.maxLength}
                            />
                        );
                        break;
                    case "currency":
                    case "number":
                        input = (
                            <div className="relative">
                                <Input
                                    {...common}
                                    ref={field.ref}
                                    type="number"
                                    inputMode="decimal"
                                    step={
                                        d.kind === "currency"
                                            ? "0.01"
                                            : (d.step ?? "any")
                                    }
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
                                    className={
                                        d.kind === "currency"
                                            ? "pr-14"
                                            : undefined
                                    }
                                />
                                {d.kind === "currency" && (
                                    <span className="pointer-events-none absolute right-3 top-2.5 text-xs text-muted-foreground">
                                        EUR
                                    </span>
                                )}
                            </div>
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
                            />
                        );
                }
                return (
                    <div
                        className={
                            d.kind === "textarea"
                                ? "space-y-2 sm:col-span-2"
                                : "space-y-2"
                        }
                    >
                        <Label htmlFor={id}>
                            {d.label}
                            {d.required && (
                                <span className="text-destructive">*</span>
                            )}
                        </Label>
                        {input}
                        {d.description && (
                            <p
                                id={`${id}-help`}
                                className="text-[11px] leading-5 text-muted-foreground"
                            >
                                {d.description}
                            </p>
                        )}
                        {fieldState.error && (
                            <p
                                id={`${id}-error`}
                                role="alert"
                                className="text-xs text-destructive"
                            >
                                {fieldState.error.message}
                            </p>
                        )}
                    </div>
                );
            }}
        />
    );
}
