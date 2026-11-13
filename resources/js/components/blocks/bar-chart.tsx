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
    const max = Math.max(1, goal ?? 0, ...data.map((d) => d.value)) * 1.12;
    return (
        <figure
            aria-label={label}
            className={cn("relative", compact ? "pt-3" : "pt-6")}
        >
            {!compact && (
                <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between font-mono text-[10px] text-muted-foreground">
                    <span>{formatValue(max)}</span>
                    <span>MONATLICHER VERLAUF</span>
                </div>
            )}
            <div
                className={cn(
                    "relative flex items-end gap-1.5 border-b",
                    compact ? "h-12" : "h-64 gap-2 sm:gap-3",
                )}
            >
                {goal != null && (
                    <div
                        className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-destructive/50"
                        style={{ bottom: `${(goal / max) * 100}%` }}
                    >
                        {!compact && (
                            <span className="absolute -top-5 bg-card pr-2 text-[10px] text-destructive">
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
                                ? "bg-foreground"
                                : "bg-stone-300 hover:bg-stone-400",
                            d.forecast && "chart-forecast",
                        )}
                        style={{
                            height: `${Math.max(2, (d.value / max) * 100)}%`,
                        }}
                    />
                ))}
            </div>
            <div className="mt-2 flex gap-1.5 text-[9px] text-muted-foreground">
                {data.map((d, i) => (
                    <span
                        key={d.label}
                        className={cn(
                            "min-w-0 flex-1 truncate text-center",
                            compact &&
                                i !== 0 &&
                                i !== data.length - 1 &&
                                "invisible",
                        )}
                    >
                        {d.label}
                    </span>
                ))}
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
