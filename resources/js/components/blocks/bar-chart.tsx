import { useId, useState } from "react";
import { cn } from "@/lib/utils";
export interface BarDatum {
    label: string;
    value: number;
    highlight?: boolean;
    forecast?: boolean;
}
/** Lightweight, keyboard-readable bars for overview cards; values remain available as text. */
export function BarChart({
    data,
    label,
    formatValue = String,
    goal,
    compact = false,
}: {
    data: BarDatum[];
    label: string;
    formatValue?: (value: number) => string;
    goal?: number;
    compact?: boolean;
}) {
    const id = useId();
    const [active, setActive] = useState<number>();
    const peak = Math.max(1, goal ?? 0, ...data.map((d) => d.value));
    const interval = 10 ** Math.floor(Math.log10(peak));
    const max = Math.ceil((peak * 1.1) / interval) * interval;
    const axisValue = (value: number) =>
        new Intl.NumberFormat("de-DE", {
            notation: "compact",
            maximumFractionDigits: 0,
        }).format(value);
    return (
        <figure
            aria-label={label}
            className={cn(
                "relative min-w-0",
                compact ? "pt-4" : "mt-6 pl-11 pt-3",
            )}
        >
            <div
                className={cn(
                    "relative flex items-end gap-1.5 border-b",
                    compact ? "h-12" : "h-52 gap-2 sm:gap-3",
                )}
            >
                {!compact &&
                    [0, 0.5, 1].map((fraction) => (
                        <div
                            key={fraction}
                            className="pointer-events-none absolute inset-x-0 border-t border-border/70"
                            style={{ bottom: `${fraction * 100}%` }}
                        >
                            <span className="absolute -left-11 -top-2 w-9 text-right text-[10px] tabular-nums text-muted-foreground">
                                {axisValue(max * fraction)}
                            </span>
                        </div>
                    ))}
                {goal != null && (
                    <div
                        className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-warning/60"
                        style={{ bottom: `${(goal / max) * 100}%` }}
                    >
                        {!compact && (
                            <span className="absolute -top-5 bg-card pr-2 text-[10px] text-warning">
                                Plan {formatValue(goal)}
                            </span>
                        )}
                    </div>
                )}
                {data.map((d, i) => (
                    <button
                        key={d.label}
                        type="button"
                        aria-label={`${d.label}: ${formatValue(d.value)}${d.forecast ? ", Vorschau" : ""}`}
                        aria-describedby={active === i ? id : undefined}
                        onMouseEnter={() => setActive(i)}
                        onMouseLeave={() => setActive(undefined)}
                        onFocus={() => setActive(i)}
                        onBlur={() => setActive(undefined)}
                        className={cn(
                            "relative min-w-0 flex-1 rounded-t-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                            d.highlight
                                ? "bg-primary"
                                : "bg-slate-300 hover:bg-slate-400",
                            d.forecast && "chart-forecast",
                        )}
                        style={{
                            height: `${Math.max(2, (d.value / max) * 100)}%`,
                        }}
                    />
                ))}
            </div>
            <div
                className={cn(
                    "mt-2 flex gap-1.5 text-[10px] text-muted-foreground",
                    compact && "justify-between",
                )}
            >
                {compact ? (
                    <>
                        <span>{data[0]?.label}</span>
                        <span>{data.at(-1)?.label}</span>
                    </>
                ) : (
                    data.map((d) => (
                        <span
                            key={d.label}
                            className={cn("min-w-0 flex-1 text-center")}
                        >
                            {d.label}
                        </span>
                    ))
                )}
            </div>
            {active !== undefined && (
                <div
                    id={id}
                    role="tooltip"
                    className="pointer-events-none absolute right-3 top-8 z-20 rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg"
                >
                    <span className="text-muted-foreground">
                        {data[active].label}
                    </span>
                    <p className="mt-1 font-semibold tabular-nums">
                        {formatValue(data[active].value)}
                    </p>
                </div>
            )}
        </figure>
    );
}
