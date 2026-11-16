"use client";

/**
 * Small reusable shadcn/ReUI ChartContainer layer for the uploaded Chart 4.
 * Adapted from the supplied MIT-licensed chart.tsx (caovc, 2026).
 * All chart labels and colors are driven by the config, not hardcoded in tooltips.
 */
import * as React from "react";
import { ResponsiveContainer, Tooltip } from "recharts";
import { cn } from "@/lib/utils";

export type ChartConfig = Record<string, { label: string; color: string }>;
const ChartContext = React.createContext<ChartConfig | null>(null);

export function useChart() {
    const chart = React.useContext(ChartContext);
    if (!chart) throw new Error("Chart primitives must be used inside ChartContainer");
    return chart;
}

export function ChartContainer({
    config,
    children,
    className,
    ...props
}: React.ComponentProps<"div"> & {
    config: ChartConfig;
    children: React.ComponentProps<typeof ResponsiveContainer>["children"];
}) {
    return (
        <ChartContext.Provider value={config}>
            <div
                data-slot="chart"
                className={cn(
                    "min-w-0 w-full text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-surface]:outline-hidden",
                    className,
                )}
                {...props}
            >
                <ResponsiveContainer
                    initialDimension={{ width: 480, height: 300 }}
                    width="100%"
                    height="100%"
                >
                    {children}
                </ResponsiveContainer>
            </div>
        </ChartContext.Provider>
    );
}

export const ChartTooltip = Tooltip;

export function ChartTooltipContent({
    active,
    payload,
    label,
    formatValue,
}: {
    active?: boolean;
    payload?: readonly {
        dataKey?: string | number;
        name?: string | number;
        value?: number | string | readonly number[];
        color?: string;
    }[];
    label?: string | number;
    formatValue: (value: number) => string;
}) {
    const config = useChart();
    if (!active || !payload?.length) return null;
    return (
        <div
            data-slot="chart-tooltip"
            className="min-w-44 rounded-xl border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md"
        >
            <p className="mb-2 font-medium">{label}</p>
            <div className="space-y-1.5">
                {payload.filter((entry) => entry.value != null).map((entry, index) => {
                    const key = String(entry.dataKey ?? entry.name ?? index);
                    const entryConfig = config[key];
                    const rawValue = Array.isArray(entry.value)
                        ? Number(entry.value[0])
                        : Number(entry.value);
                    return (
                        <div key={key} className="flex items-center justify-between gap-5">
                            <span className="flex items-center gap-2 text-muted-foreground">
                                <span
                                    aria-hidden
                                    className="size-2 rounded-full"
                                    style={{ background: entryConfig?.color ?? entry.color }}
                                />
                                {entryConfig?.label ?? key}
                            </span>
                            <span className="font-semibold tabular-nums">{formatValue(rawValue)}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
