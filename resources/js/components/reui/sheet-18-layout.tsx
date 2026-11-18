"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Check, Copy, X, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetActions,
    SheetBody,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetHeading,
    SheetTabBar,
    SheetTabs,
    SheetTabTrigger,
    SheetTitle,
} from "@/components/ui/sheet";
import { TabsContent } from "@/components/ui/tabs";

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
 * Sheet 18's reference, tabs and actions use the application's shared Nova
 * Sheet anatomy. The consuming editor owns form state and validation.
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
    open,
    onOpenChange,
    reference,
    title,
    badge,
    description,
    tabs,
    initialTab,
    primaryLabel,
    primaryDisabled = false,
    onSubmit,
    onCancel,
    destructiveAction,
    headerAction,
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
                size="details"
                showCloseButton={false}
            >
                <form
                    onSubmit={onSubmit}
                    className="flex min-h-0 flex-1 flex-col"
                >
                    <SheetHeader data-slot="reui-sheet-18-header">
                        <SheetHeading
                            reference={
                                <>
                                    <span>{reference}</span>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-xs"
                                        aria-label="Vorgangskennung kopieren"
                                        onClick={() => void copyId()}
                                    >
                                        <Copy />
                                    </Button>
                                    <span role="status" className="sr-only">
                                        {copyState}
                                    </span>
                                </>
                            }
                            actions={
                                <SheetActions>
                                    {headerAction}
                                    <Button
                                        type="button"
                                        size="icon-sm"
                                        variant="ghost"
                                        aria-label="Schließen"
                                        onClick={onCancel}
                                    >
                                        <X />
                                    </Button>
                                </SheetActions>
                            }
                            title={<SheetTitle>{title}</SheetTitle>}
                            badge={badge}
                            description={
                                <SheetDescription>
                                    {description}
                                </SheetDescription>
                            }
                        />
                    </SheetHeader>
                    <SheetTabs defaultValue={initialTab ?? tabs[0]?.value}>
                        <SheetTabBar>
                            {tabs.map((tab) => (
                                <SheetTabTrigger
                                    key={tab.value}
                                    value={tab.value}
                                    disabled={tab.disabled}
                                >
                                    {tab.label}
                                    {tab.count !== undefined && (
                                        <Badge size="sm" variant="secondary">
                                            {tab.count}
                                        </Badge>
                                    )}
                                </SheetTabTrigger>
                            ))}
                        </SheetTabBar>
                        <SheetBody data-slot="reui-sheet-18-scroll">
                            {tabs.map((tab) => (
                                <TabsContent key={tab.value} value={tab.value}>
                                    {tab.content}
                                </TabsContent>
                            ))}
                        </SheetBody>
                    </SheetTabs>
                    <SheetFooter
                        data-slot="reui-sheet-18-footer"
                        leading={
                            destructiveAction && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="destructive"
                                    disabled={destructiveAction.disabled}
                                    onClick={destructiveAction.onClick}
                                >
                                    {DestructiveIcon && <DestructiveIcon />}
                                    {destructiveAction.label}
                                </Button>
                            )
                        }
                    >
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={onCancel}
                        >
                            Abbrechen
                        </Button>
                        <Button
                            type="submit"
                            size="sm"
                            disabled={primaryDisabled}
                        >
                            <Check />
                            {primaryLabel}
                        </Button>
                    </SheetFooter>
                </form>
            </SheetContent>
        </Sheet>
    );
}
