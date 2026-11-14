import {
    InputGroup,
    InputGroupInput,
    InputGroupAddon,
} from "@/components/ui/input-group";
import { FieldActions } from "@/framework/forms/form-action-scope";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
    dateControlError,
    dateRangeControlError,
} from "./pickers";
import { BaseField } from "./base-field";
import { CurrencyField } from "./currency-field";
import { ChoicePicker } from "./choice-picker";
import { NumberStepper } from "./number-stepper";
import { ChoiceButtons } from "./choice-buttons";
import { CheckboxList } from "./checkbox-list";
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
            rules={
                d.kind === "date" || d.kind === "date-range"
                    ? {
                          validate: (value) =>
                              disabled ||
                              (d.kind === "date"
                                  ? dateControlError(value, d)
                                  : dateRangeControlError(value, d)) ||
                              true,
                      }
                    : undefined
            }
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
                const hasActions = !!(
                    d.prefixActions?.length || d.suffixActions?.length
                );
                const TextInput = hasActions ? InputGroupInput : Input;
                let input;
                switch (d.kind) {
                    case "relation":
                        input = (
                            <RelationPicker
                                {...picker}
                                resource={d.resource!}
                                labelField={d.labelField}
                                filters={d.filters}
                                multiple={d.multiple}
                                clearable={d.clearable}
                                creatable={d.creatable}
                                displayText={d.displayText}
                                secondaryText={d.secondaryText}
                                optionMeta={d.optionMeta}
                                selectedDisplay={d.selectedDisplay}
                                maxSelected={d.maxSelected}
                                placeholder={d.placeholder}
                                inputRef={field.ref}
                                onBlur={field.onBlur}
                            />
                        );
                        break;
                    case "date":
                        input = (
                            <DatePicker
                                {...picker}
                                inputRef={field.ref}
                                onBlur={field.onBlur}
                                onInvalidInput={field.onChange}
                                clearable={d.clearable}
                                minDate={d.minDate}
                                maxDate={d.maxDate}
                            />
                        );
                        break;
                    case "month":
                        input = (
                            <MonthPicker
                                {...picker}
                                clearable={d.clearable}
                                minDate={d.minDate}
                                maxDate={d.maxDate}
                            />
                        );
                        break;
                    case "time":
                        input = <TimeField {...picker} />;
                        break;
                    case "date-range":
                    case "month-range":
                        input = (
                            <RangePicker
                                {...picker}
                                inputRef={field.ref}
                                onBlur={field.onBlur}
                                onInvalidInput={field.onChange}
                                month={d.kind === "month-range"}
                                clearable={d.clearable}
                                minDate={d.minDate}
                                maxDate={d.maxDate}
                            />
                        );
                        break;
                    case "choice-buttons":
                        input = (
                            <ChoiceButtons
                                {...picker}
                                aria-label={d.label}
                                options={d.options}
                                inputRef={field.ref}
                                onBlur={field.onBlur}
                            />
                        );
                        break;
                    case "select":
                    case "multiselect":
                        input = (
                            <ChoicePicker
                                {...picker}
                                options={d.options}
                                selectedDisplay={d.selectedDisplay}
                                multiple={
                                    d.kind === "multiselect" || d.multiple
                                }
                                clearable={d.clearable}
                                maxSelected={d.maxSelected}
                                placeholder={d.placeholder}
                                inputRef={field.ref}
                                onBlur={field.onBlur}
                            />
                        );
                        break;
                    case "checkbox-group":
                    case "checkbox-cards":
                        input = (
                            <CheckboxList
                                {...picker}
                                aria-labelledby={`${id}-label`}
                                options={d.options}
                                layout={
                                    d.kind === "checkbox-cards"
                                        ? "cards"
                                        : "list"
                                }
                                searchable={d.searchable}
                                selectAll={d.selectAll}
                                maxSelected={d.maxSelected}
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
                                className="min-h-28 bg-card"
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
                            <NumberStepper
                                {...picker}
                                ref={field.ref}
                                onBlur={field.onBlur}
                                min={d.min}
                                max={d.max}
                                step={d.step}
                                locale={d.locale}
                                steppers={d.steppers}
                                embedded={hasActions}
                                label={d.label}
                            />
                        );
                        break;
                    default:
                        input = (
                            <TextInput
                                {...common}
                                ref={field.ref}
                                type={d.kind === "email" ? "email" : "text"}
                                value={String(field.value ?? "")}
                                onChange={field.onChange}
                                onBlur={field.onBlur}
                                maxLength={d.maxLength}
                                minLength={d.minLength}
                                placeholder={d.placeholder}
                                className={
                                    hasActions
                                        ? "h-full bg-transparent"
                                        : "h-9 bg-card"
                                }
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
                        inline={d.kind === "checkbox"}
                        required={d.required}
                        help={d.help}
                        description={d.description}
                        lockedReason={d.lockedReason}
                        error={fieldState.error?.message}
                        wide={
                            d.kind === "textarea" ||
                            d.kind === "checkbox-group" ||
                            d.kind === "checkbox-cards"
                        }
                        counter={counter}
                    >
                        {hasActions &&
                        [undefined, "text", "email", "number"].includes(
                            d.kind,
                        ) ? (
                            <InputGroup className="h-9 bg-card">
                                {d.prefixActions?.length ? (
                                    <InputGroupAddon align="inline-start">
                                        <FieldActions
                                            actions={d.prefixActions}
                                            disabled={disabled}
                                        />
                                    </InputGroupAddon>
                                ) : null}
                                {input}
                                {d.suffixActions?.length ? (
                                    <InputGroupAddon align="inline-end">
                                        <FieldActions
                                            actions={d.suffixActions}
                                            disabled={disabled}
                                        />
                                    </InputGroupAddon>
                                ) : null}
                            </InputGroup>
                        ) : (
                            input
                        )}
                    </BaseField>
                );
            }}
        />
    );
}
