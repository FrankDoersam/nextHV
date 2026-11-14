import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Frame, FramePanel } from "@/components/reui/frame";
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
}: MetricCardProps) {
    return (
        <Frame data-slot="metric-card" className="h-full min-w-0" spacing="sm">
            <FramePanel className="flex min-w-0 flex-col gap-3 p-3 sm:p-4">
                <dl className="flex min-w-0 flex-1 flex-col gap-3">
                    <dt className="flex min-h-5 min-w-0 items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
                        <span className="min-w-0 break-words">{label}</span>
                        {actions ??
                            (Icon && (
                                <Icon aria-hidden className="size-4 shrink-0" />
                            ))}
                    </dt>
                    <dd className="flex min-h-8 min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span
                            className={cn(
                                "min-w-0 break-words text-xl font-semibold tracking-tight tabular-nums sm:text-2xl",
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
                        {hint}
                    </div>
                )}
            </FramePanel>
        </Frame>
    );
}

export function MetricCardGrid({ children }: { children: ReactNode }) {
    return (
        <div
            data-slot="metric-grid"
            className="@container/metrics w-full min-w-0"
        >
            <div className="grid grid-cols-2 gap-3 @min-[48rem]/metrics:grid-cols-4">
                {children}
            </div>
        </div>
    );
}
