"use client";

import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, LoaderCircleIcon } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
    Stepper,
    StepperContent,
    StepperDescription,
    StepperIndicator,
    StepperItem,
    StepperNav,
    StepperPanel,
    StepperSeparator,
    StepperTitle,
    StepperTrigger,
} from "@/components/reui/stepper";
import { cn } from "@/lib/utils";
import {
    useCStepper10Navigation,
    type Stepper10Navigation,
    type Stepper10Validator,
} from "./c-stepper-10-navigation";

/** ReUI c-stepper-10, installed with pnpm dlx shadcn@latest add @reui/c-stepper-10.
 * The navigation remains responsive at any step count. The optional shared
 * controller also drives the host Sheet footer (Back / Next / Finish).
 */
export type Stepper10Step = {
    id: string;
    label: string;
    description?: string;
    shortLabel?: string;
};

export interface CStepper10Props {
    enabled?: boolean;
    steps: Stepper10Step[];
    active: number;
    /** Supply the same controller to this component and your footer buttons. */
    navigation?: Stepper10Navigation;
    /** Optional standalone controlled navigation, without an external controller. */
    onSelect?: (index: number) => void;
    /** Optional async server validation for standalone navigation. */
    validate?: Stepper10Validator;
    canBack?: boolean;
    canNext?: boolean;
    busy?: boolean;
    singleContent?: boolean;
    idPrefix?: string;
    children: ReactNode;
}

