import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";

type PropertyFixture = {
    id: number;
    updated_at: string;
    code: string;
    name: string;
    status: string;
    manager_email: string;
    notes: string;
};

type PropertyPage = {
    data: PropertyFixture[];
    total: number;
    current_page: number;
};

type RentConditionFixture = {
    id: number;
    updated_at: string;
    effective_from: string;
    base_rent: number | string;
    service_charge: number | string;
    heating_cost: number | string;
    vat_rate: number | string;
};

test.use({
    viewport: { width: 1440, height: 1000 },
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    reducedMotion: "reduce",
});

// Fixture requests use the authenticated browser session and the real API.
async function api<T>(
    page: Page,
    path: string,
    body: unknown,
    method = "POST",
): Promise<T> {
    const result = await page.evaluate(
        async ({ path, body, method }) => {
            const token = document.cookie
                .split("; ")
                .find((cookie) => cookie.startsWith("XSRF-TOKEN="))
                ?.slice(11);
            const response = await fetch(path, {
                method,
                credentials: "same-origin",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                    "X-Requested-With": "XMLHttpRequest",
                    ...(token
                        ? { "X-XSRF-TOKEN": decodeURIComponent(token) }
                        : {}),
                },
                body: JSON.stringify(body),
            });
            return {
                status: response.status,
                body: await response.json().catch(() => null),
            };
        },
        { path, body, method },
    );
    expect(
        result.status,
        `${method} ${path}: ${JSON.stringify(result.body)}`,
    ).toBeGreaterThanOrEqual(200);
    expect(result.status).toBeLessThan(300);
    return result.body as T;
}

async function expectSummary(
    page: Page,
    workspace: Locator,
    values: { total: number; active: number; units: number; area: number },
) {
    const summary = workspace.getByRole("region", {
        name: "Kennzahlen der gefilterten Auswahl",
    });
    for (const [label, value] of [
        ["Objekte", values.total],
        ["Aktiv", values.active],
        ["Einheiten", values.units],
        ["Grundstücksfläche", values.area],
    ] as const) {
        const metric = summary
            .locator('[data-slot="metric-card"]')
            .filter({
                has: page.locator("dt", { hasText: new RegExp(`^${label}$`) }),
            })
            .locator("dd > span")
            .first();
        await expect
            .poll(async () =>
                Number(
                    (await metric.innerText())
                        .replaceAll(".", "")
                        .replace(",", "."),
                ),
            )
            .toBe(value);
    }
}

async function capture(page: Page, name: string, feature = "properties") {
    await page.evaluate(() => document.fonts.ready);
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.screenshot({
        path: `screenshots/features-${feature}-${name}.png`,
        animations: "disabled",
    });
}

async function loginWorkspace(page: Page) {
    await page.goto("/");
    await page.getByLabel("E-Mail-Adresse").fill("workspace-e2e@example.test");
    await page
        .getByLabel("Passwort", { exact: true })
        .fill(process.env.E2E_PASSWORD ?? "local-e2e-password-only");
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
    await expect(
        page.getByRole("heading", {
            name: "Willkommen, Browser.",
            exact: true,
        }),
    ).toBeVisible();
}

async function gridCell(workspace: Locator, row: Locator, field: string) {
    const index = await workspace
        .locator("thead tr")
        .last()
        .locator("th")
        .evaluateAll(
            (headers, field) =>
                headers.findIndex(
                    (header) => header.getAttribute("data-col-id") === field,
                ),
            field,
        );
    expect(index, `Die Spalte ${field} ist sichtbar`).toBeGreaterThanOrEqual(0);
    return row.locator("td").nth(index);
}

