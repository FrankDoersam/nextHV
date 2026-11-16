"use client";

/**
 * Adaptation of the user-supplied REUI Pro chart-4 Balance Tracker demo
 * (MIT, Copyright (c) 2026 caovc). Uses the existing Base-UI / Maia primitives.
 * The series is synthetic and intentionally never presented as live banking data.
 */
import { useMemo, useState } from "react";
import {
    CartesianGrid,
    ComposedChart,
    Line,
    ReferenceDot,
    ReferenceLine,
    XAxis,
    YAxis,
} from "recharts";
import { ArrowDownToLine, Expand, Layers, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Frame,
    FrameDescription,
    FrameFooter,
    FrameHeader,
    FramePanel,
    FrameTitle,
} from "@/components/reui/frame";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
    balanceDemoPoints,
    balanceStatistics,
    type BalancePeriod,
    type BalancePoint,
    type BalanceStatistics,
} from "./balance-demo-data";

const money = new Intl.NumberFormat("de-DE", { style: "currency", currency: "USD" });
const amount = (value: number) => money.format(value);
const compactAmount = (value: number) => (value / 1000).toLocaleString("de-DE", {
    maximumFractionDigits: 1,
}) + " Tsd.";
const signedPercent = (value: number) =>
    (value > 0 ? "+" : "") + value.toLocaleString("de-DE", {
        minimumFractionDigits: 2, maximumFractionDigits: 2,
    }) + " %";

const periods: { value: BalancePeriod; text: string }[] = [
    { value: "1M", text: "1M" },
    { value: "3M", text: "3M" },
    { value: "YTD", text: "YTD" },
    { value: "1Y", text: "1J" },
];

type Layers = { extrema: boolean; average: boolean; grid: boolean };

function BalanceLinePlot({
    rows,
    stats,
    compare,
    layers,
    large = false,
}: {
    rows: BalancePoint[];
    stats: BalanceStatistics;
    compare: boolean;
    layers: Layers;
    large?: boolean;
}) {
    const [focused, setFocused] = useState<number | null>(null);
    const activeIndex = focused === null ? null : Math.max(0, Math.min(focused, rows.length - 1));
    const active = activeIndex === null ? null : rows[activeIndex];
    const chartConfig = useMemo(() => ({
        balance: { label: "Portfoliowert", color: "#7561e9" },
        benchmark: { label: "Benchmark", color: "#9ca3af" },
    }), []);
    const domain: [number, number] = [
        Math.floor(stats.minimum / 1000) * 1000,
        Math.ceil(stats.maximum / 1000) * 1000,
    ];
    return (
        <div
            data-slot="balance-line-plot"
            role="group"
            tabIndex={0}
            aria-label="Portfoliowert als Liniendiagramm. Mit den Pfeiltasten Datenpunkte erkunden."
            className="min-w-0 rounded-xl outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
            onKeyDown={(event) => {
                if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                    event.preventDefault();
                    setFocused((index) => Math.max(0, Math.min(rows.length - 1,
                        (index ?? 0) + (event.key === "ArrowRight" ? 1 : -1),
                    )));
                } else if (event.key === "Home") {
                    event.preventDefault();
                    setFocused(0);
                } else if (event.key === "End") {
                    event.preventDefault();
                    setFocused(rows.length - 1);
                } else if (event.key === "Escape") {
                    setFocused(null);
                }
            }}
        >
            <ChartContainer
                data-slot="balance-chart"
                config={chartConfig}
                className={large ? "h-[min(52vh,450px)] min-h-64" : "h-64 sm:h-[320px]"}
            >
                <ComposedChart
                    data={rows}
                    accessibilityLayer
                    margin={{ top: 28, right: 18, bottom: 4, left: 0 }}
                >
                    {layers.grid && (
                        <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.7} />
                    )}
                    <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={10}
                        minTickGap={28}
                        tickFormatter={(date: string) =>
                            rows.find((row) => row.date === date)?.label ?? date}
                    />
                    <YAxis
                        yAxisId="left"
                        orientation="right"
                        domain={domain}
                        width={62}
                        tickCount={5}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={compactAmount}
                    />
                    <ChartTooltip
                        cursor={{ stroke: "var(--border)", strokeDasharray: "3 3" }}
                        content={<ChartTooltipContent formatValue={amount} />}
                    />
                    {layers.average && (
                        <ReferenceLine
                            yAxisId="left"
                            y={stats.average}
                            stroke={chartConfig.balance.color}
                            strokeDasharray="3 3"
                            label={{
                                value: "Ø " + compactAmount(stats.average),
                                position: "insideTopLeft",
                                fontSize: 10,
                                fill: chartConfig.balance.color,
                            }}
                        />
                    )}
                    {layers.extrema && [
                        { index: stats.maximumIndex, title: "Hoch", value: stats.maximum },
                        { index: stats.minimumIndex, title: "Tief", value: stats.minimum },
                    ].map((mark) => (
                        <ReferenceDot
                            key={mark.title}
                            yAxisId="left"
                            x={rows[mark.index].date}
                            y={mark.value}
                            r={4}
                            fill="var(--background)"
                            stroke={chartConfig.balance.color}
                            strokeWidth={2}
                            label={{
                                value: mark.title + " " + compactAmount(mark.value),
                                position: mark.index < rows.length * 0.15
                                    ? "right"
                                    : mark.index > rows.length * 0.85
                                      ? "left" : "top",
                                fontSize: 10,
                                fill: chartConfig.balance.color,
                            }}
                        />
                    ))}
                    <Line
                        yAxisId="left"
                        type="linear"
                        dataKey="balance"
                        name="balance"
                        stroke={chartConfig.balance.color}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 5, stroke: "var(--background)", strokeWidth: 2 }}
                        isAnimationActive={false}
                    />
                    {compare && (
                        <Line
                            yAxisId="left"
                            type="linear"
                            dataKey="benchmark"
                            name="benchmark"
                            stroke={chartConfig.benchmark.color}
                            strokeWidth={1.8}
                            strokeDasharray="5 5"
                            dot={false}
                            isAnimationActive={false}
                        />
                    )}
                    {active && (
                        <ReferenceDot
                            yAxisId="left"
                            x={active.date}
                            y={active.balance}
                            r={4}
                            fill={chartConfig.balance.color}
                            stroke="var(--background)"
                            strokeWidth={2}
                        />
                    )}
                </ComposedChart>
            </ChartContainer>
            {active && (
                <p data-slot="balance-keyboard-value" role="status" className="px-4 pb-2 text-xs text-muted-foreground">
                    {active.label}: <strong className="text-foreground">{amount(active.balance)}</strong>
                    {compare && " · Benchmark: " + amount(active.benchmark)}
                </p>
            )}
        </div>
    );
}

