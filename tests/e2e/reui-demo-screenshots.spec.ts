import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

/** Two browser screenshots from the isolated seeded nextHV app. */
test("ReUI Nova: Kernsanierung and CSV import with lower select open", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1600, height: 1200 });
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
        fullPage: false,
        animations: "disabled",
    });

    // ReUI c-gantt-1 tabbed settings popover; screenshot of the source-pattern.
    await page.getByRole("button", { name: "Gantt Einstellungen" }).click();
    await expect(page.getByRole("tab", { name: "Anzeige" })).toBeVisible();
    await expect(page.getByText("Abhängigkeitspfeile")).toBeVisible();
    await page.screenshot({
        path: "screenshots/kernsanierung-gantt-1-settings.png",
        fullPage: false,
        animations: "disabled",
    });
    await page.keyboard.press("Escape");

    // The Add Task action uses a reusable ReUI/Base UI Sheet, not inline form markup.
    await page.getByRole("button", { name: "Vorgang anlegen" }).first().click();
    const addSheet = page.getByRole("dialog", { name: "Vorgang anlegen" });
    await expect(addSheet).toBeVisible();
    await expect(addSheet.getByLabel("Bezeichnung")).toBeVisible();
    await expect(addSheet.getByRole("combobox", { name: "Gewerk", exact: true })).toBeVisible();
    await expect(addSheet.getByLabel("Frühester Start")).toBeVisible();
    await expect(addSheet.getByText("Vorgänger / Abhängigkeiten")).toBeVisible();
    await page.screenshot({
        path: "screenshots/kernsanierung-gantt-1-add-task-sheet.png",
        fullPage: false,
        animations: "disabled",
    });
    await addSheet.getByRole("button", { name: "Abbrechen" }).click();
    await expect(addSheet).not.toBeVisible();

    await page.getByRole("button", { name: "Budget, Bestellungen und Eingangsrechnungen öffnen" }).click();
    const financeSheet = page.getByRole("dialog", { name: "Projektfinanzen" });
    await expect(financeSheet).toBeVisible();
    await expect(financeSheet.getByRole("tab", { name: /Bestellungen/ })).toBeVisible();
    await expect(financeSheet.getByRole("tab", { name: /Rechnungen/ })).toBeVisible();
    await page.screenshot({
        path: "screenshots/kernsanierung-finanz-sheet.png",
        fullPage: false,
        animations: "disabled",
    });
    await financeSheet.getByRole("tab", {name:/Rechnungen/}).click();
    await expect(financeSheet.getByText("Eingangsrechnungen", {exact:true})).toBeVisible();
    await page.screenshot({
        path: "screenshots/kernsanierung-rechnungen-sheet.png",
        fullPage: false,
        animations: "disabled",
    });

    await page.goto("/csv-import-nova");
    await expect(page.getByRole("heading", { name: "Upload Files" })).toBeVisible();
    // Open the lower "Import into" Select in step 1, preserving open state.
    const targetSelect = page.locator("#reui-import-target");
    await expect(targetSelect).toBeVisible();
    await targetSelect.scrollIntoViewIfNeeded();
    await targetSelect.click();
    await expect(page.getByRole("option", { name: /^Companies/ })).toBeVisible();
    await expect(page.getByRole("option", { name: /^Companies/ }))
        .toContainText("Organizations and account details");
    await expect(page.getByRole("option", { name: /^Contacts/ }))
        .toContainText("People, emails and phone numbers");
    await expect(targetSelect).toHaveText("Contacts");
    await expect(targetSelect).not.toContainText("People, emails and phone numbers");
    await expect(targetSelect).toContainText("Contacts");
    const triggerBox = await targetSelect.boundingBox();
    const dropdownBox = await page.locator('[data-slot="select-content"]').boundingBox();
    expect(triggerBox).not.toBeNull();
    expect(dropdownBox).not.toBeNull();
    expect(dropdownBox!.y).toBeGreaterThanOrEqual(triggerBox!.y + triggerBox!.height - 2);
    await page.evaluate(async () => { await document.fonts.ready; });
    await page.screenshot({
        path: "screenshots/csv-import-nova-select-geoeffnet.png",
        fullPage: true,
        animations: "disabled",
    });

    // Three independent snapshots corresponding exactly to the submitted
    // ReUI HTML: Upload, Map Columns (with Owner warning), Preview Rows.
    await page.keyboard.press("Escape");
    const wizard = page.getByRole("form", { name: "CSV import wizard" });
    await expect(page.getByRole("option", { name: /^Companies/ })).toHaveCount(0);
    await expect(wizard.locator('[data-slot="field-group"]')).toBeVisible();
    await wizard.screenshot({
        path: "screenshots/csv-import-tab-1-upload.png",
        animations: "disabled",
    });

    await wizard.getByRole("button", { name: /Next Step/ }).click();
    await expect(wizard.getByRole("heading", { name: "Map Columns", level: 2 })).toBeVisible();
    await expect(wizard.getByText("Required field not mapped")).toBeVisible();
    await expect(wizard.getByText(/Owner needs a target field before validation/)).toBeVisible();
    await expect(wizard.getByRole("combobox", { name: "Map Name" })).toHaveText("Full name");
    await expect(wizard.getByRole("combobox", { name: "Map Owner" })).toHaveText("Do not import");
    await expect(wizard.getByRole("table", { name: "Column mapping" }).locator("tbody tr")).toHaveCount(8);
    await wizard.screenshot({
        path: "screenshots/csv-import-tab-2-map-columns.png",
        animations: "disabled",
    });

    await wizard.getByRole("button", { name: /Next Step/ }).click();
    await expect(wizard.getByRole("heading", { name: "Preview Rows", level: 2 })).toBeVisible();
    await expect(wizard.getByRole("table", { name: "Row preview" }).locator("tbody tr")).toHaveCount(5);
    await expect(wizard.getByText("1.212 valid")).toBeVisible();
    await expect(wizard.getByRole("combobox", { name: "Unique key" })).toHaveText("Email");
    await expect(wizard.getByText("24 warnings")).toBeVisible();
    await expect(wizard.getByText("12 errors")).toBeVisible();
    await wizard.screenshot({
        path: "screenshots/csv-import-tab-3-preview.png",
        animations: "disabled",
    });

    await wizard.getByRole("button", { name: /Next Step/ }).click();
    await expect(wizard.getByRole("heading", { name: "Duplicate Handling", level: 2 })).toBeVisible();
    await expect(wizard.getByText("36 rows match an existing contact by email.")).toBeVisible();
    const duplicates = wizard.getByRole("radiogroup", { name: "Duplicate handling" });
    await expect(duplicates.locator('[data-slot="item"]')).toHaveCount(3);
    await expect(duplicates.getByRole("radio", { name: "Skip existing" })).toHaveAttribute("aria-checked", "true");
    await expect(duplicates.getByText("Safest")).toBeVisible();
    await expect(duplicates.getByText("Recommended")).toBeVisible();
    await expect(duplicates.getByText("Risky")).toBeVisible();
    await wizard.screenshot({
        path: "screenshots/csv-import-tab-4-duplicates.png",
        animations: "disabled",
    });

    // The choice is interactive; restore the exact checked option in the reference HTML.
    await duplicates.getByRole("radio", { name: "Update existing" }).click();
    await expect(duplicates.getByRole("radio", { name: "Update existing" })).toHaveAttribute("aria-checked", "true");
    await duplicates.getByRole("radio", { name: "Skip existing" }).click();
    await expect(duplicates.getByRole("radio", { name: "Skip existing" })).toHaveAttribute("aria-checked", "true");

    await wizard.getByRole("button", { name: /Next Step/ }).click();
    await expect(wizard.getByRole("heading", { name: "Run Import", level: 2 })).toBeVisible();
    await expect(wizard.getByText("Ready to import")).toBeVisible();
    await expect(wizard.getByText("1.176 contacts import into the CRM, 36 skipped, 12 errors held back.")).toBeVisible();
    const importPlan = wizard.getByRole("heading", { name: "Import plan" }).locator("..");
    await expect(importPlan.locator("dl > div")).toHaveCount(4);
    await expect(wizard.getByRole("button", { name: "Import", exact: true })).toBeVisible();
    await wizard.screenshot({
        path: "screenshots/csv-import-tab-5-summary.png",
        animations: "disabled",
    });

    expect(runtimeErrors, "No uncaught browser runtime errors").toEqual([]);
});