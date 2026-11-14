import { createContext, useContext, type ReactNode } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import type { ResourceAction } from "../actions";
import { ActionButtons, type ActionTarget } from "../action-controls";
const Scope = createContext<ActionTarget | null>(null);
export function FormActionScope({
    target,
    children,
}: {
    target: ActionTarget;
    children: ReactNode;
}) {
    return <Scope.Provider value={target}>{children}</Scope.Provider>;
}
/** Subscribe only action-bearing controls, so enabled rules always see the live form. */
export function FieldActions({
    actions,
    disabled,
}: {
    actions: ResourceAction[];
    disabled?: boolean;
}) {
    const target = useContext(Scope);
    const form = useFormContext();
    useWatch({ control: form.control });
    if (!target) return null;
    return (
        <ActionButtons
            actions={actions}
            target={{
                ...target,
                instance: {
                    ...target.instance,
                    form,
                    formResource: target.resource,
                },
            }}
            placement="field"
            iconOnly
            disabled={disabled}
        />
    );
}