test("properties share server filters and totals across pages, retain columns and save through the edit Sheet", async ({
    page,
}) => {
    test.setTimeout(120_000);
    await mkdir("screenshots", { recursive: true });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await loginWorkspace(page);

    const prefix = `E2E-PROP-${randomUUID().slice(0, 8)}`;
    let created: PropertyFixture[] = [];
    try {
        const setup = await api<{ records: PropertyFixture[] }>(
            page,
            "/api/v1/properties/mutate",
            {
                response: {},
                mutate: Array.from({ length: 12 }, (_, index) => ({
                    operation: "create",
                    attributes: {
                        code: `${prefix}-${String(index + 1).padStart(2, "0")}`,
                        name: `Testobjekt ${String(index + 1).padStart(2, "0")}`,
                        street: "Teststraße",
                        house_number: String(index + 1),
                        postal_code: "10115",
                        city: "Berlin",
                        country: "DE",
                        type: "residential",
                        management_type: "rental",
                        status: index === 11 ? "archived" : "active",
                        land_area: 100,
                        manager_email: "property-fixture@example.test",
                        notes: "Isolierter E2E-Datensatz; verborgene Felder erhalten.",
                    },
                })),
            },
        );
        expect(Array.isArray(setup.records)).toBe(true);
        created = setup.records;
        expect(created).toHaveLength(12);
        const record = created[0];
        await page.goto("/properties");
        const workspace = page.locator('[data-slot="resource-grid-page"]');
        const search = workspace.getByRole("textbox", {
            name: "Objekte durchsuchen",
            exact: true,
        });
        const rows = workspace.locator(
            'tbody tr[data-row-id]:not([data-row-id^="group:"])',
        );
        const pagination = workspace.locator(
            '[data-slot="data-grid-pagination"]',
        );
        await expect(search).toHaveCount(1);
        await expect(
            workspace.getByRole("button", {
                name: /Ansicht speichern|export/i,
            }),
        ).toHaveCount(0);
        await expect(
            workspace.getByRole("button", {
                name: "Objekt anlegen",
                exact: true,
            }),
        ).toBeVisible();
        const searched = page.waitForResponse(
            (response) =>
                new URL(response.url()).pathname ===
                    "/api/v1/properties/search" &&
                response.request().postDataJSON()?.search?.text?.value ===
                    prefix,
        );
        await search.fill(prefix);
        const response = await searched;
        expect(response.ok()).toBe(true);
        const firstPage = (await response.json()) as PropertyPage;
        expect(firstPage.total).toBe(12);
        expect(firstPage.data).toHaveLength(10);
        await expect(rows).toHaveCount(10);
        await expect(pagination).toContainText("1–10 von 12");
        await expectSummary(page, workspace, {
            total: 12,
            active: 11,
            units: 0,
            area: 1200,
        });
        const firstPageIds = await rows.evaluateAll((nodes) =>
            nodes.map((node) => node.getAttribute("data-row-id")),
        );
        const searchBox = (await search.boundingBox())!;
        const filterBox = (await workspace
            .getByRole("combobox", { name: "Filter hinzufügen", exact: true })
            .boundingBox())!;
        expect(filterBox.x).toBeGreaterThanOrEqual(
            searchBox.x + searchBox.width,
        );
        const pageSizeBox = (await pagination
            .getByRole("combobox", { name: "Zeilen pro Seite", exact: true })
            .boundingBox())!;
        const workspaceBox = (await workspace.boundingBox())!;
        expect(pageSizeBox.x).toBeGreaterThan(
            workspaceBox.x + workspaceBox.width / 2,
        );
        await capture(page, "desktop");

        const grouped = page.waitForResponse(
            (response) =>
                new URL(response.url()).pathname ===
                    "/api/v1/properties/metrics/groups" &&
                response.request().postDataJSON()?.group === "city" &&
                response.request().postDataJSON()?.search?.text?.value ===
                    prefix,
        );
        await workspace
            .getByRole("columnheader", { name: "Ort", exact: true })
            .getByRole("button", { name: "Ort", exact: true })
            .click();
        await page
            .getByRole("menuitem", {
                name: "Nach dieser Spalte gruppieren",
                exact: true,
            })
            .click();
        const groupedResponse = await grouped;
        expect(groupedResponse.ok()).toBe(true);
        expect(await groupedResponse.json()).toMatchObject({
            data: {
                field: "city",
                total: 12,
                groups: [{ value: "Berlin", count: 12 }],
            },
        });
        const group = workspace.getByRole("button", {
            name: "Berlin: zuklappen",
            exact: true,
        });
        await expect(group).toHaveAttribute("aria-expanded", "true");
        await expect(group).toContainText(/10\s+auf Seite\s+·\s+12 gesamt/);
        await expect(rows).toHaveCount(10);
        await group.click();
        const collapsed = workspace.getByRole("button", {
            name: "Berlin: aufklappen",
            exact: true,
        });
        await expect(collapsed).toHaveAttribute("aria-expanded", "false");
        await expect(rows).toHaveCount(0);
        await expect(pagination).toContainText("1–10 von 12");
        await collapsed.click();
        await expect(rows).toHaveCount(10);
        await expectSummary(page, workspace, {
            total: 12,
            active: 11,
            units: 0,
            area: 1200,
        });
        await capture(page, "desktop-grouped");
        await workspace
            .getByRole("button", { name: "Gruppierung aufheben", exact: true })
            .click();
        await expect(
            workspace.locator('tr[data-row-id^="group:"]'),
        ).toHaveCount(0);
        await expect(rows).toHaveCount(10);
        await expect(page).not.toHaveURL(/[?&]group=/);
        await expect(
            workspace.locator('[data-slot="resource-grid"]'),
        ).toHaveAttribute("aria-busy", "false");

        await pagination
            .getByRole("button", { name: "Nächste Seite", exact: true })
            .click();
        await expect(page).toHaveURL(/page=2/);
        await expect(rows).toHaveCount(2);
        await expect(pagination).toContainText("11–12 von 12");
        const secondPageIds = await rows.evaluateAll((nodes) =>
            nodes.map((node) => node.getAttribute("data-row-id")),
        );
        expect(secondPageIds.filter((id) => firstPageIds.includes(id))).toEqual(
            [],
        );
        await expectSummary(page, workspace, {
            total: 12,
            active: 11,
            units: 0,
            area: 1200,
        });

        await workspace
            .getByRole("combobox", { name: "Filter hinzufügen", exact: true })
            .click();
        await page.getByRole("option", { name: "Status", exact: true }).click();
        await workspace
            .getByRole("combobox", { name: "Status Werte", exact: true })
            .click();
        await page.getByRole("option", { name: "Aktiv", exact: true }).click();
        await page.keyboard.press("Escape");
        await expect(rows).toHaveCount(10);
        await expect(pagination).toContainText("1–10 von 11");
        await expectSummary(page, workspace, {
            total: 11,
            active: 11,
            units: 0,
            area: 1100,
        });
        await pagination
            .getByRole("button", { name: "Nächste Seite", exact: true })
            .click();
        await expect(rows).toHaveCount(1);
        await expect(pagination).toContainText("11–11 von 11");
        await expectSummary(page, workspace, {
            total: 11,
            active: 11,
            units: 0,
            area: 1100,
        });
        await workspace
            .getByRole("button", {
                name: "Status Filter entfernen",
                exact: true,
            })
            .click();
        await expect(pagination).toContainText("1–10 von 12");
        await expectSummary(page, workspace, {
            total: 12,
            active: 11,
            units: 0,
            area: 1200,
        });

        await workspace
            .getByRole("combobox", { name: "Spalten", exact: true })
            .click();
        await page.getByPlaceholder("Spalten suchen …").fill("PLZ");
        await page.getByRole("option", { name: /PLZ/ }).click();
        await page.keyboard.press("Escape");
        await expect(
            workspace.getByRole("columnheader", { name: /PLZ/ }),
        ).toHaveCount(0);
        await page.reload();
        await expect(rows).toHaveCount(10);
        await expect(
            workspace.getByRole("columnheader", { name: /PLZ/ }),
        ).toHaveCount(0);
        await workspace
            .getByRole("combobox", { name: "Spalten", exact: true })
            .click();
        await page.getByPlaceholder("Spalten suchen …").fill("PLZ");
        await page.getByRole("option", { name: /PLZ/ }).click();
        await page.keyboard.press("Escape");
        await expect(
            workspace.getByRole("columnheader", { name: /PLZ/ }),
        ).toHaveCount(1);

        await search.fill(record.code);
        await expect(rows).toHaveCount(1);
        await rows
            .getByRole("cell", { name: record.code, exact: true })
            .dblclick();
        const sheet = page.getByRole("dialog", {
            name: "Objekt bearbeiten",
            exact: true,
        });
        await expect(sheet).toBeVisible();
        await expect(sheet).toHaveAttribute("data-slot", "sheet-content");
        for (const tab of [
            "Stammdaten",
            "Verwaltung",
            "Gebäude",
            "Einheiten",
        ]) {
            await expect(
                sheet.getByRole("tab", { name: tab, exact: true }),
            ).toBeVisible();
        }
        await capture(page, "edit-desktop");
        await sheet
            .getByRole("textbox", { name: "Bezeichnung", exact: true })
            .fill("Nicht gespeichert");
        await sheet
            .getByRole("button", { name: "Abbrechen", exact: true })
            .click();
        const discard = page.getByRole("dialog", {
            name: "Änderungen verwerfen?",
            exact: true,
        });
        await discard
            .getByRole("button", { name: "Weiter bearbeiten", exact: true })
            .click();
        await expect(
            sheet.getByRole("textbox", { name: "Bezeichnung", exact: true }),
        ).toHaveValue("Nicht gespeichert");
        await sheet
            .getByRole("button", { name: "Abbrechen", exact: true })
            .click();
        await discard
            .getByRole("button", { name: "Änderungen verwerfen", exact: true })
            .click();
        await expect(sheet).toHaveCount(0);
        await expect(
            rows.getByText(record.name, { exact: true }),
        ).toBeVisible();

        await rows
            .getByRole("cell", { name: record.code, exact: true })
            .dblclick();
        await sheet
            .getByRole("textbox", { name: "Nummer", exact: true })
            .fill(created[1].code);
        await sheet
            .getByRole("tab", { name: "Verwaltung", exact: true })
            .click();
        const invalid = page.waitForResponse(
            (result) =>
                new URL(result.url()).pathname ===
                    "/api/v1/properties/mutate" &&
                result.request().headers()["precognition"] !== "true",
        );
        await sheet
            .getByRole("button", { name: "Speichern", exact: true })
            .click();
        expect((await invalid).status()).toBe(422);
        await expect(
            sheet.getByRole("tab", { name: "Stammdaten", exact: true }),
        ).toHaveAttribute("aria-selected", "true");
        await expect(
            sheet.getByRole("textbox", { name: "Nummer", exact: true }),
        ).toHaveAttribute("aria-invalid", "true");
        await expect(
            sheet.getByRole("textbox", { name: "Nummer", exact: true }),
        ).toHaveValue(created[1].code);
        await sheet
            .getByRole("textbox", { name: "Nummer", exact: true })
            .fill(record.code);
        const savedName = "Gespeichertes Testobjekt";
        await sheet
            .getByRole("textbox", { name: "Bezeichnung", exact: true })
            .fill(savedName);
        const saved = page.waitForResponse(
            (result) =>
                new URL(result.url()).pathname ===
                    "/api/v1/properties/mutate" &&
                result.request().headers()["precognition"] !== "true",
        );
        await sheet
            .getByRole("button", { name: "Speichern", exact: true })
            .click();
        const savedResponse = await saved;
        expect(savedResponse.ok()).toBe(true);
        expect(savedResponse.request().postDataJSON().mutate[0]).toMatchObject({
            operation: "update",
            key: record.id,
            version: record.updated_at,
        });
        await expect(sheet).toHaveCount(0);
        await page.reload();
        await expect(rows.getByText(savedName, { exact: true })).toBeVisible();
        const persisted = await api<PropertyPage>(
            page,
            "/api/v1/properties/search",
            {
                search: {
                    filters: [{ field: "id", value: record.id }],
                    limit: 10,
                },
            },
        );
        expect(persisted.data[0]).toMatchObject({
            id: record.id,
            name: savedName,
            manager_email: record.manager_email,
            notes: record.notes,
        });
        await rows.getByText(savedName, { exact: true }).click();
        await expect(page).toHaveURL(
            new RegExp(`/properties/${record.id}(?:\\?|$)`),
        );
        await expect(
            page.getByRole("heading", { name: savedName, exact: true }),
        ).toBeVisible();
        const propertyOverview = page.locator(
            '[data-slot="property-overview"]',
        );
        await expect(
            propertyOverview.locator('[data-slot="property-general-values"]'),
        ).toBeVisible();
        await capture(page, "detail-desktop");
        const building = propertyOverview.locator(
            '[data-slot="property-building-values"]',
        );
        await building
            .getByRole("button", { name: "Heizung bearbeiten", exact: true })
            .click();
        await expect(
            building.getByRole("form", { name: "Heizung ändern", exact: true }),
        ).toBeVisible();
        await capture(page, "detail-inline-edit");
        await building
            .getByRole("button", { name: "Abbrechen", exact: true })
            .click();

        await page.setViewportSize({ width: 390, height: 844 });
        await capture(page, "detail-mobile");
        await page.goto(`/properties?q=${encodeURIComponent(prefix)}`);
        await expect(rows).toHaveCount(10);
        await expectSummary(page, workspace, {
            total: 12,
            active: 11,
            units: 0,
            area: 1200,
        });
        const scroll = workspace.locator('[data-slot="scroll-area-viewport"]');
        expect(
            await scroll.evaluate(
                (element) => element.scrollWidth - element.clientWidth,
            ),
        ).toBeGreaterThan(0);
        const pagerBox = (await pagination.boundingBox())!;
        expect(pagerBox.y + pagerBox.height).toBeLessThanOrEqual(844);
        await capture(page, "mobile");
        await scroll.evaluate((element) => {
            element.scrollLeft = element.scrollWidth;
        });
        await expect
            .poll(() => scroll.evaluate((element) => element.scrollLeft))
            .toBeGreaterThan(0);
        expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(390);
        await scroll.evaluate((element) => {
            element.scrollLeft = 0;
        });
        await search.fill(record.code);
        await expect(rows).toHaveCount(1);
        await rows
            .getByRole("cell", { name: record.code, exact: true })
            .dblclick();
        await expect(sheet).toBeVisible();
        const sheetBox = (await sheet.boundingBox())!;
        expect(sheetBox.x).toBeGreaterThanOrEqual(0);
        expect(sheetBox.x + sheetBox.width).toBeLessThanOrEqual(390);
        await capture(page, "edit-mobile");
        await sheet
            .getByRole("button", { name: "Abbrechen", exact: true })
            .click();
        expect(errors).toEqual([]);
    } finally {
        // Delete only IDs returned by this test's create request, never shared seed data.
        if (created.length) {
            const own = await api<PropertyPage>(
                page,
                "/api/v1/properties/search",
                {
                    search: {
                        filters: [
                            {
                                field: "id",
                                operator: "in",
                                value: created.map((record) => record.id),
                            },
                        ],
                        limit: 100,
                    },
                },
            );
            expect(
                own.data.every((record) => record.code.startsWith(prefix)),
            ).toBe(true);
            const active = own.data.filter(
                (record) => record.status !== "archived",
            );
            if (active.length) {
                await api(page, "/api/v1/properties/mutate", {
                    mutate: active.map((record) => ({
                        operation: "update",
                        key: record.id,
                        version: record.updated_at,
                        attributes: { status: "archived" },
                    })),
                });
            }
            if (own.data.length) {
                await api(
                    page,
                    "/api/v1/properties",
                    {
                        resources: own.data.map((record) => record.id),
                    },
                    "DELETE",
                );
            }
        }
    }
});

