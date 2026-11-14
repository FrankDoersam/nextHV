import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface MetricCardProps {
    label: string;
    value: string;
    hint?: ReactNode;
    icon?: LucideIcon;
    badge?: ReactNode;
    actions?: ReactNode;
    suffix?: string;
    loading?: boolean;
    accent?: boolean;
    children?: ReactNode;
    density?: "default" | "compact";
    description?: string;
    appearance?: "card" | "inset";
}

/** Stats Overview anatomy: label, prominent value, separated supporting detail. */
export function MetricCard({
    label,
    value,
    hint,
    icon: Icon,
    badge,
    actions,
    suffix,
    loading,
    accent,
    children,
    density = "default",
    description,
    appearance = "card",
}: MetricCardProps) {
    const compact = density === "compact";
    return (
        <div
            data-slot="metric-card"
            data-density={density}
            title={description}
            className={cn(
                "@container/metric h-full min-w-0 bg-card",
                appearance === "card" && "rounded-xl border shadow-xs",
            )}
        >
            <div
                className={cn(
                    "flex min-w-0 flex-col",
                    compact ? "gap-2 px-3 py-3 sm:px-4" : "gap-3 p-4 sm:p-5",
                )}
            >
                <dl
                    className={cn(
                        "flex min-w-0 flex-1 flex-col",
                        compact ? "gap-1.5" : "gap-3",
                    )}
                >
                    <dt
                        className={cn(
                            "flex min-w-0 items-start justify-between gap-2 text-xs font-medium text-muted-foreground",
                            compact
                                ? "min-h-8 @min-[14rem]/metric:min-h-5"
                                : "min-h-10 sm:min-h-5 sm:items-center",
                        )}
                    >
                        <span className="min-w-0 break-words">{label}</span>
                        {actions ??
                            (Icon && (
                                <Icon aria-hidden className="size-4 shrink-0" />
                            ))}
                    </dt>
                    <dd className="flex min-h-8 min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span
                            className={cn(
                                "min-w-0 break-words text-xl font-semibold tracking-tight tabular-nums @min-[14rem]/metric:text-2xl",
                                accent && "text-primary",
                            )}
                        >
                            {loading ? (
                                <Skeleton
                                    role="status"
                                    aria-label={`${label} wird geladen`}
                                    className="h-8 w-24 max-w-full"
                                />
                            ) : (
                                value
                            )}
                        </span>
                        {suffix && !loading && (
                            <span className="text-xs text-muted-foreground">
                                {suffix}
                            </span>
                        )}
                        {!loading && badge}
                    </dd>
                </dl>
                {children}
                {hint && (
                    <div className="min-w-0 border-t pt-2.5 text-xs leading-5 text-muted-foreground">
                        <div className="min-h-10 sm:min-h-5">{hint}</div>
                    </div>
                )}
            </div>
        </div>
    );
}

export function MetricCardGrid({ children }: { children: ReactNode }) {
    return (
        <div
            data-slot="metric-grid"
            className="@container/metrics w-full min-w-0"
        >
            <div className="grid grid-cols-2 gap-2.5 @min-[40rem]/metrics:grid-cols-4">
                {children}
            </div>
        </div>
    );
}
