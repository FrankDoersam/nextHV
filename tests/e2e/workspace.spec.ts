import { expect, test } from "@playwright/test";
test("login, server search, lazy property tabs and wizard persistence", async ({
    page,
}) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await page.getByLabel("E-Mail-Adresse").fill("e2e@example.test");
    await page
        .getByLabel("Passwort", { exact: true })
        .fill(process.env.E2E_PASSWORD ?? "local-e2e-password-only");
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
    await expect(
        page.getByRole("heading", {
            name: "Willkommen, Browser.",
        }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Objekte", exact: true }).click();
    await page
        .getByRole("textbox", { name: "Objekte durchsuchen" })
        .fill("Linden");
    await page.getByRole("button", { name: "Lindenhöfe", exact: true }).click();
    await expect(
        page.getByRole("heading", { name: "Lindenhöfe", exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: /Einheiten/ }).click();
    await expect(
        page.getByRole("button", { name: "Wohnung 01", exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Zähler", exact: true }).click();
    await expect(
        page.getByRole("heading", { name: "Zähler · vorbereitet" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Objekte", exact: true }).click();
    await page
        .getByRole("button", { name: "Objekt anlegen", exact: true })
        .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Weiter", exact: true }).click();
    await expect(
        dialog.getByText("Dieses Feld ist erforderlich.").first(),
    ).toBeVisible();
    const code = "E2E-" + Date.now();
    await dialog.getByLabel("Nummer").fill(code);
    await dialog.getByLabel("Bezeichnung").fill("Browser Test Objekt");
    await dialog.getByRole("button", { name: "Weiter", exact: true }).click();
    await dialog.getByLabel("Straße", { exact: false }).fill("Testweg");
    await dialog.getByLabel("Hausnummer").fill("7");
    await dialog.getByLabel("PLZ").fill("10115");
    await dialog.getByLabel("Ort", { exact: false }).fill("Berlin");
    await dialog.getByRole("button", { name: "Weiter", exact: true }).click();
    await dialog.getByRole("button", { name: "Weiter", exact: true }).click();
    await dialog
        .getByRole("button", { name: "Speichern", exact: true })
        .click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("textbox", { name: "Objekte durchsuchen" }).fill(code);
    await expect(
        page.getByRole("button", { name: "Browser Test Objekt", exact: true }),
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
    await expect(page).toHaveURL(/panels=/);
    const sheet = page.locator('[data-slot="sheet-content"]');
    expect((await sheet.boundingBox())!.width).toBeGreaterThan(600);
    await page.reload();
    await expect(page.getByLabel("Bezeichnung", { exact: false })).toHaveValue(
        "Browser Test Objekt",
    );
    await page
        .getByRole("button", {
            name: "Aktionen für Browser Test Objekt",
            exact: true,
        })
        .click();
    await page
        .getByRole("menuitem", { name: "Objektbericht als PDF", exact: true })
        .click();
    await page
        .getByRole("button", { name: "Objektbericht als PDF", exact: true })
        .click();
    await expect(page.locator(".react-pdf__Page canvas")).toBeVisible();
    await page.getByRole("button", { name: "Vergrößern", exact: true }).click();
    await expect(page.getByText("125 %", { exact: true })).toBeVisible();
    await page
        .getByRole("button", { name: "An Breite anpassen", exact: true })
        .click();
    await page
        .getByRole("button", { name: "Schließen", exact: true })
        .last()
        .click();
    await page.getByRole("button", { name: "Abbrechen", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
        .getByRole("checkbox", { name: "Zeile auswählen", exact: true })
        .click();
    await page.getByRole("button", { name: "Löschen", exact: true }).click();
    await expect(
        page.getByRole("heading", {
            name: "Löschen nicht möglich",
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        page.getByText("Das Objekt ist aktiv. Bitte zuerst archivieren."),
    ).toBeVisible();
    await page
        .getByRole("button", { name: "Schließen", exact: true })
        .last()
        .click();
    await page.getByRole("link", { name: "Verträge", exact: true }).click();
    await page.getByRole("button", { name: "MV-001-01", exact: true }).click();
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
