import { Check } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
    Stepper,
    StepperIndicator,
    StepperItem,
    StepperNav,
    StepperTrigger,
} from "@/components/reui/stepper";
import { cn } from "@/lib/utils";

const railQuery = "(min-width: 768px)";

function useDesktopRail() {
    const [desktop, setDesktop] = useState(
        () => (typeof window !== "undefined" && window.matchMedia?.(railQuery)?.matches) ?? false,
    );
    useEffect(() => {
        const query = window.matchMedia?.(railQuery);
        if (!query) return;
        const update = () => setDesktop(query.matches);
        update();
        query.addEventListener("change", update);
        return () => query.removeEventListener("change", update);
    }, []);
    return desktop;
}

/**
 * REUI controlled Stepper with card-style stages, adapted to a right-hand Sheet.
 * Desktop has a vertical rail; narrow screens scroll the cards horizontally.
 * Progression and field validation remain in ResourceEditor.
 */
/** Kept as the alternative vertical step-card wizard navigation. */
export function WizardProgress({
    steps,
    active,
    label,
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
    const generatedId = useId();
    const baseId = navigationId ?? generatedId;
    const desktop = useDesktopRail();
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (desktop || !scrollRef.current) return;
        const scroll = scrollRef.current;
        const current = scroll.querySelector<HTMLElement>('[data-current-step="true"]');
        if (!current || scroll.scrollWidth <= scroll.clientWidth) return;
        scroll.scrollLeft = Math.max(
            0,
            current.offsetLeft - scroll.offsetLeft - (scroll.clientWidth - current.clientWidth) / 2,
        );
    }, [active, desktop]);

    return (
        <nav
            aria-label={label ?? "Erfassungsschritte"}
            data-slot="wizard-progress"
            className="flex min-w-0 flex-col gap-3"
        >
            <div className="flex min-w-0 items-center justify-between gap-2 @min-[48rem]/overlay:flex-col @min-[48rem]/overlay:items-start">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Erfassungsschritte
                </span>
                <span
                    aria-live="polite"
                    aria-atomic="true"
                    className="text-xs font-medium tabular-nums text-muted-foreground"
                >
                    Schritt {active + 1} von {steps.length}
                </span>
            </div>
            <div
                ref={scrollRef}
                data-slot="wizard-step-scroll"
                className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain @min-[48rem]/overlay:overflow-visible"
            >
                <Stepper
                    id={baseId}
                    className="w-full"
                    role={onSelect ? "tablist" : "group"}
                    aria-label={label ?? "Erfassungsschritte"}
                    value={active + 1}
                    orientation={desktop ? "vertical" : "horizontal"}
                    onValueChange={
                        onSelect
                            ? (value) => {
                                  if (!busy && value >= 1 && value <= active)
                                      onSelect(value - 1);
                              }
                            : undefined
                    }
                    indicators={{ completed: <Check className="size-4" /> }}
                >
                    <StepperNav
                        role="presentation"
                        className="min-w-max items-stretch gap-2 @min-[48rem]/overlay:w-full @min-[48rem]/overlay:min-w-0"
                    >
                        {steps.map((step, index) => {
                            const current = index === active;
                            const completed = index < active;
                            const status = completed
                                ? "Abgeschlossen"
                                : current
                                  ? "Aktueller Schritt"
                                  : "Noch offen";
                            const card = (
                                <>
                                    <StepperIndicator className="size-8 rounded-full border border-border bg-background text-xs font-semibold text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=completed]:border-emerald-200 data-[state=completed]:bg-emerald-50 data-[state=completed]:text-emerald-700 dark:data-[state=completed]:border-emerald-900 dark:data-[state=completed]:bg-emerald-950 dark:data-[state=completed]:text-emerald-300">
                                        {index + 1}
                                    </StepperIndicator>
                                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                        <span className={cn(
                                            "break-words text-xs font-semibold leading-4",
                                            current ? "text-foreground" : completed ? "text-foreground/90" : "text-muted-foreground",
                                        )}>
                                            {step.label}
                                        </span>
                                        <span className="hidden text-[11px] leading-4 text-muted-foreground @min-[48rem]/overlay:line-clamp-2">
                                            {step.description || status}
                                        </span>
                                    </span>
                                </>
                            );
                            const classes = cn(
                                "flex min-h-14 w-full min-w-0 items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left shadow-xs",
                                current
                                    ? "border-primary/50 bg-primary/[0.06] ring-1 ring-primary/10"
                                    : completed
                                      ? "border-border hover:border-primary/30"
                                      : "border-border/70 bg-muted/30",
                            );
                            return (
                                <StepperItem
                                    key={step.id}
                                    step={index + 1}
                                    disabled={busy || index > active || !onSelect}
                                    data-current-step={current ? "true" : undefined}
                                    className="!flex-none w-40 min-w-0 @min-[48rem]/overlay:w-full"
                                >
                                    {onSelect ? (
                                        <StepperTrigger
                                            type="button"
                                            id={`${baseId}-trigger-${index + 1}`}
                                            aria-controls={panelId ?? `${baseId}-panel`}
                                            aria-label={`${step.label}, Schritt ${index + 1}`}
                                            disabled={busy || index > active}
                                            className={cn(
                                                classes,
                                                "rounded-lg outline-offset-2 focus-visible:ring-2 focus-visible:ring-ring/50",
                                            )}
                                        >
                                            {card}
                                        </StepperTrigger>
                                    ) : (
                                        <div
                                            className={classes}
                                            aria-label={`${step.label}: ${status}`}
                                        >
                                            {card}
                                        </div>
                                    )}
                                </StepperItem>
                            );
                        })}
                    </StepperNav>
                </Stepper>
            </div>
        </nav>
    );
}

export { WizardProgress as VerticalWizardProgress };
