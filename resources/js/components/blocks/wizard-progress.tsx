import { Check } from "lucide-react";
import {
    Stepper,
    StepperIndicator,
    StepperItem,
    StepperNav,
} from "@/components/reui/stepper";
import { cn } from "@/lib/utils";
/** Responsive wizard rail, composed from the installed REUI Stepper. */
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
        <nav
            aria-label={label ?? "Erfassungsschritte"}
            className="flex h-full flex-col gap-5"
        >
            <p className="hidden text-[11px] font-semibold uppercase tracking-wider text-muted-foreground @min-[40rem]/overlay:block">
                {label ?? "Erfassung"}
            </p>
            <Stepper
                orientation="vertical"
                role="group"
                aria-orientation={undefined}
                aria-label={`Schritt ${active + 1} von ${steps.length}`}
                value={active + 1}
                indicators={{ completed: <Check className="size-4" /> }}
            >
                <StepperNav className="flex w-full items-stretch gap-2 data-[orientation=vertical]:flex-row @min-[40rem]/overlay:gap-0 @min-[40rem]/overlay:data-[orientation=vertical]:flex-col">
                    {steps.map((step, index) => {
                        const current = index === active;
                        const content = (
                            <>
                                <span className="relative flex shrink-0 flex-col items-center">
                                    <StepperIndicator className="size-8 rounded-full border bg-card text-xs font-semibold text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:ring-4 data-[state=active]:ring-primary/10 data-[state=completed]:border-primary/20 data-[state=completed]:bg-accent data-[state=completed]:text-primary">
                                        {index + 1}
                                    </StepperIndicator>
                                    {index < steps.length - 1 && (
                                        <span
                                            aria-hidden
                                            className={cn(
                                                "absolute top-10 h-12 hidden w-px bg-border @min-[40rem]/overlay:block",
                                                index < active &&
                                                    "bg-primary/30",
                                            )}
                                        />
                                    )}
                                </span>
                                <span
                                    className={cn(
                                        "min-w-0 pt-1.5 text-left",
                                        !current &&
                                            "hidden @min-[40rem]/overlay:block",
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "block text-xs leading-5 font-medium",
                                            current
                                                ? "text-primary"
                                                : "text-muted-foreground",
                                        )}
                                    >
                                        {step.label}
                                    </span>
                                    <span className="mt-1 hidden text-[11px] leading-4 text-muted-foreground @min-[40rem]/overlay:block">
                                        {index < active
                                            ? "Abgeschlossen"
                                            : current
                                              ? "Aktueller Schritt"
                                              : "Ausstehend"}
                                    </span>
                                </span>
                            </>
                        );
                        const classes =
                            "relative flex w-full min-w-0 items-start gap-3 rounded-md outline-offset-4 @min-[40rem]/overlay:min-h-24";
                        return (
                            <StepperItem
                                key={step.id}
                                step={index + 1}
                                aria-current={current ? "step" : undefined}
                                className={cn(
                                    "min-w-0 items-stretch",
                                    current
                                        ? "flex-1 not-last:flex-1"
                                        : "flex-none not-last:flex-none",
                                    "@min-[40rem]/overlay:flex-none @min-[40rem]/overlay:not-last:flex-none",
                                )}
                            >
                                {onSelect && index < active ? (
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
                                    <div className={classes}>{content}</div>
                                )}
                            </StepperItem>
                        );
                    })}
                </StepperNav>
            </Stepper>
            {(description || steps[active]?.description) && (
                <p className="mt-auto hidden border-t pt-4 text-xs leading-5 text-muted-foreground @min-[40rem]/overlay:block">
                    {description ?? steps[active]?.description}
                </p>
            )}
        </nav>
    );
}
