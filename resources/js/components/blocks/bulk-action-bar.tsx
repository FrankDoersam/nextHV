import type { ReactNode } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
export function BulkActionBar({
    count,
    onClear,
    children,
    pageFlow = false,
}: {
    count: number;
    onClear: () => void;
    children: ReactNode;
    pageFlow?: boolean;
}) {
    return (
        <div
            role="region"
            aria-label="Auswahlaktionen"
            className={cn(
                "pointer-events-none absolute inset-x-2 bottom-16 z-20 flex justify-center",
                pageFlow && "fixed bottom-20 md:absolute md:bottom-16",
            )}
        >
            <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-2 rounded-3xl border border-white/10 bg-invert p-2 pl-4 text-invert-foreground shadow-xl shadow-black/15 sm:rounded-full">
                <span
                    className="flex items-center gap-2 pr-2 text-xs font-medium whitespace-nowrap"
                    aria-live="polite"
                >
                    <Check className="size-4" />
                    {count} ausgewählt
                </span>
                {children}
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="rounded-full text-invert-foreground hover:bg-white/15 hover:text-white"
                    aria-label="Auswahl aufheben"
                    onClick={onClear}
                >
                    <X />
                </Button>
            </div>
        </div>
    );
}
