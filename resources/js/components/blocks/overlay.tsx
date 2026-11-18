import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Sheet,
    SheetActions,
    SheetBody,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetHeading,
    SheetHint,
    SheetTabBar,
    SheetTabTrigger,
    SheetTitle,
    SheetToolbar,
    SheetWorkspace,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/reui/badge";
import { X, Layers, type LucideIcon } from "lucide-react";
import type { Presentation } from "@/framework/types";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
export function Overlay({
    open,
    onClose,
    title,
    description,
    children,
    presentation = "sheet",
    footer,
    header,
    nested,
    stacked = false,
    busy = false,
    size = "form",
    fill = false,
    wizard = false,
    titleBadge,
    icon,
    actions,
    footerStart,
    sidebar,
    tabs,
    bodyInset = true,
    bodyScroll = "auto",
    bodyResetKey,
}: {
    /** Reset scrolling on a flow step change without remounting form fields. */
    bodyResetKey?: string | number;
    bodyInset?: boolean;
    bodyScroll?: "auto" | "managed";
    open: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    children: ReactNode;
    presentation?: Presentation;
    footer?: ReactNode;
    header?: ReactNode;
    nested?: ReactNode;
    stacked?: boolean;
    busy?: boolean;
    size?: "form" | "compact" | "wide";
    fill?: boolean;
    /** Multi-step workspaces use the edge Sheet, never a center Dialog. */
    wizard?: boolean;
    titleBadge?: ReactNode;
    icon?: ReactNode;
    actions?: ReactNode;
    footerStart?: ReactNode;
    sidebar?: ReactNode;
    tabs?: {
        value: string;
        onValueChange: (value: string) => void;
        icons?: boolean;
        items: {
            value: string;
            label: string;
            count?: number;
            icon?: LucideIcon;
        }[];
    };
}) {
    const bodyRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        if (bodyResetKey !== undefined && bodyRef.current)
            bodyRef.current.scrollTop = 0;
    }, [open, bodyResetKey]);
    const close = () => {
        if (!busy) onClose();
    };
    const effectivePresentation = wizard ? "sheet" : presentation;
    const closeButton = (
        <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={busy}
            onClick={close}
            aria-label="Schließen"
        >
            <X />
        </Button>
    );
    const body = (
        <SheetWorkspace
            sidebar={sidebar}
            sidebarSlot={wizard ? "wizard-rail" : "overlay-sidebar"}
        >
            <SheetBody
                ref={bodyRef}
                data-slot="overlay-body"
                inset={bodyInset}
                scroll={bodyScroll}
            >
                {tabs ? (
                    <TabsContent value={tabs.value}>{children}</TabsContent>
                ) : (
                    children
                )}
            </SheetBody>
        </SheetWorkspace>
    );
    const accessory = header && (
        <SheetToolbar data-slot="overlay-header-content">{header}</SheetToolbar>
    );
    const tabBar = tabs && (
        <SheetTabBar data-slot="overlay-tabs">
            {tabs.items.map((tab) => (
                <SheetTabTrigger
                    key={tab.value}
                    value={tab.value}
                    icon={tab.icon}
                    icons={tabs.icons}
                >
                    {tab.label}
                    {tab.count != null && (
                        <Badge size="sm" variant="secondary">
                            {tab.count}
                        </Badge>
                    )}
                </SheetTabTrigger>
            ))}
        </SheetTabBar>
    );
    const bottom = (footer || footerStart) && (
        <SheetFooter data-slot="overlay-footer" leading={footerStart}>
            {footer}
        </SheetFooter>
    );
    const caption = description ?? "";
    const Title = effectivePresentation === "dialog" ? DialogTitle : SheetTitle;
    const Description =
        effectivePresentation === "dialog"
            ? DialogDescription
            : SheetDescription;
    const heading = (
        <SheetHeading
            title={<Title>{title}</Title>}
            description={
                <Description className={caption ? undefined : "sr-only"}>
                    {caption || title}
                </Description>
            }
            badge={titleBadge}
            icon={icon}
            actions={
                <SheetActions data-slot="overlay-actions">
                    {actions}
                    {closeButton}
                </SheetActions>
            }
        />
    );
    const surface =
        effectivePresentation === "dialog" ? (
            <Dialog open={open} onOpenChange={(v) => !v && close()}>
                <DialogContent
                    showCloseButton={false}
                    data-stacked={stacked || undefined}
                    data-wizard={wizard || undefined}
                    className={cn(
                        "crud-dialog flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 shadow-2xl",
                        fill && "h-[min(52rem,92dvh)]",
                        size === "compact"
                            ? "sm:max-w-lg"
                            : size === "wide"
                              ? "sm:max-w-5xl"
                              : "sm:max-w-3xl",
                    )}
                >
                    <SheetHeader data-slot="dialog-header">
                        {heading}
                    </SheetHeader>
                    {accessory}
                    {tabBar}
                    {body}
                    {bottom}
                    {nested}
                </DialogContent>
            </Dialog>
        ) : (
            <Sheet open={open} onOpenChange={(v) => !v && close()}>
                <SheetContent
                    showCloseButton={false}
                    stacked={stacked}
                    data-wizard={wizard || undefined}
                    size={size}
                >
                    <SheetHeader>{heading}</SheetHeader>
                    {accessory}
                    {tabBar}
                    {body}
                    {bottom}
                    {nested}
                </SheetContent>
            </Sheet>
        );
    return tabs ? (
        <Tabs
            value={tabs.value}
            onValueChange={(value) => tabs.onValueChange(String(value))}
            className="contents"
        >
            {surface}
        </Tabs>
    ) : (
        surface
    );
}
export function OverlayFooterHint({ children }: { children: ReactNode }) {
    return (
        <SheetHint>
            <Layers />
            {children}
        </SheetHint>
    );
}
