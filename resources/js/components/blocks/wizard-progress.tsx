import type { CSSProperties } from "react";
import { Check } from "lucide-react";
import {
    Stepper,
    StepperIndicator,
    StepperItem,
    StepperNav,
    StepperTitle,
} from "@/components/reui/stepper";

/** Shared progress for validated form sections and persisted multi-entity flows. */
export function WizardProgress({
    steps,
    active,
    label,
    description,
    onSelect,
    busy = false,
}: {
    steps: { id: string; label: string }[];
    active: number;
    label?: string;
    description?: string;
    onSelect?: (index: number) => void;
    busy?: boolean;
}) {
    return (
        <div className="@container/wizard min-w-0 space-y-3">
            {label && (
                <p className="text-xs font-medium text-muted-foreground">
                    {label}
                </p>
            )}
            <Stepper
                role="group"
                aria-orientation={undefined}
                aria-label={`Schritt ${active + 1} von ${steps.length}`}
                value={active + 1}
                indicators={{ completed: <Check className="size-4" /> }}
                style={{ "--wizard-steps": steps.length } as CSSProperties}
            >
                <StepperNav className="grid grid-cols-[repeat(var(--wizard-steps),minmax(0,1fr))] gap-2">
                    {steps.map((step, index) => {
                        const content = (
                            <>
                                <StepperIndicator className="size-7 text-xs font-semibold">
                                    {index + 1}
                                </StepperIndicator>
                                <div className="hidden min-w-0 text-left @min-[28rem]/wizard:block">
                                    <p className="mb-1 text-[10px] font-medium text-muted-foreground">
                                        Schritt {index + 1}
                                    </p>
                                    <StepperTitle className="text-xs leading-4 text-muted-foreground data-[state=active]:text-foreground data-[state=completed]:text-foreground">
                                        {step.label}
                                    </StepperTitle>
                                </div>
                            </>
                        );
                        return (
                            <StepperItem
                                key={step.id}
                                step={index + 1}
                                aria-current={
                                    index === active ? "step" : undefined
                                }
                                className="min-w-0 justify-start rounded-lg border bg-muted/30 data-[state=active]:border-primary/30 data-[state=active]:bg-primary/5"
                            >
                                {onSelect && index <= active ? (
                                    <button
                                        type="button"
                                        aria-label={`${step.label}, Schritt ${index + 1}`}
                                        disabled={busy}
                                        onClick={() => onSelect(index)}
                                        className="flex w-full min-w-0 items-center justify-center gap-2.5 rounded-lg p-2.5 text-left hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 @min-[28rem]/wizard:justify-start"
                                    >
                                        {content}
                                    </button>
                                ) : (
                                    <div
                                        aria-label={`${step.label}, Schritt ${index + 1}`}
                                        className="flex w-full min-w-0 items-center justify-center gap-2.5 p-2.5 @min-[28rem]/wizard:justify-start"
                                    >
                                        {content}
                                    </div>
                                )}
                            </StepperItem>
                        );
                    })}
                </StepperNav>
            </Stepper>
            <p className="text-sm font-medium @min-[28rem]/wizard:hidden">
                {steps[active]?.label}
            </p>
            {description && (
                <p className="text-xs leading-5 text-muted-foreground">
                    {description}
                </p>
            )}
        </div>
    );
}
