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
        const main = (await page.locator('[data-slot="detail-layout"]').count())
            ? await page.locator('[data-slot="detail-layout"]').boundingBox()
            : await page.getByRole("main").boundingBox();
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
        if (name !== "17-grid-loading") {
            await expect(
                page.getByRole("status", {
                    name: "Tabelle wird geladen",
                    exact: true,
                }),
            ).toHaveCount(0);
        }
        await checkPageWidth();
        for (const viewport of await page
            .locator(
                '[data-slot="resource-collection"] [data-slot="scroll-area-viewport"]',
            )
            .all()) {
            expect(
                await viewport.evaluate(
                    (element) => element.scrollWidth - element.clientWidth,
                ),
            ).toBeLessThanOrEqual(1);
        }
        await page.screenshot({
            path: `screenshots/${name}.png`,
            animations: "disabled",
            fullPage: (await page.getByRole("dialog").count()) === 0,
        });
    };
    await page.goto("/");
    await capture("00-anmeldung");
    await page.setViewportSize({ width: 390, height: 844 });
    await capture("00-anmeldung-mobil");
    await page.setViewportSize({ width: 1440, height: 1000 });
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
    await page.setViewportSize({ width: 1440, height: 1200 });
    await capture("01-dashboard");
    const dashboardWidth = (await page
        .locator('[data-slot="page-wrapper"]')
        .boundingBox())!.width;
    await page.getByRole("tab", { name: "Bestand", exact: true }).click();
    expect(
        (await page.locator('[data-slot="page-wrapper"]').boundingBox())!.width,
    ).toBe(dashboardWidth);
    await capture("22-dashboard-bestand");
    await page.getByRole("tab", { name: "Übersicht", exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 1000 });

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
    await expect(
        page.getByRole("button", { name: "Sheet", exact: true }),
    ).toHaveCount(0);
    const searchBox = await page
        .getByRole("textbox", { name: "Verträge durchsuchen" })
        .boundingBox();
    const filterBox = await page
        .getByRole("combobox", { name: "Filter hinzufügen" })
        .boundingBox();
    expect(Math.abs(searchBox!.y - filterBox!.y)).toBeLessThanOrEqual(4);
    const kpis = page.getByRole("region", {
        name: "Kennzahlen der gefilterten Auswahl",
    });
    await expect(kpis).not.toHaveAttribute("aria-busy", "true");
    await expect(
        kpis.getByText("Vereinbarte Kaution", { exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: /^Aktiv/ }).click();
    await expect(page).toHaveURL(/view=active/);
    await expect(
        page.locator('[data-slot="resource-collection"]'),
    ).not.toHaveAttribute("aria-busy", "true");
    await expect(page.getByRole("tab", { name: /^Aktiv/ })).not.toContainText(
        "—",
    );
    await capture("02-vertraege-tabelle");
    await page
        .getByRole("combobox", { name: "Status Werte", exact: true })
        .click();
    await expect(
        page.getByRole("option", { name: "Aktiv", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await capture("06-grid-filter");
    await page.keyboard.press("Escape");

    await page
        .getByRole("combobox", { name: "Filter hinzufügen", exact: true })
        .click();
    await page
        .getByRole("option", { name: "Einheit · Name", exact: true })
        .click();
    await page
        .getByRole("textbox", { name: "Einheit · Name Wert", exact: true })
        .fill("Wohnung 01");
    await page
        .getByRole("textbox", { name: "Einheit · Name Wert", exact: true })
        .press("Enter");
    await expect(
        page.locator('[data-slot="resource-collection"]'),
    ).not.toHaveAttribute("aria-busy", "true");
    await expect(
        page.getByRole("button", { name: "MV-001-01", exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole("button", { name: "MV-001-02", exact: true }),
    ).toHaveCount(0);
    await capture("10-relationsfilter");
    // Active criteria must not push grouping above a detached row of actions.
    await page.setViewportSize({ width: 1180, height: 900 });
    const groupingBox = await page
        .getByRole("combobox", { name: "Gruppierung", exact: true })
        .boundingBox();
    const createBox = await page
        .getByRole("button", { name: "Vertrag anlegen", exact: true })
        .boundingBox();
    const activeFilterRow = page.locator(
        '[data-slot="collection-active-filters"]',
    );
    const activeFilterBox = await activeFilterRow.boundingBox();
    expect(Math.abs(groupingBox!.y - createBox!.y)).toBeLessThanOrEqual(1);
    expect(activeFilterBox!.y).toBeGreaterThanOrEqual(
        groupingBox!.y + groupingBox!.height,
    );
    await capture("35-filter-toolbar-umbruch");
    await page.setViewportSize({ width: 390, height: 844 });
    for (const chip of await activeFilterRow
        .locator('[data-slot="filter-chip"]')
        .all()) {
        expect(
            await chip.evaluate(
                (element) => element.scrollWidth - element.clientWidth,
            ),
        ).toBeLessThanOrEqual(1);
    }
    await capture("36-filter-toolbar-mobil");
<<<<<<< HEAD
=======
    const mobileRecords = page.locator('[data-slot="scroll-area-viewport"]');
    expect((await mobileRecords.boundingBox())!.height).toBeGreaterThanOrEqual(
        240,
    );
    await page
        .getByRole("button", { name: "MV-001-01", exact: true })
        .scrollIntoViewIfNeeded();
    await expect(
        page.getByRole("button", { name: "MV-001-01", exact: true }),
    ).toBeInViewport();
    await capture("37-filter-mobile-datensatz");
    await page
        .locator('[data-slot="resource-collection"]')
        .evaluate((element) => {
            element.scrollTop = 0;
        });
>>>>>>> 295ac0c2347dca2a96344398238933dbbe2db4f7
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
        .getByRole("button", {
            name: "Einheit · Name Filter entfernen",
            exact: true,
        })
        .click();
    await expect(
        page.getByRole("button", { name: "MV-001-02", exact: true }),
    ).toBeVisible();

    await page
        .getByRole("combobox", { name: "Filter hinzufügen", exact: true })
        .click();
    await page.getByRole("option", { name: "Einheit", exact: true }).click();
    await page.getByRole("textbox", { name: "Verträge durchsuchen" }).fill("");
    const unitFilter = page.getByRole("combobox", {
        name: "Einheit Werte",
        exact: true,
    });
    await unitFilter.click();
    await page
        .getByRole("combobox", {
            name: "Einheit Werte durchsuchen",
            exact: true,
        })
        .fill("Wohnung");
    const unitChoices = page.getByRole("option").filter({ hasText: "Wohnung" });
    await unitChoices.first().click();
    await unitChoices.nth(1).click();
    await page.keyboard.press("Escape");
    await expect(
        unitFilter.locator('[data-slot="selection-count"]'),
    ).toHaveText("+1");
    const filterChip = page.getByRole("group", {
        name: "Filter Einheit",
        exact: true,
    });
    expect(
        await filterChip.evaluate((el) => el.scrollWidth - el.clientWidth),
    ).toBeLessThanOrEqual(1);
    const valueBox = await unitFilter.boundingBox();
    const removeBox = await filterChip
        .getByRole("button", { name: "Einheit Filter entfernen" })
        .boundingBox();
    expect(valueBox!.x + valueBox!.width).toBeLessThanOrEqual(removeBox!.x + 1);
    await capture("32-mehrfachfilter");
    await filterChip
        .getByRole("button", { name: "Einheit Filter entfernen" })
        .click();

    await page.getByRole("textbox", { name: "Verträge durchsuchen" }).fill("");
    await expect(
        page.locator('[data-slot="resource-collection"]'),
    ).not.toHaveAttribute("aria-busy", "true");
    const tableViewport = page
        .locator(
            '[data-slot="resource-collection"] [data-slot="scroll-area-viewport"]',
        )
        .first();
    const beforeSelection = await tableViewport.boundingBox();
    await expect(tableViewport.locator("tr[data-row-id]")).toHaveCount(25);
    expect(
        await tableViewport.evaluate((element) => element.scrollHeight),
    ).toBeGreaterThan(beforeSelection!.height);
    await tableViewport.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
    });
    const lastRow = tableViewport.locator("tr[data-row-id]").last();
    const lastRowBox = await lastRow.boundingBox();
    const stickyHeaderBox = await tableViewport.locator("thead").boundingBox();
    expect(
        Math.abs(stickyHeaderBox!.y - beforeSelection!.y),
    ).toBeLessThanOrEqual(1);
    expect(lastRowBox!.y + lastRowBox!.height).toBeLessThanOrEqual(
        beforeSelection!.y + beforeSelection!.height + 1,
    );
    await capture("28-grid-letzte-zeile");
    await page
        .getByRole("button", { name: "Nächste Seite", exact: true })
        .click();
    await expect(tableViewport.locator("tr[data-row-id]")).toHaveCount(18);
    expect(await tableViewport.evaluate((element) => element.scrollTop)).toBe(
        0,
    );
    await expect(
        page.locator('[data-slot="data-grid-pagination"]'),
    ).toContainText("26–43 von 43");
    await page
        .getByRole("button", { name: "Vorherige Seite", exact: true })
        .click();
    await expect(tableViewport.locator("tr[data-row-id]")).toHaveCount(25);
    await tableViewport.evaluate((element) => {
        element.scrollTop = 0;
    });
    await page
        .getByRole("checkbox", { name: "Alle Zeilen dieser Seite auswählen" })
        .click();
    const bulkBar = page.getByRole("region", { name: "Auswahlaktionen" });
    await expect(bulkBar).toBeVisible();
    expect((await tableViewport.boundingBox())!.height).toBe(
        beforeSelection!.height,
    );
    await capture("07-bulk-auswahl");
    await expect(
        bulkBar.getByRole("button", { name: "Bearbeiten", exact: true }),
    ).toHaveCount(0);
    await bulkBar.getByRole("button", { name: "Löschen", exact: true }).click();
    await expect(
        page.getByRole("heading", { name: "Löschen", exact: true }),
    ).toBeVisible();
    await capture("08-bulk-loeschen");
    const deletion = page.getByRole("dialog", { name: "Löschen", exact: true });
    await deletion
        .getByRole("button", { name: "Löschen", exact: true })
        .click();
    await expect(
        deletion.getByText(
            "Aktive oder historische Verträge bleiben erhalten. Vertrag beenden statt löschen.",
        ),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(
        page.getByRole("button", { name: "Löschen bestätigen" }),
    ).toHaveCount(0);
    await capture("31-loeschen-fehler");
    await page.getByRole("button", { name: "Abbrechen", exact: true }).click();
    await bulkBar.getByRole("button", { name: "Auswahl aufheben" }).click();

    await page
        .getByRole("textbox", { name: "Verträge durchsuchen" })
        .fill("MV-001");

    await page.getByRole("button", { name: "MV-001-01", exact: true }).click();
    await expect(
        page.getByRole("heading", { name: "MV-001-01", exact: true }),
    ).toBeVisible();
    await expect(page.locator('[data-slot="detail-layout"]')).toBeVisible();
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
    await expect(page).toHaveURL(/panel=/);
    const editSheet = page.getByRole("dialog");
    await expect(
        editSheet.getByRole("tab", { name: "Grunddaten" }),
    ).toHaveAttribute("aria-selected", "true");
    const unitPicker = editSheet.getByRole("combobox", { name: /Einheit/ });
    await expect(unitPicker).toHaveValue("Wohnung 01");
    await expect(unitPicker).not.toContainText("Nutzbar");
    const unitBox = await unitPicker
        .locator('xpath=ancestor::*[@data-slot="input-group"][1]')
        .boundingBox();
    const numberBox = await editSheet
        .getByLabel("Nummer", { exact: false })
        .boundingBox();
    expect(Math.abs(unitBox!.height - numberBox!.height)).toBeLessThanOrEqual(
        2,
    );
    const activeTabUnderline = await editSheet
        .getByRole("tab", { name: "Grunddaten" })
        .evaluate((element) => {
            const style = getComputedStyle(element, "::after");
            return { height: parseFloat(style.height), opacity: style.opacity };
        });
    expect(activeTabUnderline.height).toBeGreaterThanOrEqual(2);
    expect(activeTabUnderline.opacity).toBe("1");
    await capture("05-vertrag-bearbeiten");
    await editSheet.getByRole("tab", { name: "Zahlung", exact: true }).click();
    await expect(
        editSheet.getByText("Zahlungsvereinbarung", { exact: true }),
    ).toBeVisible();
    await capture("14-sheet-zahlung");
    await editSheet.getByRole("tab", { name: "Grunddaten" }).click();
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
    await expect(page.getByText(/^Schritt \d+ von \d+$/)).toHaveCount(0);
    const wizardSteps = page.locator('[data-slot="stepper-item"]');
    const firstStep = await wizardSteps.nth(0).boundingBox();
    const secondStep = await wizardSteps.nth(1).boundingBox();
    expect(secondStep!.x).toBeGreaterThanOrEqual(
        firstStep!.x + firstStep!.width - 1,
    );
    expect(Math.abs(secondStep!.y - firstStep!.y)).toBeLessThanOrEqual(1);
    const wizardHeader = page.locator('[data-slot="overlay-header-content"]');
    await expect(
        wizardHeader.locator('[data-slot="stepper-item"]'),
    ).toHaveCount(6);
    const progress = wizardHeader.locator('[data-slot="stepper"]');
    const progressBox = await progress.boundingBox();
    const headerBox = await wizardHeader.boundingBox();
    expect(
        Math.abs(
            progressBox!.x +
                progressBox!.width / 2 -
                (headerBox!.x + headerBox!.width / 2),
        ),
    ).toBeLessThanOrEqual(2);
    expect(
        Math.abs(
            progressBox!.y +
                progressBox!.height / 2 -
                (headerBox!.y + headerBox!.height / 2),
        ),
    ).toBeLessThanOrEqual(2);
    const body = page.locator('[data-slot="overlay-body"]');
    const bodyBox = await body.boundingBox();
    expect(bodyBox!.y).toBeGreaterThanOrEqual(
        headerBox!.y + headerBox!.height - 1,
    );
    expect(bodyBox!.width).toBeGreaterThanOrEqual(headerBox!.width - 1);
    await body.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
    });
    expect((await wizardHeader.boundingBox())!.y).toEqual(headerBox!.y);
    await body.evaluate((element) => {
        element.scrollTop = 0;
    });
    await capture("04-vertrag-anlegen");
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileFirstStep = await wizardSteps.nth(0).boundingBox();
    const mobileSecondStep = await wizardSteps.nth(1).boundingBox();
    expect(mobileSecondStep!.x).toBeGreaterThanOrEqual(
        mobileFirstStep!.x + mobileFirstStep!.width - 1,
    );
    const wizardSheet = page.locator('[data-slot="sheet-content"]');
    expect(
        await wizardSheet.evaluate(
            (element) => element.scrollWidth - element.clientWidth,
        ),
    ).toBeLessThanOrEqual(1);
    await capture("11-wizard-mobil");
    await page.setViewportSize({ width: 1440, height: 1000 });
    const dialogUrl = new URL(page.url());
    dialogUrl.searchParams.set("layout", "dialog");
    await page.goto(dialogUrl.toString());
    await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible();
    await expect(
        page.locator(
            '[data-slot="overlay-header-content"] [data-slot="stepper-item"]',
        ),
    ).toHaveCount(6);
    await capture("12-wizard-dialog");
    let contractWrites = 0;
    page.on("request", (request) => {
        if (
            request.url().endsWith("/api/v1/contracts/mutate") &&
            request.headers()["precognition"] !== "true"
        )
            contractWrites++;
    });
    const creator = page.getByRole("dialog");
    await creator.getByLabel("Nummer", { exact: false }).fill("MV-REPEATER");
    await creator.getByRole("combobox", { name: /Einheit/ }).fill("Wohnung 01");
    await page
        .getByRole("option", { name: /Wohnung 01/ })
        .first()
        .click();
    await creator.getByRole("button", { name: "Weiter", exact: true }).click();
    await creator
        .getByRole("textbox", { name: /Vertragsbeginn/ })
        .fill("01.12.2026");
    await creator.getByRole("button", { name: "Weiter", exact: true }).click();
    await creator.getByRole("button", { name: "Weiter", exact: true }).click();
    await creator.getByRole("button", { name: "Weiter", exact: true }).click();
    const firstParty = creator.getByRole("region", {
        name: "Beteiligter 1",
        exact: true,
    });
    await firstParty
        .getByRole("combobox", { name: /Geschäftspartner/ })
        .fill("Demo Müller 1");
    await page
        .getByRole("option", { name: /Demo Müller 1\b/ })
        .first()
        .click();
    await creator
        .getByRole("button", { name: "Beteiligter hinzufügen", exact: true })
        .click();
    const secondParty = creator.getByRole("region", {
        name: "Beteiligter 2",
        exact: true,
    });
    await secondParty
        .getByRole("combobox", { name: /Geschäftspartner/ })
        .fill("Demo Schmidt 1");
    await page
        .getByRole("option", { name: /Demo Schmidt 1\b/ })
        .first()
        .click();
    await capture("29-vertrag-beteiligte");
    await creator.getByRole("button", { name: "Weiter", exact: true }).click();
    const firstCondition = creator.getByRole("region", {
        name: "Kondition 1",
        exact: true,
    });
    await firstCondition
        .getByLabel("Gültig ab", { exact: false })
        .fill("01.12.2026");
    await firstCondition
        .getByLabel("Grundmiete", { exact: false })
        .fill("1200");
    await creator
        .getByRole("button", { name: "Kondition hinzufügen", exact: true })
        .click();
    const secondCondition = creator.getByRole("region", {
        name: "Kondition 2",
        exact: true,
    });
    await secondCondition
        .getByLabel("Gültig ab", { exact: false })
        .fill("01.01.2027");
    await secondCondition
        .getByLabel("Grundmiete", { exact: false })
        .fill("1250");
    await capture("30-vertrag-konditionen");
    expect(contractWrites).toBe(0);
    await creator
        .getByRole("button", { name: "Speichern", exact: true })
        .click();
    await expect(creator).toHaveCount(0);
    expect(contractWrites).toBe(1);

    await page.getByRole("link", { name: "Objekte", exact: true }).click();
    await page
        .getByRole("textbox", { name: "Objekte durchsuchen" })
        .fill("Linden");
    await expect(
        page.getByRole("button", { name: "Lindenhöfe", exact: true }),
    ).toBeVisible();
    await page.getByRole("cell", { name: "OBJ-001", exact: true }).dblclick();
    await expect(
        page.getByRole("heading", { name: "Objekt bearbeiten" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Bezeichnung aufbereiten" }).click();
    await expect(
        page.getByRole("menuitem", { name: /Adresse übernehmen/ }),
    ).toBeVisible();
    await capture("09-feldaktionen");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Abbrechen", exact: true }).click();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(detailUrl);
    await expect(page.locator('[data-slot="detail-layout"]')).toBeVisible();
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
    await page.getByRole("button", { name: "Abbrechen", exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/contracts?q=Nicht-vorhandener-Vertrag&group=status");
    await expect(
        page.getByRole("heading", { name: "Keine Treffer" }),
    ).toBeVisible();
    await expect(
        page.getByRole("columnheader", { name: /Vertrag/ }),
    ).toBeVisible();
    await expect(
        page.locator('[data-slot="data-grid-pagination"]'),
    ).toBeVisible();
    await capture("13-grid-keine-treffer");
    await page
        .getByRole("button", { name: "Suche und Filter zurücksetzen" })
        .click();
    await expect(
        page.getByRole("heading", { name: "Keine Treffer" }),
    ).toHaveCount(0);
    await expect(page).toHaveURL(/group=status/);
    await expect(
        page.getByRole("textbox", { name: "Verträge durchsuchen" }),
    ).toHaveValue("");
    await page.goto("/components");
    await expect(
        page.getByRole("heading", {
            name: "Ein Baukasten. Klare Konventionen.",
        }),
    ).toBeVisible();
    await capture("27-zelltypen");
    await expect(page.locator('[data-slot="choice-selection"]')).toContainText(
        "Verwaltungspaket",
    );
    await expect(
        page.locator('[data-slot="choice-selection"] img'),
    ).toHaveJSProperty("complete", true);
    await page.getByRole("radio", { name: "Wallet", exact: true }).click();
    await expect(
        page.getByRole("radio", { name: "Wallet", exact: true }),
    ).toBeChecked();
    await page.getByRole("button", { name: "Anzahl erhöhen" }).click();
    await expect(page.getByLabel("Anzahl", { exact: true })).toHaveValue("2");
    await capture("15-komponenten-rich");
    await page.setViewportSize({ width: 390, height: 844 });
    await checkPageWidth();
    await capture("16-komponenten-mobil");
    await page.setViewportSize({ width: 1440, height: 1000 });
    // Hold an actual first search so the skeleton is inspected, not a transient empty grid.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    await page.route("**/api/v1/units/search", async (route) => {
        await gate;
        await route.continue();
    });
    await page.goto("/units");
    await expect(
        page.getByRole("status", { name: "Tabelle wird geladen", exact: true }),
    ).toBeVisible();
    const skeletons = page.locator('[data-slot="grid-cell-skeleton"]');
    await expect(skeletons.first()).toBeAttached();
    const skeleton = await skeletons.first().boundingBox();
    expect(skeleton!.height).toBeGreaterThanOrEqual(20);
    await capture("17-grid-loading");
    release();
    await expect(
        page.getByRole("status", { name: "Tabelle wird geladen", exact: true }),
    ).toHaveCount(0);
    await page.unrouteAll({ behavior: "wait" });
    await expect(
        page.getByRole("button", { name: "Sheet", exact: true }),
    ).toHaveCount(0);
    await expect(
        page.getByRole("button", { name: "Dialog", exact: true }),
    ).toHaveCount(0);
    const filter = await page
        .getByRole("combobox", { name: "Filter hinzufügen" })
        .boundingBox();
    const group = await page
        .getByRole("combobox", { name: "Gruppierung" })
        .boundingBox();
    expect(Math.abs(filter!.height - group!.height)).toBeLessThanOrEqual(1);
    const titleColumn = await page
        .getByRole("columnheader")
        .filter({ hasText: /^Einheit/ })
        .boundingBox();
    const statusColumn = await page
        .getByRole("columnheader")
        .filter({ hasText: /^Zustand/ })
        .boundingBox();
    expect(statusColumn!.width).toBeLessThan(titleColumn!.width);
    await capture("18-einheiten-spalten");
    await page
        .getByRole("combobox", { name: "Filter hinzufügen", exact: true })
        .click();
    await page.getByRole("option", { name: "Objekt", exact: true }).click();
    await page
        .getByRole("combobox", { name: "Objekt Werte", exact: true })
        .click();
    await page
        .getByRole("combobox", {
            name: "Objekt Werte durchsuchen",
            exact: true,
        })
        .fill("Linden");
    await page.getByRole("option", { name: /Lindenhöfe/ }).click();
    await page.keyboard.press("Escape");
    await expect(
        page.locator('[data-slot="resource-collection"]'),
    ).not.toHaveAttribute("aria-busy", "true");
    await expect(page).toHaveURL(/property_id/);
    await capture("23-einheiten-objektfilter");
    await page.getByRole("button", { name: "Wohnung 01", exact: true }).click();
    const unitView = page.getByRole("dialog");
    await expect(
        unitView.getByRole("heading", { name: "Wohnung 01", exact: true }),
    ).toBeVisible();
    await expect(
        unitView.locator('[data-slot="form-section"]').getByRole("textbox"),
    ).toHaveCount(0);
    await expect(page).toHaveURL(/view/);
    await capture("24-einheit-view-sheet");
    await unitView
        .getByRole("button", { name: "Ausstattung bearbeiten", exact: true })
        .click();
    await expect(
        unitView.getByRole("heading", { name: "Einheit bearbeiten" }),
    ).toBeVisible();
    await expect(
        unitView.getByRole("checkbox", { name: "Balkon", exact: true }),
    ).toBeVisible();
    await expect(unitView.getByLabel("Nummer", { exact: false })).toHaveCount(
        0,
    );
    await capture("25-einheit-abschnitt-edit");
    await unitView
        .getByRole("button", { name: "Abbrechen", exact: true })
        .click();
    await expect(
        unitView.getByRole("heading", { name: "Wohnung 01", exact: true }),
    ).toBeVisible();
    await unitView
        .getByRole("button", { name: "Bearbeiten", exact: true })
        .click();
    await capture("26-einheit-edit-regionen");
    await unitView
        .getByRole("button", { name: "Abbrechen", exact: true })
        .click();
    await unitView
        .getByRole("button", { name: "Schließen", exact: true })
        .last()
        .click();
    await page.goto("/identity-documents");
    await page
        .getByRole("button", { name: "Browser-Nachweis", exact: true })
        .click();
    await expect(
        page.getByRole("heading", { name: "Browser-Nachweis", exact: true }),
    ).toBeVisible();
    await capture("19-ausweis-detail");
    await page.getByRole("button", { name: "Bearbeiten", exact: true }).click();
    for (const presentation of ["sheet", "dialog"]) {
        if (presentation === "dialog") {
            const url = new URL(page.url());
            url.searchParams.set("layout", presentation);
            await page.goto(url.toString());
        }
        const editor = page.getByRole("dialog");
        await expect(
            editor.getByRole("heading", { name: "Ausweis bearbeiten" }),
        ).toBeVisible();
        const nextDate = editor.getByRole("textbox", {
            name: "Geprüft am",
            exact: true,
        });
        await nextDate.scrollIntoViewIfNeeded();
        const before = await nextDate.boundingBox();
        await editor
            .getByRole("textbox", { name: "Gültig bis", exact: true })
            .locator('xpath=ancestor::*[@data-slot="input-group"][1]')
            .getByRole("button", { name: "Kalender öffnen" })
            .click();
        await expect(
            page.locator('[data-slot="popover-content"]'),
        ).toBeVisible();
        const after = await nextDate.boundingBox();
        expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(1);
        await capture(
            presentation === "sheet"
                ? "20-date-picker-sheet"
                : "21-date-picker-dialog",
        );
        await page.keyboard.press("Escape");
    }
    await page.goto("/properties");
    await page
        .getByRole("textbox", { name: "Objekte durchsuchen" })
        .fill("Linden");
    await page.getByRole("button", { name: "Lindenhöfe", exact: true }).click();
    await page.getByRole("tab", { name: /Einheiten/ }).click();
    await expect(
        page.getByRole("button", { name: "Wohnung 01", exact: true }),
    ).toBeVisible();
    const unitTab = page.getByRole("tab", { name: /Einheiten/ });
    await expect(unitTab.locator("svg")).toBeVisible();
    await expect(
        page.getByRole("button", { name: "Bereiche suchen", exact: true }),
    ).toHaveCount(0);
    const embedded = page.getByRole("tabpanel");
    const controlHeights = await Promise.all(
        [
            embedded.getByRole("textbox", { name: "Einheiten durchsuchen" }),
            embedded.getByRole("button", { name: "Hinzufügen", exact: true }),
            embedded.getByRole("button", {
                name: "Aktualisieren",
                exact: true,
            }),
            embedded.getByRole("button", {
                name: "Aktuelle Seite als CSV exportieren",
                exact: true,
            }),
        ].map(async (control) => (await control.boundingBox())!.height),
    );
    expect(
        Math.max(...controlHeights) - Math.min(...controlHeights),
    ).toBeLessThanOrEqual(1);
    await capture("33-objekt-einheiten-toolbar");
    await embedded
        .getByRole("button", { name: "Hinzufügen", exact: true })
        .click();
    await expect(page).toHaveURL(/panel=units\/new/);
    expect(new URL(page.url()).searchParams.has("panels")).toBe(false);
    await page.reload();
    const newUnit = page.getByRole("dialog", {
        name: "Einheit anlegen",
        exact: true,
    });
    const lockedProperty = newUnit.getByRole("combobox", { name: /Objekt/ });
    await expect(lockedProperty).toBeDisabled();
    await expect(lockedProperty).toHaveValue("Lindenhöfe");
    await capture("34-einheit-kontext-link");
    expect(errors).toEqual([]);
});
