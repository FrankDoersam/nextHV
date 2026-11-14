import { expect, test } from "@playwright/test";
test("login, server search, lazy property tabs and wizard persistence", async ({
    page,
}) => {
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
    await page
        .getByRole("navigation", { name: "Hauptnavigation", exact: true })
        .getByRole("link", { name: /^Objekte(?:\s|$)/ })
        .click();
    await page
        .getByRole("textbox", { name: "Objekte durchsuchen" })
        .fill("Linden");
    await page.getByText("Lindenhöfe", { exact: true }).click();
    await expect(
        page.getByRole("heading", { name: "Lindenhöfe", exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: /Einheiten/ }).click();
    await expect(
        page.getByText("Wohnung 01", { exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Zähler", exact: true }).click();
    await expect(
        page.getByRole("heading", { name: "Zähler · vorbereitet" }),
    ).toBeVisible();
    await page
        .getByRole("navigation", { name: "Hauptnavigation", exact: true })
        .getByRole("link", { name: /^Objekte(?:\s|$)/ })
        .click();
    await page
        .getByRole("button", { name: "Objekt anlegen", exact: true })
        .click();
    const dialog = page.getByRole("dialog");
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
    await dialog.getByRole("button", { name: "Weiter", exact: true }).click();
    await dialog.getByRole("button", { name: "Weiter", exact: true }).click();
    await expect(dialog.getByLabel("Baujahr", { exact: true })).toBeVisible();
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
    await page
        .getByRole("button", { name: "Objektbericht als PDF", exact: true })
        .click();
    await expect(page.getByLabel("PDF-Seitenansicht")).toHaveAttribute(
        "data",
        /^blob:/,
    );
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
        .getByRole("button", { name: "Aktionen für Browser Test Objekt" })
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
