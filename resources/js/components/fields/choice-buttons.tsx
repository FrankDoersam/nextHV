import { RadioGroup } from "@base-ui/react/radio-group";
import { Radio } from "@base-ui/react/radio";
import { ChoiceContent } from "./choice-content";
import type { ChoicePickerProps } from "./choice-picker";

/** Payment-method style selection: one value, keyboard navigation and disabled states. */
export function ChoiceButtons({
    id,
    value,
    options = [],
    onChange,
    disabled,
    onBlur,
    inputRef,
    ...aria
}: Pick<
    ChoicePickerProps,
    | "id"
    | "value"
    | "options"
    | "onChange"
    | "disabled"
    | "onBlur"
    | "inputRef"
    | "aria-label"
    | "aria-invalid"
    | "aria-describedby"
    | "aria-required"
>) {
    return (
        <RadioGroup
            id={id}
            value={value ?? null}
            onValueChange={onChange}
            disabled={disabled}
            onBlur={onBlur}
            {...aria}
            className="flex min-w-0 flex-wrap gap-2"
        >
            {options.map((option, index) => (
                <Radio.Root
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    inputRef={index === 0 ? inputRef : undefined}
                    className="flex min-w-0 max-w-full cursor-pointer items-center gap-2 rounded-lg border bg-card px-3 py-2.5 text-sm shadow-xs outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring data-checked:border-primary data-checked:bg-primary/5 data-checked:ring-1 data-checked:ring-primary data-disabled:cursor-not-allowed data-disabled:opacity-50"
                >
                    <ChoiceContent option={option} />
                </Radio.Root>
            ))}
        </RadioGroup>
    );
}
