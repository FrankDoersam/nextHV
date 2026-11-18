import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
export interface KeyValueItem {
    id: string;
    label: ReactNode;
    value: ReactNode;
    description?: ReactNode;
    emphasis?: boolean;
    separator?: boolean;
}
export function KeyValueRows({
    items,
    align = "start",
}: {
    items: KeyValueItem[];
    align?: "start" | "spread";
}) {
    return (
        <dl
            data-slot="key-value-list"
            className="@container/key-values min-w-0"
        >
            {items.map((item) => (
                <div
                    key={item.id}
                    className={cn(
                        "grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-start gap-x-3 gap-y-1 py-1.5 first:pt-0 last:pb-0",
                        item.emphasis && "font-semibold",
                    )}
                >
                    <dt
                        className={cn(
                            "min-w-0 break-words text-sm leading-5 text-muted-foreground",
                            item.emphasis && "text-foreground",
                        )}
                    >
                        {item.label}
                        {item.description && (
                            <span className="block text-xs font-normal leading-4 text-muted-foreground">
                                {item.description}
                            </span>
                        )}
                    </dt>
                    <dd
                        className={cn(
                            "min-w-0 whitespace-pre-wrap break-words text-sm leading-5 tabular-nums",
                            align === "spread" && "text-right",
                        )}
                    >
                        {item.value ?? "—"}
                    </dd>
                </div>
            ))}
        </dl>
    );
}
