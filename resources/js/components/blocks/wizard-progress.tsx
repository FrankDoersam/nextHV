import { CStepper10 } from "@/components/examples/c-stepper-10";
import { FieldDescription, FieldGroup } from "@/components/ui/field";

/** Import flows share the same ReUI navigation as resource creation wizards. */
export function WizardProgress({
    steps,
    active,
    label = "Erfassungsschritte",
    onSelect,
    busy = false,
    panelId,
    navigationId,
}: {
    steps: { id: string; label: string; description?: string }[];
    active: number;
    label?: string;
    onSelect?: (index: number) => void;
    busy?: boolean;
    panelId?: string;
    navigationId?: string;
}) {
    return (
        <nav aria-label={label} data-slot="wizard-progress" className="min-w-0">
            <FieldGroup>
                <CStepper10
                    steps={steps}
                    active={active}
                    label={label}
                    onSelect={onSelect}
                    canNext={false}
                    busy={busy}
                    idPrefix={navigationId}
                    panelId={panelId}
                />
                <FieldDescription aria-live="polite" aria-atomic="true">
                    Schritt {active + 1} von {steps.length}
                </FieldDescription>
            </FieldGroup>
        </nav>
    );
}

export { WizardProgress as VerticalWizardProgress };
