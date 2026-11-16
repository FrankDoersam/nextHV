import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { BalanceTracker } from "./balance-tracker";

afterEach(cleanup);

it("renders the requested ReUI Chart 4 with transparent demo provenance", async () => {
    render(<BalanceTracker />);
    expect(screen.getByText("Portfolio-Balance")).toBeVisible();
    expect(screen.getByText("Beispieldaten · USD · keine Live-Verbindung")).toBeVisible();
    expect(screen.getByRole("group", { name: "Zeitraum" })).toBeVisible();
    expect(screen.getByRole("button", { name: "3M" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Vergleich" })).toHaveAttribute("aria-pressed", "false");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "1M" }));
    expect(screen.getByRole("button", { name: "1M" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Vergleich" }));
    expect(screen.getByRole("button", { name: "Vergleich" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Diagramm vergrößern" }));
    expect(screen.getByRole("dialog", { name: "Portfolio-Balance · Detailansicht" })).toBeVisible();
});
