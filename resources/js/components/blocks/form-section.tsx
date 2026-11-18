import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import {
    FieldDescription,
    FieldGroup,
    FieldLegend,
    FieldSet,
    FieldTitle,
} from "@/components/ui/field";
import { SheetSection } from "@/components/ui/sheet";
import { useId, useState, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Form semantics compose the shared ReUI section without another surface. */
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
            <FieldSet
                data-slot="form-section"
                hidden={hidden}
                className="min-w-0"
            >
                <FieldLegend className="sr-only">{title}</FieldLegend>
                <Accordion
                    value={isOpen ? [contentId] : []}
                    onValueChange={(values) => {
                        const nextOpen = values.includes(contentId);
                        setExpanded(nextOpen);
                        onOpenChange?.(nextOpen);
                    }}
                >
                    <AccordionItem value={contentId}>
                        <div className="flex min-w-0 items-center gap-3">
                            <div className="min-w-0 flex-1">
                                <AccordionTrigger aria-label={title}>
                                    <span>{title}</span>
                                    {!isOpen && summary && (
                                        <span className="min-w-0 truncate text-muted-foreground">
                                            {summary}
                                        </span>
                                    )}
                                </AccordionTrigger>
                            </div>
                            {actions}
                        </div>
                        <AccordionContent keepMounted>
                            <FieldGroup>
                                {description && (
                                    <FieldDescription>
                                        {description}
                                    </FieldDescription>
                                )}
                                {children}
                            </FieldGroup>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </FieldSet>
        );
    if (appearance === "card")
        return (
            <FieldSet
                data-slot="form-section"
                hidden={hidden}
                className="min-w-0"
            >
                <FieldLegend className="sr-only">{title}</FieldLegend>
                <SheetSection
                    title={title}
                    description={description}
                    actions={actions}
                    hideHeading={hideHeading}
                >
                    {children}
                </SheetSection>
            </FieldSet>
        );
    return (
        <FieldSet data-slot="form-section" hidden={hidden} className="min-w-0">
            <FieldLegend className={hideHeading ? "sr-only" : undefined}>
                <span className="flex items-center justify-between gap-3">
                    <span>{title}</span>
                    {!hideHeading && actions}
                </span>
            </FieldLegend>
            {!hideHeading && description && (
                <FieldDescription>{description}</FieldDescription>
            )}
            <FieldGroup>{children}</FieldGroup>
        </FieldSet>
    );
}

export function FormHeading({
    title,
    description,
    status,
    ...props
}: Omit<ComponentProps<"div">, "title"> & {
    title: ReactNode;
    description?: ReactNode;
    status?: ReactNode;
}) {
    return (
        <FieldGroup {...props}>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
                <FieldTitle role="heading" aria-level={2}>
                    {title}
                </FieldTitle>
                {status && (
                    <FieldDescription aria-live="polite" aria-atomic="true">
                        {status}
                    </FieldDescription>
                )}
            </div>
            {description && <FieldDescription>{description}</FieldDescription>}
        </FieldGroup>
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
            <FieldGroup className="min-w-0">{children}</FieldGroup>
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
