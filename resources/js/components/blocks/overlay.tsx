import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
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
    const headClass = cn(
        "relative shrink-0 gap-0 border-b bg-card px-5 py-5 sm:px-6",
        wizard && "py-4 sm:py-4",
    );
    const closeButton = (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={busy}
            onClick={close}
            aria-label="Schließen"
            className="shrink-0"
        >
            <X />
        </Button>
    );
    const body = (
        <div className="@container/overlay flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className={cn(
                "flex min-h-0 flex-1 flex-col",
                wizard ? "@min-[48rem]/overlay:flex-row" : "@min-[40rem]/overlay:flex-row",
            )}>
                {sidebar && (
                    <aside
                        data-slot={wizard ? "wizard-rail" : "overlay-sidebar"}
                        className={cn(
                            "min-w-0 shrink-0 border-b",
                            wizard
                                ? "w-full bg-muted/30 p-4 @min-[48rem]/overlay:w-60 @min-[48rem]/overlay:overflow-y-auto @min-[48rem]/overlay:border-r @min-[48rem]/overlay:border-b-0 @min-[48rem]/overlay:px-4 @min-[48rem]/overlay:py-6"
                                : "bg-muted/40 px-5 py-4 @min-[40rem]/overlay:w-52 @min-[40rem]/overlay:overflow-y-auto @min-[40rem]/overlay:border-r @min-[40rem]/overlay:border-b-0 @min-[40rem]/overlay:py-7",
                        )}
                    >
                        {sidebar}
                    </aside>
                )}
                <div
                    ref={bodyRef}
                    data-slot="overlay-body"
                    className={cn(
                        "@container/form min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-card px-5 py-6 sm:px-6",
                        wizard && "px-4 py-6 sm:px-7 sm:py-7",
                        !bodyInset && "p-0 sm:p-0",
                        bodyScroll === "managed" &&
                            "flex flex-col overflow-hidden",
                    )}
                >
                    {tabs ? (
                        <TabsContent value={tabs.value}>{children}</TabsContent>
                    ) : (
                        children
                    )}
                </div>
            </div>
        </div>
    );
    const accessory = header && (
        <div
            data-slot="overlay-header-content"
            className={cn(
                "min-w-0 shrink-0 border-b bg-muted/20 px-5 py-4 sm:px-6",
                wizard && "bg-card py-3 sm:py-3",
            )}
        >
            {header}
        </div>
    );
    const tabBar = tabs && (
        <div
            data-slot="overlay-tabs"
            className="min-w-0 shrink-0  border-b bg-card px-5 sm:px-6"
        >
            <TabsList
                responsive
                variant="line"
                className="data-[orientation=horizontal]:h-12 min-w-0 gap-3 [&_[data-slot=tabs-trigger][data-active]]:text-foreground [&_[data-slot=tabs-trigger]]:after:bg-foreground"
            >
                {tabs.items.map((tab) => (
                    <TabsTrigger
                        key={tab.value}
                        value={tab.value}
                        icon={tab.icon}
                        icons={tabs.icons}
                    >
                        {tab.label}
                        {tab.count != null && (
                            <span className="text-xs text-muted-foreground tabular-nums">
                                {tab.count}
                            </span>
                        )}
                    </TabsTrigger>
                ))}
            </TabsList>
        </div>
    );
    const bottom = (footer || footerStart) && (
        <div
            data-slot="overlay-footer"
            className={cn(
                "flex shrink-0 flex-wrap items-center justify-between gap-3 border-t bg-muted/30 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 [&_[data-slot=button]]:h-9 [&_[data-slot=button]]:min-w-24 [&_[data-slot=button]]:px-3",
                wizard && "bg-card pt-3 sm:pt-3",
            )}
        >
            <div className="flex min-w-0 flex-wrap items-center gap-3">
                {footerStart}
            </div>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                {footer}
            </div>
        </div>
    );
    const controls = (
        <div
            data-slot="overlay-actions"
            className="flex shrink-0 items-center gap-1"
        >
            {actions}
            {actions && <span className="mx-1 h-5 border-l" />}
            {closeButton}
        </div>
    );
    const caption = description ?? "";
    const Title =
        effectivePresentation === "dialog" ? DialogTitle : SheetTitle;
    const Description =
        effectivePresentation === "dialog" ? DialogDescription : SheetDescription;
    const heading = (
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 basis-48 items-start gap-3">
                {icon && (
                    <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border bg-muted/50 [&_svg]:size-5">
                        {icon}
                    </span>
                )}
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <Title className="text-base leading-6 font-semibold">
                            {title}
                        </Title>
                        {titleBadge}
                    </div>
                    <Description
                        className={
                            caption
                                ? "mt-1 max-w-xl break-words text-xs leading-5"
                                : "sr-only"
                        }
                    >
                        {caption || title}
                    </Description>
                </div>
            </div>
            <div className="ml-auto">{controls}</div>
        </div>
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
                    <DialogHeader className={headClass}>{heading}</DialogHeader>
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
                    data-stacked={stacked || undefined}
                    data-wizard={wizard || undefined}
                    className={cn(
                        "crud-sheet flex flex-col gap-0 overflow-hidden p-0 shadow-2xl data-[side=right]:w-full",
                        wizard
                            ? // REUI sheets attach to the viewport edge; do not float like dialogs.
                              "data-[side=right]:sm:inset-y-0 data-[side=right]:sm:right-0 data-[side=right]:sm:h-dvh data-[side=right]:sm:rounded-none data-[side=right]:sm:max-w-[min(60rem,100vw)]"
                            : "data-[side=right]:sm:inset-y-3 data-[side=right]:sm:right-3 data-[side=right]:sm:h-[calc(100dvh-1.5rem)] data-[side=right]:sm:rounded-2xl data-[side=right]:sm:max-w-[min(48rem,calc(100vw-3rem))]",
                        size === "wide" &&
                            (wizard
                                ? "data-[side=right]:sm:max-w-[min(72rem,100vw)]"
                                : "data-[side=right]:sm:max-w-[min(64rem,calc(100vw-3rem))]"),
                    )}
                >
                    <SheetHeader className={headClass}>{heading}</SheetHeader>
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
        <span className="mr-auto flex w-full items-center gap-2 text-xs sm:w-auto text-muted-foreground">
            <Layers className="size-3.5" />
            {children}
        </span>
    );
}
