import { Check } from "lucide-react";
import {
    Stepper,
    StepperIndicator,
    StepperItem,
    StepperNav,
    StepperSeparator,
    StepperTrigger,
} from "@/components/reui/stepper";
import { cn } from "@/lib/utils";

/**
 * REUI controlled Stepper: earlier steps remain accessible, but the current
 * form must validate before moving forward. The form itself stays mounted.
 */
export function WizardProgress({
    steps,
    active,
    label,
    onSelect,
    busy = false,
}: {
    steps: { id: string; label: string; description?: string }[];
    active: number;
    label?: string;
    onSelect?: (index: number) => void;
    busy?: boolean;
}) {
    return (
        <nav
            aria-label={label ?? "Erfassungsschritte"}
            data-slot="wizard-progress"
            className="@container/wizard flex min-w-0 flex-col gap-3"
        >
            <div
                aria-live="polite"
                aria-atomic="true"
                className="flex min-w-0 items-center justify-between gap-3 text-xs"
            >
                <span className="font-medium tabular-nums text-muted-foreground">
                    Schritt {active + 1} von {steps.length}
                </span>
                <span className="truncate font-medium text-foreground">
                    {steps[active]?.label}
                </span>
            </div>
            <Stepper
                className="w-full"
                role={onSelect ? "tablist" : "group"}
                aria-label={`Schritt ${active + 1} von ${steps.length}`}
                value={active + 1}
                onValueChange={
                    onSelect
                        ? (value) => {
                              // Clicking an unvalidated future step never skips validation.
                              if (!busy && value >= 1 && value <= active)
                                  onSelect(value - 1);
                          }
                        : undefined
                }
                indicators={{ completed: <Check className="size-3.5" /> }}
            >
                <StepperNav role="presentation" className="items-stretch gap-0">
                    {steps.map((step, index) => {
                        const current = index === active;
                        const completed = index < active;
                        const content = (
                            <>
                                <StepperIndicator className="size-6 border border-border bg-card font-semibold text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:shadow-xs data-[state=completed]:border-primary/20 data-[state=completed]:bg-primary/10 data-[state=completed]:text-primary">
                                    {index + 1}
                                </StepperIndicator>
                                <span
                                    className={cn(
                                        "min-w-0 max-w-full text-center text-xs leading-4 font-medium @max-[38rem]/wizard:sr-only @min-[38rem]/wizard:break-words @min-[38rem]/wizard:text-left",
                                        current
                                            ? "text-foreground"
                                            : completed
                                              ? "text-foreground/80"
                                              : "text-muted-foreground",
                                    )}
                                >
                                    {step.label}
                                </span>
                            </>
                        );
                        const classes = cn(
                            "relative z-10 flex min-h-10 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-md px-1 py-1 @min-[38rem]/wizard:flex-row @min-[38rem]/wizard:gap-2",
                            current && "bg-primary/[0.06]",
                        );
                        return (
                            <StepperItem
                                key={step.id}
                                step={index + 1}
                                disabled={busy || index > active || !onSelect}
                                aria-current={current ? "step" : undefined}
                                className="relative min-w-0 flex-1 items-center"
                            >
                                {onSelect ? (
                                    <StepperTrigger
                                        type="button"
                                        disabled={busy || index > active}
                                        aria-label={`${step.label}, Schritt ${index + 1}`}
                                        className={cn(
                                            classes,
                                            "outline-offset-2 focus-visible:ring-2 focus-visible:ring-ring/50",
                                            completed && "hover:bg-muted/60",
                                        )}
                                    >
                                        {content}
                                    </StepperTrigger>
                                ) : (
                                    <div
                                        className={classes}
                                        aria-label={`${step.label}: ${current ? "aktueller Schritt" : completed ? "abgeschlossen" : "ausstehend"}`}
                                    >
                                        {content}
                                    </div>
                                )}
                                {index < steps.length - 1 && (
                                    <StepperSeparator
                                        className={cn(
                                            "absolute top-[0.9375rem] right-[calc(-50%+1.25rem)] left-[calc(50%+1.25rem)] m-0 rounded-none bg-border group-data-[orientation=horizontal]/stepper-nav:h-px group-data-[orientation=horizontal]/stepper-nav:flex-none",
                                            "@min-[38rem]/wizard:static @min-[38rem]/wizard:mx-1 @min-[38rem]/wizard:w-4 @min-[38rem]/wizard:flex-none",
                                            completed && "bg-primary/30",
                                        )}
                                    />
                                )}
                            </StepperItem>
                        );
                    })}
                </StepperNav>
            </Stepper>
        </nav>
    );
}
