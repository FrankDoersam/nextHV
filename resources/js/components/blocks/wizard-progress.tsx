import { Check } from "lucide-react";
import {
    Stepper,
    StepperIndicator,
    StepperItem,
    StepperNav,
    StepperSeparator,
} from "@/components/reui/stepper";
import { cn } from "@/lib/utils";

/** Horizontal progress for the fixed overlay header, shared by forms and saved flows. */
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
                <StepperNav className="items-start gap-0">
                    {steps.map((step, index) => {
                        const current = index === active;
                        const completed = index < active;
                        const content = (
                            <>
                                <span className="flex w-full items-center justify-center">
                                    <StepperIndicator className="size-7 border border-border bg-card font-semibold text-muted-foreground data-[state=active]:border-primary data-[state=active]:ring-4 data-[state=active]:ring-primary/10 data-[state=completed]:border-primary/20 data-[state=completed]:bg-primary/10 data-[state=completed]:text-primary">
                                        {index + 1}
                                    </StepperIndicator>
                                    {index < steps.length - 1 && (
                                        <StepperSeparator
                                            className={cn(
                                                "absolute top-3.5 right-[calc(-50%+1.25rem)] left-[calc(50%+1.25rem)] m-0 h-px rounded-none bg-border",
                                                completed && "bg-primary/40",
                                            )}
                                        />
                                    )}
                                </span>
                                <span
                                    className={cn(
                                        "line-clamp-2 text-center text-xs leading-5 font-medium",
                                        current
                                            ? "text-primary"
                                            : completed
                                              ? "text-foreground"
                                              : "text-muted-foreground",
                                    )}
                                >
                                    {step.label}
                                </span>
                            </>
                        );
                        const classes =
                            "flex w-full min-w-0 flex-col items-center justify-center gap-2 rounded-md px-2 outline-offset-4";
                        return (
                            <StepperItem
                                key={step.id}
                                step={index + 1}
                                aria-current={current ? "step" : undefined}
                                className="relative min-w-0 flex-1 items-start"
                            >
                                {onSelect && completed ? (
                                    <button
                                        type="button"
                                        disabled={busy}
                                        aria-label={`${step.label}, Schritt ${index + 1}`}
                                        onClick={() => onSelect(index)}
                                        className={cn(
                                            classes,
                                            "hover:opacity-80 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50",
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
                            </StepperItem>
                        );
                    })}
                </StepperNav>
            </Stepper>
        </nav>
    );
}
