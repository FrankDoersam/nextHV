import { DetailCard } from "./key-value-card";
import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared card anatomy is the default; plain fieldsets remain an explicit option. */
export function FormSection({
    title,
    description,
    hideHeading = false,
    hidden,
    variant = "card",
    collapsible,
    open,
    defaultOpen = true,
    onOpenChange,
    summary,
    actions,
    children,
}: {
    title: string;
    description?: string;
    /** Wizard steps already carry their own heading above the REUI Frame. */
    hideHeading?: boolean;
    hidden?: boolean;
    variant?: "plain" | "card" | "collapsible";
    collapsible?: boolean;
    open?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    summary?: ReactNode;
    actions?: ReactNode;
    children: ReactNode;
}) {
    const contentId = useId();
    const [expanded, setExpanded] = useState(defaultOpen);
    const isOpen = open ?? expanded;
    const appearance =
        collapsible === true
            ? "collapsible"
            : collapsible === false && variant === "collapsible"
              ? "plain"
              : variant;
    if (appearance === "collapsible")
        return (
            <fieldset
                data-slot="form-section"
                hidden={hidden}
                className="min-w-0 border-0 border-b pb-6 last:border-b-0 last:pb-0"
            >
                <legend className="sr-only">{title}</legend>
                <div className="flex min-w-0 items-center gap-3">
                    <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-sm py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        aria-label={title}
                        aria-expanded={isOpen}
                        aria-controls={contentId}
                        onClick={() => {
                            setExpanded(!isOpen);
                            onOpenChange?.(!isOpen);
                        }}
                    >
                        <span className="shrink-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                            {title}
                        </span>
                        {!isOpen && summary && (
                            <span className="ml-auto min-w-0 truncate text-xs text-muted-foreground">
                                {summary}
                            </span>
                        )}
                        <ChevronDown
                            aria-hidden
                            className={cn(
                                "ml-auto size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
                                isOpen && "rotate-180",
                            )}
                        />
                    </button>
                    {actions}
                </div>
                <div id={contentId} hidden={!isOpen} className="pt-5">
                    {description && (
                        <p className="mb-4 text-xs leading-5 text-muted-foreground">
                            {description}
                        </p>
                    )}
                    {children}
                </div>
            </fieldset>
        );
    if (appearance === "card")
        return (
            <fieldset
                data-slot="form-section"
                hidden={hidden}
                className="min-w-0 border-0 p-0"
            >
                <legend className="sr-only">{title}</legend>
                <DetailCard
                    title={hideHeading ? undefined : title}
                    description={hideHeading ? undefined : description}
                    actions={actions}
                >
                    {children}
                </DetailCard>
            </fieldset>
        );
    return (
        <fieldset
            data-slot="form-section"
            hidden={hidden}
            className="min-w-0 space-y-4 border-0 p-0 not-first:border-t not-first:pt-6"
        >
            <legend className="sr-only">{title}</legend>
            {!hideHeading && (
                <>
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm leading-6 font-semibold">{title}</h3>
                        {actions}
                    </div>
                    {description && (
                        <p className="clear-both text-xs leading-5 text-muted-foreground">
                            {description}
                        </p>
                    )}
                </>
            )}
            <div className="clear-both">{children}</div>
        </fieldset>
    );
}

/** A wizard summary sits beside its fields only when the surface has room. */
export function FormLayout({
    children,
    summary,
    aside = false,
}: {
    children: ReactNode;
    summary?: ReactNode;
    aside?: boolean;
}) {
    return (
        <div
            data-slot="form-layout"
            className={cn(
                "grid min-w-0 items-start gap-6",
                aside &&
                    summary &&
                    "@min-[52rem]/form:grid-cols-[minmax(0,1fr)_18rem]",
            )}
        >
            <div className="min-w-0 space-y-6">{children}</div>
            {summary && (
                <aside
                    className={cn(
                        "min-w-0",
                        aside &&
                            "@min-[52rem]/form:sticky @min-[52rem]/form:top-0",
                    )}
                >
                    {summary}
                </aside>
            )}
        </div>
    );
}