function exportDemoCsv(rows: BalancePoint[]) {
    const lines = [
        ["Datum", "Portfoliowert USD", "Benchmark USD"].join(";"),
        ...rows.map((point) => [
            point.date,
            point.balance.toFixed(2),
            point.benchmark.toFixed(2),
        ].join(";")),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
        type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "reui-chart-4-demodaten.csv";
    link.click();
    URL.revokeObjectURL(url);
}

export function BalanceTracker() {
    const [period, setPeriod] = useState<BalancePeriod>("3M");
    const [compare, setCompare] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [layers, setLayers] = useState<Layers>({
        extrema: true,
        average: false,
        grid: true,
    });
    const rows = useMemo(() => balanceDemoPoints(period), [period]);
    const stats = useMemo(() => balanceStatistics(rows), [rows]);

    const metricItems = [
        { label: "Max. Rückgang", value: signedPercent(stats.drawdown), detail: "Vom Hoch zum folgenden Tief" },
        {
            label: "Vs. Benchmark",
            value: signedPercent(stats.versusBenchmark),
            detail: "Benchmark " + signedPercent(3.84),
        },
        { label: "Durchschnittswert", value: amount(stats.average), detail: rows.length + " Handelstage" },
        { label: "Bester Tag", value: amount(stats.bestDailyIncrease), detail: stats.bestDay },
    ];
    return (
        <>
            <Frame
                data-slot="reui-chart-4"
                className="w-full min-w-0 max-w-6xl"
                aria-label="ReUI Chart 4 Balance Tracker"
            >
                <FrameHeader className="flex flex-row flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 flex-col gap-1">
                        <FrameTitle className="flex items-center gap-2">
                            <Wallet aria-hidden="true" className="size-4" />
                            Portfolio-Balance
                            <Badge variant="secondary" className="ml-1 text-[11px]">Demo</Badge>
                        </FrameTitle>
                        <FrameDescription className="text-xs">
                            Synthetisches Musterportfolio · ReUI Chart 4
                        </FrameDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div role="group" aria-label="Zeitraum" className="flex items-center gap-1 rounded-xl border bg-muted/40 p-1">
                            {periods.map((option) => (
                                <Button
                                    key={option.value}
                                    type="button"
                                    size="sm"
                                    variant={period === option.value ? "secondary" : "ghost"}
                                    aria-pressed={period === option.value}
                                    onClick={() => setPeriod(option.value)}
                                    className="h-7 min-w-9 px-2 text-xs"
                                >
                                    {option.text}
                                </Button>
                            ))}
                        </div>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            aria-pressed={compare}
                            onClick={() => setCompare((value) => !value)}
                        >
                            Vergleich
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                render={<Button type="button" size="sm" variant="outline" aria-label="Diagrammebenen" />}
                            >
                                <Layers aria-hidden="true" className="size-4" />
                                <span className="hidden sm:inline">Ebenen</span>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Anzeige</DropdownMenuLabel>
                                <DropdownMenuCheckboxItem
                                    checked={layers.extrema}
                                    onCheckedChange={(checked) => setLayers((current) => ({
                                        ...current, extrema: checked,
                                    }))}
                                >
                                    Hoch- und Tiefstwerte
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem
                                    checked={layers.average}
                                    onCheckedChange={(checked) => setLayers((current) => ({
                                        ...current, average: checked,
                                    }))}
                                >
                                    Durchschnittslinie
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem
                                    checked={layers.grid}
                                    onCheckedChange={(checked) => setLayers((current) => ({
                                        ...current, grid: checked,
                                    }))}
                                >
                                    Hilfslinien
                                </DropdownMenuCheckboxItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button type="button" variant="outline" size="icon-sm" aria-label="Diagramm vergrößern" onClick={() => setExpanded(true)}>
                            <Expand aria-hidden="true" className="size-4" />
                        </Button>
                        <Button type="button" variant="outline" size="icon-sm" aria-label="Demodaten als CSV exportieren" onClick={() => exportDemoCsv(rows)}>
                            <ArrowDownToLine aria-hidden="true" className="size-4" />
                        </Button>
                    </div>
                </FrameHeader>
                <FramePanel className="min-w-0 p-0">
                    <div className="px-4 pb-1 pt-5 sm:px-5">
                        <p className="text-xs text-muted-foreground">Portfoliowert · USD</p>
                        <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
                            {amount(stats.current)}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Badge
                                variant="outline"
                                className={stats.changePercent >= 0
                                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                    : "border-rose-300 bg-rose-50 text-rose-800"}
                            >
                                {signedPercent(stats.changePercent)}
                            </Badge>
                            <span>{amount(stats.changeAbsolute)} im gewählten Zeitraum</span>
                        </div>
                    </div>
                    <BalanceLinePlot rows={rows} stats={stats} compare={compare} layers={layers} />
                </FramePanel>
                <FramePanel className="p-0">
                    <dl data-slot="balance-statistics" className="grid grid-cols-2 divide-y sm:grid-cols-4 sm:divide-y-0">
                        {metricItems.map((item) => (
                            <div key={item.label} className="min-w-0 space-y-1 px-4 py-3 sm:py-4">
                                <dt className="text-xs text-muted-foreground">{item.label}</dt>
                                <dd className="break-words text-base font-semibold tabular-nums sm:text-lg">{item.value}</dd>
                                <dd className="text-xs leading-5 text-muted-foreground">{item.detail}</dd>
                            </div>
                        ))}
                    </dl>
                </FramePanel>
                <FrameFooter className="flex flex-row flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-2">
                        <span aria-hidden="true" className="size-1.5 rounded-full bg-amber-500" />
                        Beispieldaten · USD · keine Live-Verbindung
                    </span>
                    <span>Historischer Demo-Stichtag 16.10.2025</span>
                </FrameFooter>
            </Frame>
            <Dialog open={expanded} onOpenChange={setExpanded}>
                <DialogContent className="w-[min(1150px,96vw)] sm:max-w-none">
                    <DialogHeader>
                        <DialogTitle>Portfolio-Balance · Detailansicht</DialogTitle>
                        <DialogDescription>
                            Beispieldaten · Zeitraum {period} · kein Live-Konto
                        </DialogDescription>
                    </DialogHeader>
                    <BalanceLinePlot rows={rows} stats={stats} compare={compare} layers={layers} large />
                </DialogContent>
            </Dialog>
        </>
    );
}
