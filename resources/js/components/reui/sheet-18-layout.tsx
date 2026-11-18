"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Check, Copy, X, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** A single tab of the reusable ReUI Sheet 18 layout. */
export interface Sheet18Tab {
    value: string;
    label: string;
    content: ReactNode;
    count?: number;
    disabled?: boolean;
}
export interface Sheet18SecondaryAction {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
    disabled?: boolean;
}

/**
 * The DOM composition follows the live, rendered public ReUI sheet-18 preview:
 * inset right Sheet → compact reference/title/status header →
 * 2+ prop-driven line Tabs → independent scroll viewport →
 * muted, fixed Delete / Cancel / Save footer.
 *
 * This shared component owns all presentation. The consuming editor owns
 * form state, validation and the meaning of the tab content.
 */
export interface Sheet18LayoutProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    reference: string;
    title: string;
    badge?: ReactNode;
    description: ReactNode;
    tabs: readonly Sheet18Tab[];
    initialTab?: string;
    primaryLabel: string;
    primaryDisabled?: boolean;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    onCancel: () => void;
    destructiveAction?: Sheet18SecondaryAction;
    /** Optional additional actions between the destructive and submit buttons. */
    headerAction?: ReactNode;
}

export function Sheet18Layout({
    open, onOpenChange, reference, title, badge, description, tabs,
    initialTab, primaryLabel, primaryDisabled = false,
    onSubmit, onCancel, destructiveAction, headerAction,
}: Sheet18LayoutProps) {
    const [copyState, setCopyState] = useState("");
    const DestructiveIcon = destructiveAction?.icon;
    const copyId = async () => {
        try {
            await navigator.clipboard.writeText(reference);
            setCopyState("Kopiert");
        } catch {
            setCopyState("Kopieren nicht möglich");
        }
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                data-slot="reui-sheet-18"
                side="right"
                showCloseButton={false}
                overlayClassName="!bg-black/20 backdrop-blur-[2px] dark:!bg-black/55"
                className="inset-y-4 right-4 left-auto flex max-w-none flex-col gap-0 overflow-hidden rounded-xl border border-border p-0 outline-none"
                style={{
                    insetBlock: "1rem",
                    right: "1rem",
                    left: "auto",
                    width: "min(36rem, calc(100vw - 2rem))",
                    maxWidth: "none",
                    height: "calc(100svh - 2rem)",
                }}
            >
                <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
                    <div data-slot="reui-sheet-18-header" className="flex shrink-0 flex-col gap-1 border-b px-5 py-3.5">
                        <div className="flex items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-1">
                                <span className="min-w-0 truncate font-mono text-xs">{reference}</span>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    aria-label="Vorgangskennung kopieren"
                                    onClick={() => void copyId()}
                                >
                                    <Copy className="size-3" />
                                </Button>
                                <span role="status" className="sr-only">{copyState}</span>
                            </span>
                            <div className="flex items-center gap-1">
                                {headerAction}
                                <Button
                                    type="button"
                                    size="icon-sm"
                                    variant="ghost"
                                    aria-label="Schließen"
                                    className="-me-1"
                                    onClick={onCancel}
                                >
                                    <X className="size-4" />
                                </Button>
                            </div>
                        </div>
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <SheetTitle className="min-w-0 truncate text-lg font-semibold">
                                {title}
                            </SheetTitle>
                            {badge}
                        </div>
                        <SheetDescription>
                            {description}
                        </SheetDescription>
                    </div>

                    <Tabs
                        defaultValue={initialTab ?? tabs[0]?.value}
                        className="flex min-h-0 min-w-0 flex-1 flex-col gap-0"
                    >
                        <TabsList
                            variant="line"
                            className="h-auto w-full shrink-0 justify-start gap-5 rounded-none border-b px-5 py-0"
                        >
                            {tabs.map((tab) => (
                                <TabsTrigger
                                    key={tab.value}
                                    value={tab.value}
                                    disabled={tab.disabled}
                                    className="h-auto flex-none rounded-none px-0 py-2 after:inset-x-0 after:-bottom-px after:bg-foreground data-active:text-foreground"
                                >
                                    {tab.label}
                                    {tab.count !== undefined && (
                                        <Badge size="sm" variant="secondary">{tab.count}</Badge>
                                    )}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                        <div
                            data-slot="reui-sheet-18-scroll"
                            className="min-h-0 flex-1 overflow-y-auto scroll-py-10"
                        >
                            {tabs.map((tab) => (
                                <TabsContent
                                    key={tab.value}
                                    value={tab.value}
                                    className="min-w-0 flex-col gap-5 px-5 py-5"
                                >
                                    {tab.content}
                                </TabsContent>
                            ))}
                        </div>
                    </Tabs>

                    <div
                        data-slot="reui-sheet-18-footer"
                        className="flex shrink-0 flex-wrap items-center gap-2 border-t bg-muted px-5 py-3"
                    >
                        {destructiveAction && (
                            <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                disabled={destructiveAction.disabled}
                                onClick={destructiveAction.onClick}
                            >
                                {DestructiveIcon && <DestructiveIcon className="size-3.5" />}
                                {destructiveAction.label}
                            </Button>
                        )}
                        <div className="ms-auto flex items-center gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
                                Abbrechen
                            </Button>
                            <Button type="submit" size="sm" disabled={primaryDisabled}>
                                <Check className="size-3.5" />
                                {primaryLabel}
                            </Button>
                        </div>
                    </div>
                </form>
            </SheetContent>
        </Sheet>
    );
}
