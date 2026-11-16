import { describe, expect, it } from "vitest";
import { balanceChange, balanceDemoPoints, balanceStatistics } from "./balance-demo-data";

describe("ReUI Chart 4 deterministic demo dataset", () => {
    it("keeps trading dates unique and sorted for every period", () => {
        for (const [period, count] of [
            ["1M", 22], ["3M", 66], ["YTD", 207], ["1Y", 260],
        ] as const) {
            const rows = balanceDemoPoints(period);
            expect(rows).toHaveLength(count);
            expect(rows.every((row) => row.balance > 0 && row.benchmark > 0)).toBe(true);
            expect(new Set(rows.map((row) => row.date)).size).toBe(count);
            expect(rows.at(-1)?.date).toBe("2025-10-16");
            expect(rows[0].date < rows.at(-1)!.date).toBe(true);
            expect(rows.every((row) => ![0, 6].includes(
                new Date(row.date + "T12:00:00Z").getUTCDay(),
            ))).toBe(true);
        }
    });

    it("derives extrema and comparison from values, never fixed demo literals", () => {
        const rows = balanceDemoPoints("3M");
        const stats = balanceStatistics(rows);
        expect(stats.current).toBeCloseTo(24847.83, 2);
        expect(stats.maximum).toBe(Math.max(...rows.map((row) => row.balance)));
        expect(stats.minimum).toBe(Math.min(...rows.map((row) => row.balance)));
        expect(stats.versusBenchmark).toBeCloseTo(
            stats.changePercent - balanceChange(rows.at(-1)!.benchmark, rows[0].benchmark),
        );
        expect(stats.drawdown).toBeLessThanOrEqual(0);
        expect(stats.bestDailyIncrease).toBeGreaterThanOrEqual(0);
    });

    it("rejects empty data instead of presenting imaginary balances", () => {
        expect(() => balanceStatistics([])).toThrow("at least one value");
    });
});
