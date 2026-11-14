import { DetailCard } from "./key-value-card";
import type { ReactNode } from "react";

/** Lightweight semantic form grouping; cards remain available for independent content. */
export function FormSection({
    title,
    description,
    hidden,
    variant = "plain",
    children,
}: {
    title: string;
    description?: string;
    hidden?: boolean;
    variant?: "plain" | "card";
    children: ReactNode;
}) {
    if (variant === "card")
        return (
            <fieldset
                data-slot="form-section"
                hidden={hidden}
                className="min-w-0 border-0 p-0"
            >
                <legend className="sr-only">{title}</legend>
                <DetailCard title={title} description={description}>
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
            <legend className="float-left w-full text-sm leading-6 font-semibold">
                {title}
            </legend>
            {description && (
                <p className="clear-both text-xs leading-5 text-muted-foreground">
                    {description}
                </p>
            )}
            <div className="clear-both">{children}</div>
        </fieldset>
    );
}
