import { Check } from "lucide-react";
import {
    Stepper,
    StepperIndicator,
    StepperItem,
    StepperNav,
    StepperSeparator,
} from "@/components/reui/stepper";
import { cn } from "@/lib/utils";

/** Header navigation only: server-validated steps control progression; completed steps remain revisitable. */
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
                role="group"
                aria-orientation={undefined}
                aria-label={`Schritt ${active + 1} von ${steps.length}`}
                value={active + 1}
                indicators={{ completed: <Check className="size-3.5" /> }}
            >
                <StepperNav className="items-stretch gap-0">
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
                                        "min-w-0 max-w-full truncate text-center text-xs font-medium @max-[38rem]/wizard:sr-only @min-[38rem]/wizard:text-left",
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
                            "relative z-10 flex min-h-10 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-md px-1 py-1 outline-offset-2 @min-[38rem]/wizard:flex-row @min-[38rem]/wizard:gap-2",
                        );
                        return (
                            <StepperItem
                                key={step.id}
                                step={index + 1}
                                aria-current={current ? "step" : undefined}
                                className="relative min-w-0 flex-1 items-center"
                            >
                                {onSelect && completed ? (
                                    <button
                                        type="button"
                                        disabled={busy}
                                        aria-label={`${step.label}, Schritt ${index + 1}`}
                                        onClick={() => onSelect(index)}
                                        className={cn(
                                            classes,
                                            "hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50",
                                        )}
                                    >
                                        {content}
                                    </button>
                                ) : (
                                    <div
                                        className={cn(
                                            classes,
                                            current && "bg-primary/[0.06]",
                                        )}
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
