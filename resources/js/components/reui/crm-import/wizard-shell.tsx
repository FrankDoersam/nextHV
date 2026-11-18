"use client";

import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Flag } from "lucide-react";
import { Frame, FrameDescription, FrameFooter, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { Stepper, StepperContent, StepperIndicator, StepperItem, StepperNav, StepperPanel, StepperSeparator, StepperTitle, StepperTrigger } from "@/components/reui/stepper";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { WizardTabsNavigation, type WizardTab } from "@/components/reui/crm-import/wizard-tabs";

export const CRM_IMPORT_STEPS = ["Upload", "Map Columns", "Preview", "Duplicates", "Summary"] as const;

const FOOTER_HINTS = [
    "Pick files and target object.",
    "Match 8 columns to CRM fields.",
    "Validate the first rows.",
    "Choose how matches merge.",
    "Run the import.",
] as const;

export interface CrmImportWizardShellProps {
    variant: "stepper" | "tabs";
    step: number;
    unlockedStep: number;
    onStepChange: (step: number) => void;
    onNext: () => void;
    onBack: () => void;
    fileSummary: string;
    rowCount?: number;
    targetLabel: string;
    reading: boolean;
    completed: boolean;
    message?: string;
    panels: readonly (ReactNode | null | undefined)[];
    tabs?: WizardTab[];
}

/**
 * Single shared ReUI Nova shell for both CRM wizard navigation styles.
 * All Frame, Stepper, Tabs, footer, spacing and responsive presentation
 * is owned here. Feature controllers supply only data and event handlers.
 */
export function CrmImportWizardShell({
    variant, step, unlockedStep, onStepChange, onNext, onBack,
    fileSummary, rowCount, targetLabel, reading, completed, message,
    panels, tabs,
}: CrmImportWizardShellProps) {
    const frame = (
        <Frame className="w-full" stacked>
            <FrameHeader>
                <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-px">
                        <FrameTitle>Import Wizard</FrameTitle>
                        <FrameDescription className="flex min-w-0 items-center gap-1.5">
                            <span className="shrink-0">{fileSummary}</span>
                            {rowCount !== undefined && (
                                <>
                                    <span aria-hidden="true" className="size-1 shrink-0 rounded-full bg-muted-foreground/40" />
                                    <span className="shrink-0">{rowCount.toLocaleString("en-US")} rows</span>
                                </>
                            )}
                        </FrameDescription>
                    </div>
                    <Badge variant="info-light" className="shrink-0">{targetLabel}</Badge>
                </div>
            </FrameHeader>

            {variant === "stepper" ? (
                <FramePanel className="flex items-center overflow-x-auto">
                    <StepperNav className="min-w-full items-center">
                        {CRM_IMPORT_STEPS.map((label, index) => {
                            const number = index + 1;
                            return (
                                <StepperItem
                                    key={label}
                                    step={number}
                                    className="relative min-w-0"
                                >
                                    <StepperTrigger className="min-w-0 justify-start gap-2 disabled:opacity-100">
                                        <StepperIndicator className="relative isolate size-6 overflow-visible rounded-full border border-background bg-accent text-foreground data-[state=inactive]:border-border data-[state=active]:border-0 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:before:absolute data-[state=active]:before:inset-0 data-[state=active]:before:rounded-full data-[state=active]:before:border data-[state=active]:before:border-dashed data-[state=active]:before:border-primary data-[state=active]:before:animate-[spin_8s_linear_infinite] motion-reduce:data-[state=active]:before:animate-none data-[state=completed]:border-primary data-[state=completed]:bg-primary data-[state=completed]:text-primary-foreground">
                                            {number < step ? <Check className="size-3.5" aria-hidden="true" /> : number}
                                        </StepperIndicator>
                                        <StepperTitle className="hidden truncate text-sm font-medium text-foreground capitalize sm:block">
                                            {label}
                                        </StepperTitle>
                                    </StepperTrigger>
                                    {number < CRM_IMPORT_STEPS.length && (
                                        <StepperSeparator className="mx-2 bg-border group-data-[state=completed]/step:bg-primary" />
                                    )}
                                </StepperItem>
                            );
                        })}
                    </StepperNav>
                </FramePanel>
            ) : (
                <FramePanel className="pb-0">
                    <WizardTabsNavigation
                        unlockedStep={unlockedStep}
                        steps={tabs ?? CRM_IMPORT_STEPS.map((label, index) => ({
                            value: String(index + 1), label,
                        }))}
                    />
                </FramePanel>
            )}

            <FramePanel>
                {variant === "stepper" ? (
                    <StepperPanel className="text-sm">
                        {panels.map((content, index) => content == null ? null : (
                            <StepperContent key={index + 1} value={index + 1}>
                                {content}
                            </StepperContent>
                        ))}
                    </StepperPanel>
                ) : (
                    <div className="text-sm">
                        {panels.map((content, index) => content == null ? null : (
                            <TabsContent key={index + 1} value={String(index + 1)}>
                                {content}
                            </TabsContent>
                        ))}
                    </div>
                )}
                {message && (
                    <p role="alert" className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                        {message}
                    </p>
                )}
            </FramePanel>

            <FrameFooter className="gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="hidden items-center gap-1.5 text-sm text-muted-foreground sm:flex">
                    <Flag aria-hidden="true" className="size-4 shrink-0" />
                    {FOOTER_HINTS[step - 1]}
                </p>
                <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                    {step > 1 && (
                        <Button type="button" variant="outline" onClick={onBack}>
                            <ArrowLeft data-icon="inline-start" aria-hidden="true" />
                            Back
                        </Button>
                    )}
                    <Button type="submit" disabled={reading || completed}>
                        {step === 5 ? (completed ? "Done" : "Import") : "Next Step"}
                        {step < 5 && <ArrowRight data-icon="inline-end" aria-hidden="true" />}
                    </Button>
                </div>
            </FrameFooter>
        </Frame>
    );

    return (
        <form
            aria-label="CSV import wizard"
            data-slot="import-wizard-demo"
            className="mx-auto flex w-full max-w-3xl flex-col"
            onSubmit={(event) => { event.preventDefault(); onNext(); }}
        >
            {variant === "stepper" ? (
                <Stepper value={step} onValueChange={onStepChange}>{frame}</Stepper>
            ) : (
                <Tabs value={String(step)} onValueChange={(next) => onStepChange(Number(next))}>
                    {frame}
                </Tabs>
            )}
        </form>
    );
}
