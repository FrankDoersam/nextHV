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
    const compact = steps.length > 4;
    return (
        <nav
            aria-label={label ?? "Erfassungsschritte"}
            className="@container/wizard flex min-h-16 min-w-0 items-center justify-center"
        >
            <Stepper
                className="w-full max-w-2xl"
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
                                <StepperIndicator className="size-7 border border-border bg-card font-semibold text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:shadow-xs data-[state=completed]:border-primary/20 data-[state=completed]:bg-primary/10 data-[state=completed]:text-primary">
                                    {index + 1}
                                </StepperIndicator>
                                <span
                                    className={cn(
                                        "min-w-0 max-w-full break-words hyphens-auto text-center text-[11px] leading-4 font-medium",
                                        !compact &&
                                            "@min-[32rem]/wizard:text-left @min-[32rem]/wizard:text-xs",
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
                            "relative z-10 flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-2 rounded-lg px-1.5 py-1 outline-offset-2",
                            !compact &&
                                "@min-[32rem]/wizard:flex-row @min-[32rem]/wizard:gap-2.5",
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
                                            "hover:bg-muted/70 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50",
                                        )}
                                    >
                                        {content}
                                    </button>
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
                                            "absolute top-[1.125rem] right-[calc(-50%+1.25rem)] left-[calc(50%+1.25rem)] m-0 rounded-none bg-border group-data-[orientation=horizontal]/stepper-nav:h-px group-data-[orientation=horizontal]/stepper-nav:flex-none",
                                            !compact &&
                                                "@min-[32rem]/wizard:static @min-[32rem]/wizard:mx-1 @min-[32rem]/wizard:w-6 @min-[32rem]/wizard:flex-none",
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
