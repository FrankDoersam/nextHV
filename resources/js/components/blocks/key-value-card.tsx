import type { ReactNode } from "react";
import {
    Frame,
    FrameDescription,
    FrameHeader,
    FramePanel,
    FrameTitle,
} from "@/components/reui/frame";
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
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
    const hasHeader = !!(title || description || actions);
    const content = (
        <KeyValueRows
            items={items}
            align={variant === "summary" ? "spread" : "start"}
        />
    );
    return (
        <section
            data-slot="key-value-card"
            aria-label={title ?? "Zusammenfassung"}
        >
            {variant === "framed" ? (
                <Frame spacing="sm" dense={!hasHeader}>
                    {hasHeader && (
                        <FrameHeader>
                            <div className="flex min-w-0 items-start justify-between gap-3">
                                <div className="min-w-0">
                                    {title && <FrameTitle>{title}</FrameTitle>}
                                    {description && (
                                        <FrameDescription>
                                            {description}
                                        </FrameDescription>
                                    )}
                                </div>
                                {actions}
                            </div>
                        </FrameHeader>
                    )}
                    <FramePanel fit>{content}</FramePanel>
                </Frame>
            ) : (
                <Card size="sm">
                    {hasHeader && (
                        <CardHeader>
                            {title && <CardTitle>{title}</CardTitle>}
                            {description && (
                                <CardDescription>{description}</CardDescription>
                            )}
                            {actions && <CardAction>{actions}</CardAction>}
                        </CardHeader>
                    )}
                    <CardContent>{content}</CardContent>
                </Card>
            )}
        </section>
    );
}
export const DetailCard = ContentCard;
