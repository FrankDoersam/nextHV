/**
 * ReUI Pro Chart 4 "Balance Tracker" sample series.
 * Adapted from the MIT-licensed source supplied by the user:
 * Copyright (c) 2026 caovc. Synthetic values, not financial account data.
 */
export type BalancePeriod = "1M" | "3M" | "YTD" | "1Y";

export interface BalancePoint {
    date: string;
    label: string;
    balance: number;
    benchmark: number;
}

const referenceDate = "2025-10-16";
const lengths: Record<BalancePeriod, number> = {
    "1M": 22,
    "3M": 66,
    YTD: 207,
    "1Y": 260,
};

function tradingDays(count: number) {
    const end = new Date(referenceDate + "T12:00:00Z");
    const days: string[] = [];
    while (days.length < count) {
        if (end.getUTCDay() !== 0 && end.getUTCDay() !== 6)
            days.unshift(end.toISOString().slice(0, 10));
        end.setUTCDate(end.getUTCDate() - 1);
    }
    return days;
}

const anchors: [number, number][] = [
    [0, 23447.11], [0.16, 24800], [0.45, 26352.07],
    [0.69, 25250], [0.86, 23710], [1, 24847.83],
];

const sampleBalances = Array.from({ length: 260 }, (_, index) => {
    if (index < 194)
        return 22000 + (index / 194) * 1447.11 + Math.sin(index * 0.19) * 420;
    const t = (index - 194) / 65;
    const rightIndex = Math.max(0, anchors.findIndex(([position]) => position >= t));
    const left = anchors[Math.max(0, rightIndex - 1)];
    const right = anchors[rightIndex];
    const interpolated = left[1] +
        (right[1] - left[1]) * (right[0] === left[0] ? 0 : (t - left[0]) / (right[0] - left[0]));
    if (index === 194) return 23447.11;
    if (index === 259) return 24847.83;
    return Math.min(26352.07, Math.max(23447.11,
        interpolated + Math.sin(index * 2.34) * 155 * Math.sin(t * Math.PI),
    ));
});

export function balanceDemoPoints(period: BalancePeriod): BalancePoint[] {
    const count = lengths[period];
    const values = sampleBalances.slice(-count);
    const days = tradingDays(count);
    const first = values[0];
    const dateFormatter = new Intl.DateTimeFormat("de-DE", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
    });
    return values.map((value, index) => ({
        date: days[index],
        label: dateFormatter.format(new Date(days[index] + "T12:00:00Z")),
        balance: Number(value.toFixed(2)),
        benchmark: Number((first * (1 + 0.0384 * index / Math.max(1, count - 1))).toFixed(2)),
    }));
}

export function balanceChange(current: number, before: number) {
    return before ? (current / before - 1) * 100 : 0;
}

export interface BalanceStatistics {
    current: number;
    changePercent: number;
    changeAbsolute: number;
    average: number;
    maximum: number;
    minimum: number;
    maximumIndex: number;
    minimumIndex: number;
    drawdown: number;
    versusBenchmark: number;
    bestDailyIncrease: number;
    bestDay: string;
}

export function balanceStatistics(rows: BalancePoint[]): BalanceStatistics {
    if (!rows.length) throw new Error("Balance Tracker requires at least one value");
    const first = rows[0].balance;
    const current = rows[rows.length - 1].balance;
    const values = rows.map((row) => row.balance);
    const maximum = Math.max(...values);
    const minimum = Math.min(...values);
    let peak = first;
    let drawdown = 0;
    let bestDailyIncrease = 0;
    let bestDay = rows[0].label;
    for (let i = 0; i < values.length; i++) {
        peak = Math.max(peak, values[i]);
        drawdown = Math.min(drawdown, balanceChange(values[i], peak));
        const delta = i > 0 ? values[i] - values[i - 1] : 0;
        if (delta > bestDailyIncrease) {
            bestDailyIncrease = delta;
            bestDay = rows[i].label;
        }
    }
    return {
        current,
        changePercent: balanceChange(current, first),
        changeAbsolute: current - first,
        average: values.reduce((sum, value) => sum + value, 0) / values.length,
        maximum,
        minimum,
        maximumIndex: values.indexOf(maximum),
        minimumIndex: values.indexOf(minimum),
        drawdown,
        versusBenchmark:
            balanceChange(current, first) -
            balanceChange(rows[rows.length - 1].benchmark, rows[0].benchmark),
        bestDailyIncrease,
        bestDay,
    };
}
