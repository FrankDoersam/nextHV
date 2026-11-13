import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("capture dashboard, contracts table, contract detail and create flow", async ({
    page,
}) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await mkdir("screenshots", { recursive: true });
    await page.clock.setFixedTime(new Date("2026-11-13T10:00:00+01:00"));
    const capture = async (name: string) => {
        await page.evaluate(() => document.fonts.ready);
        await expect(
            page.getByRole("status", { name: "Wird geladen", exact: true }),
        ).toHaveCount(0);
        await page.screenshot({
            path: `screenshots/${name}.png`,
            animations: "disabled",
            fullPage: true,
        });
    };
    await page.goto("/");
    await page.getByLabel("E-Mail-Adresse").fill("e2e@example.test");
    await page
        .getByLabel("Passwort", { exact: true })
        .fill(process.env.E2E_PASSWORD ?? "local-e2e-password-only");
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
    await expect(
        page.getByRole("heading", { name: "Willkommen, Browser." }),
    ).toBeVisible();
    await capture("01-dashboard");

    await page.getByRole("link", { name: "Verträge", exact: true }).click();
    await page
        .getByRole("textbox", { name: "Verträge durchsuchen" })
        .fill("MV-001");
    await expect(
        page.getByRole("button", { name: "MV-001-01", exact: true }),
    ).toBeVisible();
    await expect(
        page.locator('[data-slot="resource-collection"]'),
    ).not.toHaveAttribute("aria-busy", "true");
    await capture("02-vertraege-tabelle");

    await page.getByRole("button", { name: "MV-001-01", exact: true }).click();
    await expect(
        page.getByRole("heading", { name: "MV-001-01", exact: true }),
    ).toBeVisible();
    await expect(
        page.getByText("Vertragsverwaltung", { exact: true }),
    ).toBeVisible();
    await capture("03-vertrag-detail");

    await page
        .getByRole("link", { name: "Verträge", exact: true })
        .first()
        .click();
    await page
        .getByRole("button", { name: "Vertrag anlegen", exact: true })
        .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByLabel("Nummer", { exact: false })).toBeVisible();
    await capture("04-vertrag-anlegen");
    expect(errors).toEqual([]);
});
