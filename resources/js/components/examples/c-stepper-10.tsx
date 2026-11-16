"use client";

import { CheckIcon, LoaderCircleIcon } from "lucide-react";
import { useId, type ReactNode } from "react";
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

/**
 * Adapted from the actual shadcn registry installation:
 * pnpm dlx shadcn@latest add @reui/c-stepper-10
 * https://reui.io/components/stepper/c-stepper-10
 *
 * Same REUI anatomy as the original pattern: StepperNav with an indicator,
 * title and description per step; StepperPanel contains StepperContent.
 * Values and validation are controlled by the ResourceEditor, not this UI.
 */
export type Stepper10Step = {
    id: string;
    label: string;
    description?: string;
};

export function CStepper10({
    enabled = true,
    steps,
    active,
    onSelect,
    busy = false,
    singleContent = false,
    idPrefix,
    children,
}: {
    enabled?: boolean;
    steps: Stepper10Step[];
    active: number;
    onSelect?: (index: number) => void;
    busy?: boolean;
    singleContent?: boolean;
    idPrefix?: string;
    children: ReactNode;
}) {
    const generatedId = useId();
    const baseId = idPrefix ?? generatedId;
    if (!enabled) return <>{children}</>;

    return (
        <div data-slot="reui-c-stepper-10" className="min-w-0">
            <Stepper
                value={active + 1}
                onValueChange={
                    onSelect
                        ? (value) => {
                              // Completed steps may be revisited. Future steps
                              // must pass ResourceEditor's server validation.
                              if (!busy && value >= 1 && value <= active)
                                  onSelect(value - 1);
                          }
                        : undefined
                }
                indicators={{
                    completed: <CheckIcon className="size-3.5" />,
                    loading: <LoaderCircleIcon className="size-3.5 animate-spin" />,
                }}
                aria-label="Erfassungsschritte"
                className="w-full min-w-0 space-y-3"
            >
                <div
                    data-slot="reui-stepper-10-scroll"
                    className="min-w-0 overflow-x-auto overscroll-x-contain border-b border-border/60 pb-3"
                >
                    <StepperNav className="w-full min-w-max items-center gap-0">
                        {steps.map((stage, index) => {
                            const completed = index < active;
                            const current = index === active;
                            const status = completed
                                ? "Erledigt"
                                : current
                                  ? "Aktuell"
                                  : "Offen";
                            return (
                                <StepperItem
                                    key={stage.id}
                                    step={index + 1}
                                    disabled={busy || !onSelect || index > active}
                                    className="relative min-w-25 !flex-1 justify-start"
                                >
                                    <StepperTrigger
                                        type="button"
                                        id={baseId + "-trigger-" + (index + 1)}
                                        aria-controls={baseId + "-panel-" + (index + 1)}
                                        aria-label={stage.label + ", Schritt " + (index + 1)}
                                        disabled={busy || !onSelect || index > active}
                                        className={cn(
                                            "min-w-0 flex-1 justify-start gap-1.5 rounded-md px-1 py-1.5 text-left focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-100",
                                            completed && "hover:bg-muted/50",
                                        )}
                                    >
                                        <StepperIndicator className="size-6 shrink-0 rounded-full border border-border bg-background text-[11px] font-semibold text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=completed]:border-primary/20 data-[state=completed]:bg-primary/10 data-[state=completed]:text-primary">
                                            {index + 1}
                                        </StepperIndicator>
                                        <div className="flex min-w-0 flex-col items-start gap-0.5">
                                            <StepperTitle className="break-words text-xs leading-4 data-[state=inactive]:text-muted-foreground">
                                                {stage.label}
                                            </StepperTitle>
                                            <StepperDescription className="hidden text-[10px] leading-4 text-muted-foreground @min-[38rem]/overlay:block">
                                                {status}
                                            </StepperDescription>
                                        </div>
                                    </StepperTrigger>
                                    {index < steps.length - 1 && (
                                        <StepperSeparator className="mx-0.5 h-px w-3 flex-none self-center bg-border/70 @min-[44rem]/overlay:mx-1 @min-[44rem]/overlay:w-4" />
                                    )}
                                </StepperItem>
                            );
                        })}
                    </StepperNav>
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
