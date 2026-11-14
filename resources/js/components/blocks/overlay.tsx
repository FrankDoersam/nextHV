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
import { X, Layers } from "lucide-react";
import type { Presentation } from "@/framework/types";
import type { ReactNode } from "react";
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
}: {
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
}) {
    const close = () => {
        if (!busy) onClose();
    };
    const headClass =
        "relative shrink-0 gap-1.5 border-b bg-card px-5 py-5 pr-14 sm:px-7 sm:pr-16";
    const closeButton = (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={busy}
            onClick={close}
            aria-label="Schließen"
            className="absolute right-4 top-4"
        >
            <X />
        </Button>
    );
    const body = (
        <div className="@container/form min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background px-5 py-5 sm:px-7">
            {children}
        </div>
    );
    const accessory = header && (
        <div className="min-w-0 shrink-0 border-b bg-card px-5 py-4 sm:px-7">
            {header}
        </div>
    );
    const bottom = footer && (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t bg-card px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-7">
            {footer}
        </div>
    );
    const caption = description ?? "";
    if (presentation === "dialog")
        return (
            <Dialog open={open} onOpenChange={(v) => !v && close()}>
                <DialogContent
                    showCloseButton={false}
                    data-stacked={stacked || undefined}
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
                    <DialogHeader className={headClass}>
                        <DialogTitle className="text-lg leading-6 font-semibold">
                            {title}
                        </DialogTitle>
                        <DialogDescription
                            className={
                                caption
                                    ? "max-w-xl text-sm leading-5"
                                    : "sr-only"
                            }
                        >
                            {caption || title}
                        </DialogDescription>
                        {closeButton}
                    </DialogHeader>
                    {accessory}
                    {body}
                    {bottom}
                    {nested}
                </DialogContent>
            </Dialog>
        );
    return (
        <Sheet open={open} onOpenChange={(v) => !v && close()}>
            <SheetContent
                showCloseButton={false}
                data-stacked={stacked || undefined}
                className={cn(
                    "crud-sheet flex flex-col gap-0 overflow-hidden p-0 shadow-2xl data-[side=right]:w-full data-[side=right]:sm:max-w-[min(52rem,calc(100vw-3rem))]",
                    size === "wide" &&
                        "data-[side=right]:sm:max-w-[min(64rem,calc(100vw-3rem))]",
                )}
            >
                <SheetHeader className={headClass}>
                    <SheetTitle className="text-lg font-semibold">
                        {title}
                    </SheetTitle>
                    <SheetDescription
                        className={
                            caption ? "max-w-xl text-sm leading-5" : "sr-only"
                        }
                    >
                        {caption || title}
                    </SheetDescription>
                    {closeButton}
                </SheetHeader>
                {accessory}
                {body}
                {bottom}
                {nested}
            </SheetContent>
        </Sheet>
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
