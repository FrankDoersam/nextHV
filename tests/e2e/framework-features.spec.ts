import { expect, test } from "@playwright/test";

// Reports render through the same PDF.js canvas on desktop and mobile.
test.use({ channel: "chromium" });

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
    // Hold the HTTP response so we verify that the *final* PDF sheet opens
    // immediately, before the report action / PDF bytes are available.
    let releaseReport!: () => void;
    const reportGate = new Promise<void>((resolve) => { releaseReport = resolve; });
    await page.route("**/api/v1/properties/actions/report", async (route) => {
        await reportGate;
        await route.continue();
    });
    await page
        .getByRole("button", { name: "Aktionen für Lindenhöfe", exact: true })
        .click();
    await page
        .getByRole("menuitem", { name: "Objektbericht als PDF", exact: true })
        .click();
    const pdf = page.getByRole("dialog");
    await expect(pdf).toHaveAttribute("data-slot", "sheet-content");
    await expect(pdf.getByRole("status", { name: "PDF wird geladen" }))
        .toContainText("Bericht wird erstellt");
    await expect(pdf.locator('[data-slot="pdf-preview-loading"]'))
        .toHaveAttribute("aria-busy", "true");
    await expect(pdf.locator('[data-slot="skeleton"]')).toHaveCount(0);
    await expect(pdf.getByRole("progressbar")).toHaveCount(0);
    await expect(pdf.getByLabel("PDF-Seite 1", { exact: true })).toHaveCount(0);
    await pdf.evaluate((node) => node.setAttribute("data-same-pdf-sheet", "true"));
    await capture("03-pdf-sheet-loading");
    releaseReport();
    await expect(
        pdf.getByLabel("PDF-Seite 1", { exact: true }),
    ).toHaveAttribute("data-rendered", "true");
    await expect(pdf).toHaveAttribute("data-same-pdf-sheet", "true");
    await expect(pdf.getByRole("status", { name: "PDF wird geladen" })).toHaveCount(0);
    await expect(
        pdf
            .locator('[data-slot="overlay-actions"]')
            .getByRole("link", { name: "PDF herunterladen" }),
    ).toHaveAttribute("download", /objekt-\d+\.pdf/);
    await expect(pdf.locator("object, iframe")).toHaveCount(0);
    const initialWidth = (await pdf
        .getByLabel("PDF-Seite 1", { exact: true })
        .boundingBox())!.width;
    await pdf.getByRole("button", { name: "Vergrößern", exact: true }).click();
    await expect(
        pdf.getByLabel("PDF-Seite 1", { exact: true }),
    ).toHaveAttribute("data-rendered", "true");
    expect(
        (await pdf.getByLabel("PDF-Seite 1", { exact: true }).boundingBox())!
            .width,
    ).toBeGreaterThan(initialWidth);
    await pdf.getByRole("button", { name: "An Breite anpassen" }).click();
    await expect(
        pdf.getByLabel("PDF-Seite 1", { exact: true }),
    ).toHaveAttribute("data-rendered", "true");
    // Fit-to-width must restore the 16px top gutter after zoom, matching
    // the left inset rather than leaving the canvas tucked under the toolbar.
    const pageInsetError = () =>
        pdf.getByRole("region", { name: "PDF lesen" }).evaluate((viewport) => {
            const first = viewport.querySelector<HTMLElement>('[data-page="1"]');
            if (!first) return Number.POSITIVE_INFINITY;
            const surface = viewport.getBoundingClientRect();
            const sheet = first.getBoundingClientRect();
            const top = sheet.top - surface.top;
            const left = sheet.left - surface.left;
            return Math.max(
                Math.abs(top - 16),
                Math.abs(left - 16),
                Math.abs(top - left),
            );
        });
    await expect.poll(pageInsetError).toBeLessThan(2);
    await capture("03-pdf-sheet");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
        pdf.getByLabel("PDF-Seite 1", { exact: true }),
    ).toHaveAttribute("data-rendered", "true");
    await expect
        .poll(
            async () =>
                (await pdf
                    .getByLabel("PDF-Seite 1", { exact: true })
                    .boundingBox())!.width,
        )
        .toBeLessThan(390);
    await expect.poll(pageInsetError).toBeLessThan(2);
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
            `Objektnummer;Nummer;Bezeichnung;Art;Zustand\nOBJ-001;${code};Importierte Einheit;Whg;Nutzbar`,
        ),
    });
    await dialog
        .getByRole("button", { name: "Datei prüfen", exact: true })
        .click();
    await expect(
        dialog.getByRole("button", { name: "Vorschau prüfen", exact: true }),
    ).toBeEnabled();
    await dialog.getByRole("combobox", { name: "Art: Whg zuordnen" }).click();
    await page.getByRole("option", { name: "Wohnung", exact: true }).click();
    await capture("05-csv-mapping");
    await dialog
        .getByRole("button", { name: "Vorschau prüfen", exact: true })
        .click();
    await expect(dialog.getByText(/Lindenhöfe \(#/)).toBeVisible();
    await expect(dialog.locator('[data-slot="overlay-body"]')).toHaveJSProperty(
        "scrollTop",
        0,
    );
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