export function CStepper10({
    enabled = true,
    steps,
    active,
    navigation,
    onSelect,
    validate,
    canBack = true,
    canNext = true,
    busy = false,
    singleContent = false,
    idPrefix,
    children,
}: CStepper10Props) {
    const generatedId = useId();
    const baseId = idPrefix ?? generatedId;
    const fallback = useCStepper10Navigation({
        active,
        count: steps.length,
        onChange: onSelect ?? (() => undefined),
        validate,
        canBack: Boolean(onSelect) && canBack,
        canNext: Boolean(onSelect) && canNext,
        busy,
    });
    const controls = navigation ?? fallback;
    const interactive = Boolean(navigation || onSelect);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [scrollability, setScrollability] = useState({ left: false, right: false });
    const compact = steps.length > 4;

    const updateScrollability = useCallback(() => {
        const element = scrollRef.current;
        if (!element) return;
        const max = Math.max(0, element.scrollWidth - element.clientWidth);
        const left = max > 2 && element.scrollLeft > 2;
        const right = max > 2 && element.scrollLeft < max - 2;
        setScrollability((current) =>
            current.left === left && current.right === right
                ? current
                : { left, right },
        );
    }, []);

    useEffect(() => {
        if (!enabled) return;
        const element = scrollRef.current;
        if (!element) return;
        const handler = () => updateScrollability();
        element.addEventListener("scroll", handler, { passive: true });
        window.addEventListener("resize", handler);
        const observer = typeof ResizeObserver === "function"
            ? new ResizeObserver(handler)
            : null;
        observer?.observe(element);
        const rail = element.querySelector('[data-slot="stepper-nav"]');
        if (rail) observer?.observe(rail);
        handler();
        return () => {
            element.removeEventListener("scroll", handler);
            window.removeEventListener("resize", handler);
            observer?.disconnect();
        };
    }, [enabled, steps.length, updateScrollability]);

    // The active tab follows Next/Back even when the rail contains 6+ tabs.
    // Move only the horizontal rail, never the Sheet's vertical form scroll.
    useLayoutEffect(() => {
        if (!enabled) return;
        const element = scrollRef.current;
        const current = element?.querySelector<HTMLElement>('[data-current-step="true"]');
        if (!element || !current) return;
        const railRect = element.getBoundingClientRect();
        const tabRect = current.getBoundingClientRect();
        const inset = 12;
        if (tabRect.right > railRect.right - inset)
            element.scrollLeft += tabRect.right - railRect.right + inset;
        else if (tabRect.left < railRect.left + inset)
            element.scrollLeft -= railRect.left + inset - tabRect.left;
        updateScrollability();
    }, [enabled, active, steps.length, updateScrollability]);

    const scrollTabs = (direction: -1 | 1) => {
        const element = scrollRef.current;
        if (!element) return;
        element.scrollLeft += direction * Math.max(140, element.clientWidth * 0.65);
        updateScrollability();
    };

    if (!enabled) return <>{children}</>;

    return (
        <div data-slot="reui-c-stepper-10" data-step-count={steps.length} className="min-w-0">
            <Stepper
                value={active + 1}
                onValueChange={(value) => {
                    if (interactive) void controls.selectStep(value - 1);
                }}
                indicators={{
                    completed: <CheckIcon className="size-3.5" />,
                    loading: <LoaderCircleIcon className="size-3.5 animate-spin" />,
                }}
                aria-label="Erfassungsschritte"
                className="w-full min-w-0 space-y-3"
            >
                <div data-slot="reui-stepper-10-navigation" className="relative min-w-0">
                    <div
                        ref={scrollRef}
                        data-slot="reui-stepper-10-scroll"
                        className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain border-b border-border/60 pb-3 [scrollbar-width:thin]"
                    >
                        <StepperNav className="flex w-full min-w-max items-center gap-0">
                            {steps.map((stage, index) => {
                                const completed = index < active;
                                const current = index === active;
                                const status = completed ? "Erledigt" : current ? "Aktuell" : "Offen";
                                const permitted = interactive && controls.canSelectStep(index);
                                return (
                                    <StepperItem
                                        key={stage.id}
                                        step={index + 1}
                                        disabled={!permitted}
                                        data-current-step={current ? "true" : undefined}
                                        className={cn(
                                            "relative min-w-0 justify-start",
                                            compact
                                                ? "!flex-[1_0_6.75rem]"
                                                : "!flex-[1_0_8rem]",
                                        )}
                                    >
                                        <StepperTrigger
                                            type="button"
                                            id={baseId + "-trigger-" + (index + 1)}
                                            aria-controls={baseId + "-panel-" + (index + 1)}
                                            aria-label={stage.label + ", Schritt " + (index + 1)}
                                            disabled={!permitted}
                                            className={cn(
                                                "min-w-0 flex-1 justify-start gap-1.5 rounded-md px-1 py-1.5 text-left focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-100",
                                                completed && permitted && "hover:bg-muted/50",
                                            )}
                                        >
                                            <StepperIndicator className="size-6 shrink-0 rounded-full border border-border bg-background text-[11px] font-semibold text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=completed]:border-primary/20 data-[state=completed]:bg-primary/10 data-[state=completed]:text-primary">
                                                {index + 1}
                                            </StepperIndicator>
                                            <div className="flex min-w-0 flex-col items-start gap-0.5">
                                                <StepperTitle className="line-clamp-2 max-w-36 break-words text-xs leading-4 data-[state=inactive]:text-muted-foreground">
                                                    <span className="sm:hidden">{stage.shortLabel ?? stage.label}</span>
                                                    <span className="hidden sm:inline">{stage.label}</span>
                                                </StepperTitle>
                                                <StepperDescription className="hidden text-[10px] leading-4 text-muted-foreground @min-[38rem]/overlay:block">
                                                    {status}
                                                </StepperDescription>
                                            </div>
                                        </StepperTrigger>
                                        {index < steps.length - 1 && (
                                            <StepperSeparator className="mx-0.5 h-px w-2.5 flex-none self-center bg-border/70 @min-[44rem]/overlay:mx-1 @min-[44rem]/overlay:w-3" />
                                        )}
                                    </StepperItem>
                                );
                            })}
                        </StepperNav>
                    </div>
                    {scrollability.left && (
                        <button
                            type="button"
                            data-slot="reui-stepper-10-scroll-prev"
                            aria-label="Frühere Schritte anzeigen"
                            onClick={() => scrollTabs(-1)}
                            className="absolute top-1/2 left-0 z-10 flex size-7 -translate-y-[65%] items-center justify-center rounded-md border bg-background/95 shadow-sm focus-visible:ring-2 focus-visible:ring-ring/50"
                        >
                            <ChevronLeftIcon className="size-4" />
                        </button>
                    )}
                    {scrollability.right && (
                        <button
                            type="button"
                            data-slot="reui-stepper-10-scroll-next"
                            aria-label="Weitere Schritte anzeigen"
                            onClick={() => scrollTabs(1)}
                            className="absolute top-1/2 right-0 z-10 flex size-7 -translate-y-[65%] items-center justify-center rounded-md border bg-background/95 shadow-sm focus-visible:ring-2 focus-visible:ring-ring/50"
                        >
                            <ChevronRightIcon className="size-4" />
                        </button>
                    )}
                </div>
                <StepperPanel className="min-w-0 text-sm">
                    {singleContent ? (
                        <CStepper10Content
                            enabled
                            step={active + 1}
                            active={active}
                            idPrefix={baseId}
                        >
                            {children}
                        </CStepper10Content>
                    ) : (
                        children
                    )}
                </StepperPanel>
            </Stepper>
        </div>
    );
}

export function CStepper10Content({
    enabled,
    step,
    active,
    idPrefix,
    children,
}: {
    enabled: boolean;
    step: number;
    active: number;
    idPrefix: string;
    children: ReactNode;
}) {
    if (!enabled) return <>{children}</>;

    return (
        <section
            id={idPrefix + "-panel-" + step}
            role="tabpanel"
            aria-labelledby={idPrefix + "-trigger-" + step}
            hidden={step !== active + 1}
            className="min-w-0"
        >
            <StepperContent value={step} forceMount className="min-w-0">
                {children}
            </StepperContent>
        </section>
    );
}