test("rent conditions calculate local previews in the infinite grid without mutating seeded records", async ({
    page,
}) => {
    test.setTimeout(90_000);
    await mkdir("screenshots", { recursive: true });
    const errors: string[] = [];
    const mutations: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
        const path = new URL(request.url()).pathname;
        if (path.startsWith("/api/v1/") && path.endsWith("/mutate")) {
            mutations.push(`${request.method()} ${path}`);
        }
    });
    await loginWorkspace(page);

    const loaded = page.waitForResponse(
        (response) =>
            new URL(response.url()).pathname ===
            "/api/v1/rent-conditions/search",
    );
    await page.goto("/rent-conditions");
    const response = await loaded;
    expect(response.ok()).toBe(true);
    expect(response.request().postDataJSON().search.limit).toBe(25);
    const firstPage = (await response.json()) as {
        data: RentConditionFixture[];
        total: number;
    };
    expect(
        firstPage.data.length,
        "PropertySeeder stellt bestehende Konditionen bereit",
    ).toBeGreaterThan(0);
    expect(firstPage.total).toBeGreaterThan(25);
    const original = firstPage.data[0];
    const baseCents = Math.round(Number(original.base_rent) * 100);
    expect(baseCents).toBeGreaterThan(0);
    const money = (cents: number) =>
        new Intl.NumberFormat("de-DE", {
            style: "currency",
            currency: "EUR",
        }).format(cents / 100);
    const defaultRentCents = Math.round((baseCents * 105) / 100);
    const proposedRentCents = Math.round((baseCents * 110) / 100);
    const monthlyDeltaCents = proposedRentCents - baseCents;

    const workspace = page.locator(
        '[data-slot="resource-grid-page"][data-resource="rent-conditions"]',
    );
    const row = workspace.locator(`tbody tr[data-row-id="${original.id}"]`);
    await expect(row).toBeVisible();
    await expect(
        workspace.locator('[data-slot="data-grid-pagination"]'),
    ).toHaveCount(0);
    await expect(
        workspace.locator('[data-slot="resource-grid-load-more"]'),
    ).toContainText(new RegExp(`von ${firstPage.total} geladen`));

    const percent = row.getByRole("textbox", { name: /^Mietanpassung · % – / });
    const date = row.getByRole("textbox", { name: /^Anpassung ab – / });
    await expect(percent).toHaveValue("5");
    const initialDate = await date.inputValue();
    const year = Number(initialDate.slice(-4));
    expect(year).toBeGreaterThan(2000);
    const forecastYear = row.getByRole("textbox", { name: /^Vorschaujahr – / });
    expect(Number((await forecastYear.inputValue()).replaceAll(".", ""))).toBe(
        year,
    );
    await expect(
        await gridCell(workspace, row, "scenario_new_rent"),
    ).toContainText(money(defaultRentCents));

    await percent.fill("10");
    await percent.press("Tab");
    await expect(
        await gridCell(workspace, row, "scenario_new_rent"),
    ).toContainText(money(proposedRentCents));
    await expect(
        await gridCell(workspace, row, "scenario_year_delta"),
    ).toContainText(money(monthlyDeltaCents * 12));
    await date.fill(`01.07.${year}`);
    await date.press("Tab");
    await expect(date).toHaveValue(`01.07.${year}`);
    await expect(
        await gridCell(workspace, row, "scenario_year_delta"),
    ).toContainText(money(monthlyDeltaCents * 6));
    await expect(page).toHaveURL(/\/rent-conditions(?:\?|$)/);

    await workspace
        .getByRole("combobox", { name: "Spalten", exact: true })
        .click();
    const chooser = page.getByRole("dialog", {
        name: "Spalten auswählen",
        exact: true,
    });
    await chooser.getByRole("option", { name: /^Mietvorschau/ }).click();
    const previewColumns = chooser.getByRole("listbox", {
        name: "Mietvorschau",
        exact: true,
    });
    await expect(previewColumns).toBeVisible();
    await previewColumns
        .getByRole("option", { name: /^Bewertungsbasis · Vorschau/ })
        .click();
    await previewColumns
        .getByRole("option", { name: /^Bruttorendite · Vorschau/ })
        .click();
    await capture(page, "columns-desktop", "rent-conditions");
    await page.keyboard.press("Escape");

    const valuation = row.getByRole("textbox", {
        name: /^Bewertungsbasis · Vorschau – /,
    });
    await valuation.fill("100000");
    await valuation.press("Tab");
    const annualRentCents = baseCents * 12 + monthlyDeltaCents * 6;
    const yieldPercent =
        Math.round((annualRentCents / 100 / 100000) * 10000) / 100;
    const yieldCaption = `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(yieldPercent)} %`;
    await expect(
        await gridCell(workspace, row, "scenario_gross_yield"),
    ).toContainText(yieldCaption);
    await percent.scrollIntoViewIfNeeded();
    await capture(page, "desktop", "rent-conditions");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(percent).toHaveValue("10");
    await expect(date).toHaveValue(`01.07.${year}`);
    const forecast = await gridCell(workspace, row, "scenario_new_rent");
    await forecast.scrollIntoViewIfNeeded();
    await expect(forecast).toContainText(money(proposedRentCents));
    await expect(
        workspace.locator('[data-slot="resource-grid-load-more"]'),
    ).toBeVisible();
    await capture(page, "mobile", "rent-conditions");
    await workspace
        .getByRole("combobox", { name: "Spalten", exact: true })
        .click();
    await chooser.getByPlaceholder("Spalten suchen …").fill("Bruttorendite");
    await expect(
        chooser.getByRole("option", { name: /^Bruttorendite · Vorschau/ }),
    ).toHaveAttribute("aria-selected", "true");
    await capture(page, "columns-mobile", "rent-conditions");
    await page.keyboard.press("Escape");

    await workspace
        .getByRole("button", { name: "Vorschau zurücksetzen", exact: true })
        .click();
    await expect(percent).toHaveValue("5");
    await expect(date).toHaveValue(initialDate);
    await expect(
        await gridCell(workspace, row, "scenario_new_rent"),
    ).toContainText(money(defaultRentCents));
    const persisted = await api<{ data: RentConditionFixture[] }>(
        page,
        "/api/v1/rent-conditions/search",
        {
            search: {
                filters: [{ field: "id", value: original.id }],
                limit: 10,
            },
        },
    );
    expect(persisted.data).toHaveLength(1);
    expect(persisted.data[0]).toMatchObject({
        id: original.id,
        updated_at: original.updated_at,
        effective_from: original.effective_from,
        base_rent: original.base_rent,
        service_charge: original.service_charge,
        heating_cost: original.heating_cost,
        vat_rate: original.vat_rate,
    });
    expect(mutations).toEqual([]);
    expect(errors).toEqual([]);
});
