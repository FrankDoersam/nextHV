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
            name: "Ein klarer Blick auf deine Immobilien.",
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
    expect(errors).toEqual([]);
    await page.getByRole("button", { name: "Abmelden", exact: true }).click();
    await expect(
        page.getByRole("button", { name: "Anmelden", exact: true }),
    ).toBeVisible();
});
