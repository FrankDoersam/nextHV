import { expect, test } from "@playwright/test";

test("global records, audit, mapped relation import and protected PDF sheet work together", async ({
    page,
}) => {
    test.setTimeout(90_000);
    const capture = async (name: string) => {
        await page.evaluate(() => document.fonts.ready);
        expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(page.viewportSize()!.width);
        await page.screenshot({
            path: `screenshots/features-${name}.png`,
            animations: "disabled",
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
    await page.getByRole("button", { name: /Datensätze suchen/ }).click();
    const search = page.getByRole("dialog");
    await search
        .getByRole("combobox", { name: "Datensätze suchen" })
        .fill("Lindenhöfe");
    await expect(search.getByRole("option").first()).toBeVisible();
    await capture("01-global-search");
    await search
        .getByRole("option")
        .filter({ hasText: "Lindenhöfe" })
        .first()
        .click();
    await expect(page).toHaveURL(/\/properties\/\d+/);
    await page.getByRole("tab", { name: "Änderungsverlauf" }).click();
    await expect(
        page.getByRole("list", { name: "Änderungsverlauf" }),
    ).toBeVisible();
    await capture("02-audit");
    await page
        .getByRole("button", { name: "Aktionen für Lindenhöfe", exact: true })
        .click();
    await page
        .getByRole("menuitem", { name: "Objektbericht als PDF", exact: true })
        .click();
    await page
        .getByRole("button", { name: "Objektbericht als PDF", exact: true })
        .click();
    const pdf = page.getByRole("dialog");
    await expect(pdf).toHaveAttribute("data-slot", "sheet-content");
    await expect(pdf.getByLabel("PDF-Seitenansicht")).toHaveAttribute(
        "data",
        /^blob:/,
    );
    await expect(
        pdf.getByRole("link", { name: "PDF", exact: true }),
    ).toHaveAttribute("download", /objekt-\d+\.pdf/);
    await capture("03-pdf-sheet");
    await page.setViewportSize({ width: 390, height: 844 });
    await capture("04-pdf-sheet-mobile");
    await page.setViewportSize({ width: 1280, height: 720 });
    await pdf.getByRole("button", { name: "Schließen", exact: true }).click();
    await page.goto("/units");
    await page.getByRole("button", { name: "CSV importieren" }).click();
    const dialog = page.getByRole("dialog");
    const code = `IMPORT-${Date.now()}`;
    await dialog.getByLabel("Datei", { exact: true }).setInputFiles({
        name: "einheiten.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
            `Objekt;Nummer;Bezeichnung\nOBJ-001;${code};Importierte Einheit`,
        ),
    });
    await dialog
        .getByRole("button", { name: "Datei prüfen", exact: true })
        .click();
    await expect(
        dialog.getByRole("button", { name: "Vorschau prüfen", exact: true }),
    ).toBeEnabled();
    await capture("05-csv-mapping");
    await dialog
        .getByRole("button", { name: "Vorschau prüfen", exact: true })
        .click();
    await expect(dialog.getByText(/Lindenhöfe \(#/)).toBeVisible();
    await capture("06-csv-preview");
    await page.setViewportSize({ width: 390, height: 844 });
    await capture("07-csv-preview-mobile");
    await page.setViewportSize({ width: 1280, height: 720 });
    await dialog
        .getByRole("button", { name: "1 Datensatz importieren", exact: true })
        .click();
    await expect(
        dialog.getByText("1 Datensatz importiert", { exact: true }),
    ).toBeVisible();
    await dialog
        .getByRole("button", { name: "Schließen", exact: true })
        .last()
        .click();
    await page
        .getByRole("textbox", { name: "Einheiten durchsuchen" })
        .fill(code);
    await expect(
        page.getByText("Importierte Einheit", { exact: true }),
    ).toBeVisible();
});
