import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

/** Two browser screenshots from the isolated seeded nextHV app. */
test("ReUI Nova: Kernsanierung and CSV import with lower select open", async ({ page }) => {
    test.setTimeout(180_000);
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));

    await mkdir("screenshots", { recursive: true });
    await page.goto("/");
    await page.getByLabel("E-Mail-Adresse").fill("e2e@example.test");
    await page.getByLabel("Passwort", { exact: true }).fill(
        process.env.E2E_PASSWORD ?? "local-e2e-password-only",
    );
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Willkommen, Browser." })).toBeVisible();

    await page.goto("/kernsanierung-2027");
    await expect(page.getByRole("heading", { name: "Kernsanierung Wohnung" })).toBeVisible();
    await expect(page.locator('[data-slot="gantt"]')).toBeVisible();
    await expect(page.getByText("Fußbodenheizung + Verteiler").first()).toBeVisible();
    await page.evaluate(async () => { await document.fonts.ready; });
    await page.screenshot({
        path: "screenshots/kernsanierung-2027.png",
        fullPage: true,
        animations: "disabled",
    });

    await page.goto("/csv-import-nova");
    await expect(page.getByRole("heading", { name: "Upload Files" })).toBeVisible();
    // Open the lower "Import into" Select in step 1, preserving open state.
    const targetSelect = page.locator("#reui-import-target");
    await expect(targetSelect).toBeVisible();
    await targetSelect.scrollIntoViewIfNeeded();
    await targetSelect.click();
    await expect(page.getByRole("option", { name: "Companies" })).toBeVisible();
    await page.evaluate(async () => { await document.fonts.ready; });
    await page.screenshot({
        path: "screenshots/csv-import-nova-select-geoeffnet.png",
        fullPage: true,
        animations: "disabled",
    });

    expect(runtimeErrors, "No uncaught browser runtime errors").toEqual([]);
});