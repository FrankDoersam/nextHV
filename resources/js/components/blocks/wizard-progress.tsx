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
/** One full-width step control for forms and persisted multi-entity flows. */
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
        <div className="@container/wizard min-w-0 space-y-3">
            <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-medium text-muted-foreground">
                    {label ?? "Schrittweise Erfassung"}
                </span>
                <span className="tabular-nums text-muted-foreground">
                    {active + 1} / {steps.length}
                </span>
            </div>
            <Stepper
                role="group"
                aria-orientation={undefined}
                aria-label={`Schritt ${active + 1} von ${steps.length}`}
                value={active + 1}
                indicators={{ completed: <Check className="size-3.5" /> }}
                style={{ "--wizard-steps": steps.length } as CSSProperties}
            >
                <StepperNav className="grid grid-cols-[repeat(var(--wizard-steps),minmax(0,1fr))] items-stretch gap-1 rounded-xl border bg-muted/70 p-1">
                    {steps.map((step, index) => {
                        const current = index === active;
                        const content = (
                            <>
                                <StepperIndicator className="size-6 shrink-0 rounded-full border border-border bg-card text-[11px] font-semibold text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=completed]:border-primary/15 data-[state=completed]:bg-accent data-[state=completed]:text-primary">
                                    {index + 1}
                                </StepperIndicator>
                                <StepperTitle className="hidden min-w-0 text-left text-xs leading-4 font-medium text-muted-foreground data-[state=active]:text-foreground data-[state=completed]:text-foreground @min-[28rem]/wizard:block">
                                    {step.label}
                                </StepperTitle>
                            </>
                        );
                        const classes = cn(
                            "flex h-full w-full min-w-0 items-center justify-center gap-2 rounded-lg px-2 py-3 outline-offset-2 @min-[28rem]/wizard:justify-start",
                            current &&
                                "bg-card shadow-xs ring-1 ring-border/60",
                        );
                        return (
                            <StepperItem
                                key={step.id}
                                step={index + 1}
                                aria-current={current ? "step" : undefined}
                                className="min-w-0 items-stretch"
                            >
                                {onSelect && index <= active ? (
                                    <button
                                        type="button"
                                        aria-label={`${step.label}, Schritt ${index + 1}`}
                                        disabled={busy}
                                        onClick={() => onSelect(index)}
                                        className={cn(
                                            classes,
                                            "hover:bg-card focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50",
                                        )}
                                    >
                                        {content}
                                    </button>
                                ) : (
                                    <div
                                        aria-label={`${step.label}, Schritt ${index + 1}`}
                                        className={classes}
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
