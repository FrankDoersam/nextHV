import type { ReactNode } from "react";
import {
    Frame,
    FrameHeader,
    FrameTitle,
    FrameDescription,
    FramePanel,
} from "@/components/reui/frame";
import { cn } from "@/lib/utils";
export interface KeyValueItem {
    id: string;
    label: ReactNode;
    value: ReactNode;
    description?: ReactNode;
    emphasis?: boolean;
    separator?: boolean;
}
/** Summary panel from an order form or framed detail card with reusable key/value rows. */
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
    const rows = (
        <dl className="min-w-0 space-y-3">
            {items.map((item) => (
                <div
                    key={item.id}
                    className={cn(
                        "flex min-w-0 items-start justify-between gap-4",
                        item.separator && "border-t pt-3",
                    )}
                >
                    <dt
                        className={cn(
                            "min-w-0 text-sm",
                            item.emphasis
                                ? "font-semibold text-foreground"
                                : "text-muted-foreground",
                        )}
                    >
                        {item.label}
                        {item.description && (
                            <span className="mt-1 block text-xs font-normal text-muted-foreground">
                                {item.description}
                            </span>
                        )}
                    </dt>
                    <dd
                        className={cn(
                            "min-w-0 max-w-[65%] break-words text-right text-sm tabular-nums",
                            item.emphasis && "text-base font-semibold",
                        )}
                    >
                        {item.value ?? "—"}
                    </dd>
                </div>
            ))}
        </dl>
    );
    if (variant === "summary")
        return (
            <section
                data-slot="key-value-card"
                aria-label={title ?? "Zusammenfassung"}
                className="min-w-0 rounded-xl border bg-muted/40 p-4"
            >
                {title && (
                    <h3 className="mb-3 text-sm font-semibold">{title}</h3>
                )}
                {rows}
            </section>
        );
    return (
        <DetailCard
            title={title ?? "Details"}
            description={description}
            actions={actions}
        >
            {rows}
        </DetailCard>
    );
}
export function DetailCard({
    title,
    description,
    actions,
    children,
}: {
    title: string;
    description?: string;
    actions?: ReactNode;
    children: ReactNode;
}) {
    return (
        <Frame spacing="default" className="min-w-0 bg-muted/40">
            <FrameHeader className="flex-row items-start justify-between gap-3">
                <div className="min-w-0">
                    <FrameTitle>{title}</FrameTitle>
                    {description && (
                        <FrameDescription className="mt-1 text-xs leading-5">
                            {description}
                        </FrameDescription>
                    )}
                </div>
                {actions}
            </FrameHeader>
            <FramePanel className="min-w-0 p-4">{children}</FramePanel>
        </Frame>
    );
}
