import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test.use({
    viewport: { width: 1440, height: 1000 },
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    reducedMotion: "reduce",
});

test("login, server search, lazy property tabs and wizard persistence", async ({
    page,
}) => {
    await mkdir("screenshots", { recursive: true });
    const capture = async (name: string) => {
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
            path: `screenshots/features-properties-${name}.png`,
            animations: "disabled",
        });
    };
    const errors: string[] = [];
    let propertyWrites = 0;
    page.on("request", (request) => {
        if (
            request.url().endsWith("/api/v1/properties/mutate") &&
            request.headers()["precognition"] !== "true"
        )
            propertyWrites++;
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await page.getByLabel("E-Mail-Adresse").fill("workspace-e2e@example.test");
    await page
        .getByLabel("Passwort", { exact: true })
        .fill(process.env.E2E_PASSWORD ?? "local-e2e-password-only");
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
    await expect(
        page.getByRole("heading", {
            name: "Willkommen, Browser.",
        }),
    ).toBeVisible();
    await page
        .getByRole("navigation", { name: "Hauptnavigation", exact: true })
        .locator('a[href="/properties"]')
        .click();
    await page
        .getByRole("textbox", { name: "Objekte durchsuchen" })
        .fill("Linden");
    await page.getByText("Lindenhöfe", { exact: true }).click();
    await expect(
        page.getByRole("heading", { name: "Lindenhöfe", exact: true }),
    ).toBeVisible();
    await expect(
        page
            .getByRole("list", { name: "Einheiten im Objekt", exact: true })
            .getByText("Wohnung 01", { exact: true }),
    ).toBeVisible();
    await capture("detail-populated-desktop");
    await page.setViewportSize({ width: 390, height: 844 });
    await capture("detail-populated-mobile");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("tab", { name: /Einheiten/ }).click();
    await expect(page.getByText("Wohnung 01", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Zähler", exact: true }).click();
    await expect(
        page.getByRole("heading", { name: "Zähler · vorbereitet" }),
    ).toBeVisible();
    await page
        .getByRole("navigation", { name: "Hauptnavigation", exact: true })
        .locator('a[href="/properties"]')
        .click();
    await page
        .getByRole("button", { name: "Objekt anlegen", exact: true })
        .click();
    const dialog = page.getByRole("dialog", { name: "Objekt anlegen" });
    await expect(dialog).toHaveAttribute("data-slot", "sheet-content");
    await expect(dialog).toHaveAttribute("data-wizard", "true");
    await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(0);
    await capture("new-01-object");
    await dialog.getByRole("button", { name: "Weiter", exact: true }).click();
    await expect(
        dialog.getByRole("textbox", { name: "Nummer", exact: true }),
    ).toHaveAttribute("aria-invalid", "true");
    const code = "E2E-" + Date.now();
    await dialog
        .getByRole("textbox", { name: "Nummer", exact: true })
        .fill(code);
    await dialog
        .getByRole("textbox", { name: "Bezeichnung", exact: true })
        .fill("Browser Test Objekt");
    await dialog.getByRole("button", { name: "Weiter", exact: true }).click();
    await dialog.getByLabel("Straße", { exact: false }).fill("Testweg");
    await dialog.getByLabel("Hausnummer").fill("7");
    await dialog.getByLabel("PLZ").fill("10115");
    await dialog.getByLabel("Ort", { exact: false }).fill("Berlin");
    await capture("new-02-address");
    await dialog.getByRole("button", { name: "Weiter", exact: true }).click();
    await capture("new-03-management");
    await dialog.getByRole("button", { name: "Weiter", exact: true }).click();
    await expect(dialog.getByLabel("Baujahr", { exact: true })).toBeVisible();
    await capture("new-04-building");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
        dialog.getByRole("tab", {
            name: "Gebäude & Hinweise, Schritt 4",
            exact: true,
        }),
    ).toBeInViewport({ ratio: 0.95 });
    await capture("new-mobile");
    await page.setViewportSize({ width: 1440, height: 1000 });
    expect(propertyWrites).toBe(0);
    await dialog
        .getByRole("button", { name: "Speichern", exact: true })
        .click();
    await expect(dialog).toHaveCount(0);
    expect(propertyWrites).toBe(1);
    await page.getByRole("textbox", { name: "Objekte durchsuchen" }).fill(code);
    await expect(
        page.getByText("Browser Test Objekt", { exact: true }),
    ).toBeVisible();
    // URL state, the wider sheet, and browser reload use the real application.
    await expect(page).toHaveURL(/q=/);
    const pagination = await page
        .locator('[data-slot="data-grid-pagination"]')
        .boundingBox();
    expect(pagination).not.toBeNull();
    expect(pagination!.y + pagination!.height).toBeLessThanOrEqual(
        page.viewportSize()!.height,
    );
    await page.getByRole("cell", { name: code, exact: true }).dblclick();
    await expect(
        page.getByRole("heading", { name: "Objekt bearbeiten", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/panel=/);
    const sheet = page.locator('[data-slot="sheet-content"]');
    expect((await sheet.boundingBox())!.width).toBeGreaterThan(600);
    await page.reload();
    await expect(
        page.getByRole("textbox", { name: "Bezeichnung", exact: true }),
    ).toHaveValue("Browser Test Objekt");
    await page
        .getByRole("button", {
            name: "Aktionen für Browser Test Objekt",
            exact: true,
        })
        .click();
    await page
        .getByRole("menuitem", { name: "Objektbericht als PDF", exact: true })
        .click();
    await expect(
        page.getByLabel("PDF-Seite 1", { exact: true }),
    ).toHaveAttribute("data-rendered", "true");
    await page
        .getByRole("button", { name: "Schließen", exact: true })
        .last()
        .click();
    await page.getByRole("button", { name: "Abbrechen", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
        page.getByRole("checkbox", { name: "Zeile auswählen", exact: true }),
    ).toHaveCount(0);
    await page
        .getByRole("button", {
            name: "Aktionen für Browser Test Objekt",
            exact: true,
        })
        .click();
    await page.getByRole("menuitem", { name: "Löschen", exact: true }).click();
    const deletion = page.getByRole("dialog", { name: "Löschen", exact: true });
    await expect(deletion).toBeVisible();
    await deletion
        .getByRole("button", { name: "Löschen", exact: true })
        .click();
    await expect(
        deletion.getByText("Das Objekt ist aktiv. Bitte zuerst archivieren."),
    ).toBeVisible();
    await deletion
        .getByRole("button", { name: "Abbrechen", exact: true })
        .click();
    await page.getByRole("link", { name: "Verträge", exact: true }).click();
    await page
        .getByRole("textbox", { name: "Verträge durchsuchen" })
        .fill("MV-001-01");
    await page.getByText("MV-001-01", { exact: true }).click();
    await expect(
        page.getByRole("heading", { name: "MV-001-01", exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: /Konditionen/ }).click();
    await expect(page).toHaveURL(/tab=rent-conditions/);
    await page.getByRole("button", { name: "Hinzufügen", exact: true }).click();
    await expect(
        page.getByRole("combobox", { name: /Vertrag/ }),
    ).toBeDisabled();
    await page.reload();
    await expect(
        page.getByRole("combobox", { name: /Vertrag/ }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Abbrechen", exact: true }).click();
    expect(errors).toEqual([]);
    await page.getByRole("button", { name: "Abmelden", exact: true }).click();
    await expect(
        page.getByRole("button", { name: "Anmelden", exact: true }),
    ).toBeVisible();
});
