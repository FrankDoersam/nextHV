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
import type { Presentation } from "@/framework/types";
import type { ReactNode } from "react";
export function Overlay({
    open,
    onClose,
    title,
    description,
    children,
    presentation = "sheet",
    footer,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    children: ReactNode;
    presentation?: Presentation;
    footer?: ReactNode;
}) {
    const body = (
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {children}
        </div>
    );
    const bottom = footer && (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t bg-muted/30 px-6 py-4">
            {footer}
        </div>
    );
    if (presentation === "dialog")
        return (
            <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
                <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
                    <DialogHeader className="shrink-0 border-b px-6 py-5">
                        <DialogTitle>{title}</DialogTitle>
                        <DialogDescription>
                            {description ??
                                "Änderungen werden mit Speichern übernommen."}
                        </DialogDescription>
                    </DialogHeader>
                    {body}
                    {bottom}
                </DialogContent>
            </Dialog>
        );
    return (
        <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
            <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
                <SheetHeader className="shrink-0 border-b px-6 py-5">
                    <SheetTitle>{title}</SheetTitle>
                    <SheetDescription>
                        {description ??
                            "Änderungen werden mit Speichern übernommen."}
                    </SheetDescription>
                </SheetHeader>
                {body}
                {bottom}
            </SheetContent>
        </Sheet>
    );
}
