import type { ReactNode } from "react";
import { ContentCard } from "./content-card";
import { KeyValueRows, type KeyValueItem } from "./key-value-rows";
export type { KeyValueItem } from "./key-value-rows";
export function KeyValueCard({
    title,
    description,
    items,
    variant = "summary",
    actions,
}: {
    title?: string;
    description?: string;
    items: KeyValueItem[];
    variant?: "summary" | "framed";
    actions?: ReactNode;
}) {
    return (
        <section
            data-slot="key-value-card"
            aria-label={title ?? "Zusammenfassung"}
        >
            <ContentCard
                title={title}
                description={description}
                actions={actions}
                compact={variant === "summary"}
            >
                <KeyValueRows
                    items={items}
                    align={variant === "summary" ? "spread" : "start"}
                />
            </ContentCard>
        </section>
    );
}
export const DetailCard = ContentCard;
