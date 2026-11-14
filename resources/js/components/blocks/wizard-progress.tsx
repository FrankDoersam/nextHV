import type { CSSProperties } from "react";
import { Check } from "lucide-react";
import {
    Stepper,
    StepperIndicator,
    StepperItem,
    StepperNav,
    StepperTitle,
} from "@/components/reui/stepper";
import { cn } from "@/lib/utils";

/** One responsive progress rail for validated forms and persisted multi-entity flows. */
export function WizardProgress({
    steps,
    active,
    label,
    description,
    onSelect,
    busy = false,
}: {
    steps: { id: string; label: string; description?: string }[];
    active: number;
    label?: string;
    description?: string;
    onSelect?: (index: number) => void;
    busy?: boolean;
}) {
    return (
        <div className="@container/wizard min-w-0 space-y-4">
            <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-medium text-muted-foreground">
                    {label ?? "Schrittweise Erfassung"}
                </span>
                <span className="shrink-0 rounded-md bg-secondary px-2 py-1 font-medium tabular-nums text-secondary-foreground">
                    {active + 1} / {steps.length}
                </span>
            </div>
            <Stepper
                role="group"
                aria-orientation={undefined}
                aria-label={`Schritt ${active + 1} von ${steps.length}`}
                value={active + 1}
                indicators={{ completed: <Check className="size-4" /> }}
                style={{ "--wizard-steps": steps.length } as CSSProperties}
            >
                <StepperNav className="grid grid-cols-[repeat(var(--wizard-steps),minmax(0,1fr))] items-start gap-3">
                    {steps.map((step, index) => {
                        const content = (
                            <>
                                <span className="flex w-full items-center gap-3">
                                    <StepperIndicator className="size-8 shrink-0 rounded-lg border border-border bg-card text-xs font-semibold text-muted-foreground shadow-xs data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:ring-4 data-[state=active]:ring-primary/10 data-[state=completed]:border-primary/20 data-[state=completed]:bg-accent data-[state=completed]:text-primary">
                                        {index + 1}
                                    </StepperIndicator>
                                    {index < steps.length - 1 && (
                                        <span
                                            aria-hidden
                                            className={cn(
                                                "h-px flex-1",
                                                index < active
                                                    ? "bg-primary/40"
                                                    : "bg-border",
                                            )}
                                        />
                                    )}
                                </span>
                                <StepperTitle className="hidden w-full text-left text-xs leading-5 font-medium text-muted-foreground data-[state=active]:text-primary data-[state=completed]:text-foreground @min-[28rem]/wizard:block">
                                    {step.label}
                                </StepperTitle>
                            </>
                        );
                        return (
                            <StepperItem
                                key={step.id}
                                step={index + 1}
                                aria-current={
                                    index === active ? "step" : undefined
                                }
                                className="min-w-0 items-start justify-start"
                            >
                                {onSelect && index <= active ? (
                                    <button
                                        type="button"
                                        aria-label={`${step.label}, Schritt ${index + 1}`}
                                        disabled={busy}
                                        onClick={() => onSelect(index)}
                                        className="flex w-full min-w-0 flex-col items-start gap-2.5 rounded-md py-1 text-left outline-offset-4 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
                                    >
                                        {content}
                                    </button>
                                ) : (
                                    <div
                                        aria-label={`${step.label}, Schritt ${index + 1}`}
                                        className="flex w-full min-w-0 flex-col items-start gap-2.5 py-1"
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
            {(description || steps[active]?.description) && (
                <p className="text-xs leading-5 text-muted-foreground">
                    {description ?? steps[active]?.description}
                </p>
            )}
        </div>
    );
}
