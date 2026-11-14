import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("capture dashboard, contracts table, detail, create and edit with responsive layout checks", async ({
    page,
}) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await mkdir("screenshots", { recursive: true });
    await page.clock.setFixedTime(new Date("2026-11-13T10:00:00+01:00"));
    const checkPageWidth = async () => {
        expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(page.viewportSize()!.width);
    };
    const checkTabLayout = async () => {
        const tabs = await page.getByRole("tablist").boundingBox();
        const panel = await page.getByRole("tabpanel").boundingBox();
        const main = await page.getByRole("main").boundingBox();
        expect(tabs).not.toBeNull();
        expect(panel).not.toBeNull();
        expect(panel!.y).toBeGreaterThanOrEqual(tabs!.y + tabs!.height);
        expect(panel!.width).toBeGreaterThan(main!.width - 64);
        await checkPageWidth();
    };
    const capture = async (name: string) => {
        await page.evaluate(() => document.fonts.ready);
        await expect(
            page.getByRole("status", { name: "Wird geladen", exact: true }),
        ).toHaveCount(0);
        await checkPageWidth();
        await page.screenshot({
            path: `screenshots/${name}.png`,
            animations: "disabled",
            fullPage: (await page.getByRole("dialog").count()) === 0,
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
    await expect(
        page.getByRole("combobox", { name: "Vorschau-Zeitraum" }),
    ).toHaveText("Dieser Monat");
    await checkTabLayout();
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
    await page
        .getByRole("combobox", { name: "Filter hinzufügen", exact: true })
        .click();
    await page.getByRole("option", { name: "Status", exact: true }).click();
    await page
        .getByRole("combobox", { name: "Status Werte", exact: true })
        .click();
    await page.getByRole("option", { name: "Aktiv", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(
        page.locator('[data-slot="resource-collection"]'),
    ).not.toHaveAttribute("aria-busy", "true");
    await expect(page).toHaveURL(/filters=/);
    await capture("02-vertraege-tabelle");
    await page
        .getByRole("combobox", { name: "Status Werte", exact: true })
        .click();
    await expect(
        page.getByRole("option", { name: "Aktiv", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await capture("06-grid-filter");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "MV-001-01", exact: true }).click();
    await expect(
        page.getByRole("heading", { name: "MV-001-01", exact: true }),
    ).toBeVisible();
    await expect(
        page.getByText("Vertragsverwaltung", { exact: true }),
    ).toBeVisible();
    await checkTabLayout();
    await expect(
        page.getByRole("link", { name: "Demo Müller 1", exact: true }),
    ).toBeVisible();
    await capture("03-vertrag-detail");
    const detailUrl = page.url();

    await page.getByRole("button", { name: "Bearbeiten", exact: true }).click();
    await expect(
        page.getByRole("heading", { name: "Vertrag bearbeiten", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Nummer", { exact: false })).toHaveValue(
        "MV-001-01",
    );
    await expect(page).toHaveURL(/panels=/);
    await capture("05-vertrag-bearbeiten");
    await page.getByRole("button", { name: "Abbrechen", exact: true }).click();

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
    await page.getByRole("button", { name: "Abbrechen", exact: true }).click();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(detailUrl);
    await expect(
        page.getByText("Vertragsverwaltung", { exact: true }),
    ).toBeVisible();
    await checkTabLayout();
    await page.getByRole("button", { name: "Bearbeiten", exact: true }).click();
    await expect(
        page.getByRole("heading", { name: "Vertrag bearbeiten", exact: true }),
    ).toBeVisible();
    const mobileSheet = page.locator('[data-slot="sheet-content"]');
    expect(
        await mobileSheet.evaluate(
            (element) => element.scrollWidth - element.clientWidth,
        ),
    ).toBeLessThanOrEqual(1);
    await checkPageWidth();
    expect(errors).toEqual([]);
});
