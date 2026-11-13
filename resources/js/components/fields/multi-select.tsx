import { ChoicePicker, type ChoicePickerProps } from "./choice-picker";
import { CheckboxList } from "./checkbox-list";
/** Compatibility wrapper; new definitions use ChoicePicker / CheckboxList directly. */
export function MultiSelect({
    checkboxes,
    ...props
}: ChoicePickerProps & { checkboxes?: boolean }) {
    return checkboxes ? (
        <CheckboxList {...props} />
    ) : (
        <ChoicePicker {...props} multiple />
    );
}
