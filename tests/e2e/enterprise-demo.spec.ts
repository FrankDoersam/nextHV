import {
    expect,
    test as base,
    type BrowserContext,
    type Locator,
    type Page,
} from "@playwright/test";

type DemoStorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

// Share one login while each scenario keeps its own browser context and UI state.
const test = base.extend<{}, { enterpriseStorageState: DemoStorageState }>({
    enterpriseStorageState: [
        async ({ browser }, use) => {
            const context = await browser.newContext({
                baseURL: process.env.E2E_URL ?? "http://127.0.0.1:8000",
            });
            let state: DemoStorageState;
            try {
                await login(await context.newPage());
                state = await context.storageState();
            } finally {
                await context.close();
            }
            await use(state);
        },
        { scope: "worker" },
    ],
    storageState: async ({ enterpriseStorageState }, use) => {
        await use(enterpriseStorageState);
    },
});

test.use({
    viewport: { width: 1600, height: 1100 },
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    reducedMotion: "reduce",
});

async function login(page: Page) {
    await page.goto("/");
    await page.getByLabel("E-Mail-Adresse").fill("enterprise-e2e@example.test");
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

function observeDemo(page: Page) {
    const writes: string[] = [];
    const errors: string[] = [];
    page.on("request", (request) => {
        if (
            ["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) &&
            new URL(request.url()).pathname.startsWith("/api/v1/")
        ) {
            writes.push(
                `${request.method()} ${new URL(request.url()).pathname}`,
            );
        }
    });
    page.on("pageerror", (error) => errors.push(error.message));
    return { writes, errors };
}

async function capture(page: Page, name: string) {
    await page.evaluate(() => document.fonts.ready);
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.screenshot({
        path: `screenshots/features-enterprise-${name}.png`,
        fullPage: true,
        animations: "disabled",
    });
}

async function currencyCents(locator: Locator) {
    const text = await locator.innerText();
    return Math.round(
        Number(text.replace(/[^\d,\-]/g, "").replace(",", ".")) * 100,
    );
}

async function editTextFilter(
    page: Page,
    module: Locator,
    field: string,
    value: string,
) {
    const chip = module.getByRole("group", {
        name: new RegExp("^" + field + " enthält"),
    });
    await chip.getByRole("button").nth(1).click();
    const input = page.getByRole("textbox", { name: field, exact: true });
    await input.fill(value);
    await input.press("Enter");
    await expect(input).toHaveCount(0);
}

async function downloadCsv(page: Page, trigger: Locator) {
    const downloaded = page.waitForEvent("download");
    await trigger.click();
    const download = await downloaded;
    expect(await download.failure()).toBeNull();
    const stream = await download.createReadStream();
    expect(stream).not.toBeNull();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    return {
        name: download.suggestedFilename(),
        lines: Buffer.concat(chunks)
            .toString("utf8")
            .replace(/^\uFEFF/, "")
            .split("\r\n"),
    };
}

async function expectGridLayout(
    page: Page,
    module: Locator,
    hasMetrics: boolean,
) {
    const toolbar = module.locator('[data-slot="enterprise-toolbar"]');
    const scroll = module.locator('[data-slot="enterprise-grid-scroll"]');
    const footer = module.getByTestId("enterprise-footer");
    const frame = module.getByTestId("enterprise-frame");
    await expect(footer).toBeVisible();
    await expect(scroll).toBeVisible();
    const [toolbarBox, scrollBox, footerBox, frameBox] = await Promise.all([
        toolbar.boundingBox(),
        scroll.boundingBox(),
        footer.boundingBox(),
        frame.boundingBox(),
    ]);
    expect(toolbarBox).not.toBeNull();
    expect(scrollBox).not.toBeNull();
    expect(footerBox).not.toBeNull();
    expect(frameBox).not.toBeNull();
    expect(scrollBox!.height).toBeGreaterThan(180);
    expect(scrollBox!.y).toBeGreaterThanOrEqual(
        toolbarBox!.y + toolbarBox!.height - 1,
    );
    expect(scrollBox!.y + scrollBox!.height).toBeLessThanOrEqual(
        footerBox!.y + 1,
    );
    expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(
        page.viewportSize()!.height,
    );
    expect(frameBox!.x).toBeGreaterThanOrEqual(0);
    expect(frameBox!.x + frameBox!.width).toBeLessThanOrEqual(
        page.viewportSize()!.width,
    );
    const kpis = module.locator('[data-slot="enterprise-kpis"]');
    if (hasMetrics) {
        const kpiBox = await kpis.boundingBox();
        expect(kpiBox).not.toBeNull();
        expect(Math.abs(kpiBox!.x - frameBox!.x)).toBeLessThan(2);
        expect(
            Math.abs(kpiBox!.x + kpiBox!.width - frameBox!.x - frameBox!.width),
        ).toBeLessThan(2);
        expect(kpiBox!.y + kpiBox!.height).toBeLessThanOrEqual(frameBox!.y);
    } else {
        await expect(kpis).toHaveCount(0);
    }
}

test("object master data stays flat while filters, saved columns, export and details share the selected view", async ({
    page,
}) => {
    const { writes, errors } = observeDemo(page);
    await page.goto("/enterprise-demo/objekte-einheiten");
    await expect(
        page.getByRole("heading", { name: "Objekte", exact: true }),
    ).toBeVisible();
    const module = page.locator('[data-module="properties-master-data"]');
    const details = module.getByRole("button", { name: / – Details öffnen$/ });
    await expect(details).toHaveCount(6);
    for (const name of [
        "Objektanschrift",
        "Objektnummer",
        "Ort",
        "Betreuung",
        "Baujahr",
    ]) {
        await expect(
            module.getByRole("columnheader", {
                name: new RegExp("^" + name + "(?:\\s|$)"),
            }),
        ).toBeVisible();
    }
    await expect(module.getByRole("columnheader")).toHaveCount(7);
    await expect(module.getByRole("tab")).toHaveCount(0);
    await expect(
        module.getByRole("group", {
            name: "Vordefinierte Ansichten",
            exact: true,
        }),
    ).toHaveCount(0);
    await expect(
        module.getByRole("combobox", { name: "Gruppierung", exact: true }),
    ).toHaveCount(0);
    await expect(
        module.getByRole("button", { name: /: (auf|zu)klappen$/ }),
    ).toHaveCount(0);
    const toolbar = module.locator('[data-slot="enterprise-toolbar"]');
    await expect(
        toolbar.getByRole("group", { name: /^Objektanschrift enthält/ }),
    ).toBeVisible();
    await expect(
        toolbar.getByRole("button", { name: "Suchen...", exact: true }),
    ).toBeVisible();
    await expect(
        toolbar.getByRole("button", { name: "Filter", exact: true }),
    ).toBeVisible();
    await expect(
        toolbar.getByRole("button", { name: "Spalten", exact: true }),
    ).toBeVisible();
    await expectGridLayout(page, module, false);
    await capture(page, "properties");

    await editTextFilter(page, module, "Objektanschrift", "Berlin");
    await expect(details).toHaveCount(1);
    await expect(
        module.getByRole("button", {
            name: "Lindenhof – Details öffnen",
            exact: true,
        }),
    ).toBeVisible();
    await toolbar.getByRole("button", { name: "Spalten", exact: true }).click();
    const yearColumn = page.getByRole("menuitemcheckbox", {
        name: "Baujahr",
        exact: true,
    });
    await expect(yearColumn).toHaveAttribute("aria-checked", "true");
    await yearColumn.click();
    await expect(yearColumn).toHaveAttribute("aria-checked", "false");
    await page.keyboard.press("Escape");
    await expect(
        module.getByRole("columnheader", { name: "Baujahr", exact: true }),
    ).toHaveCount(0);

    await module
        .getByRole("button", { name: "Ansicht speichern", exact: true })
        .click();
    const save = page.getByRole("dialog", {
        name: "Ansicht speichern",
        exact: true,
    });
    await save
        .getByRole("textbox", { name: "Name der Ansicht", exact: true })
        .fill("Berlin kompakt");
    await save.getByRole("button", { name: "Speichern", exact: true }).click();
    await expect(save).toHaveCount(0);
    const exported = await downloadCsv(
        page,
        module.getByRole("button", { name: "Export", exact: true }),
    );
    expect(exported.name).toBe("properties-master-data-gefiltert.csv");
    expect(exported.lines).toHaveLength(2);
    expect(exported.lines[0]).toBe(
        '"Objektanschrift";"Objektnummer";"Ort";"Betreuung"',
    );
    expect(exported.lines[1]).toContain(
        '"Lindenhof · Beispielallee 8, Berlin"',
    );
    expect(exported.lines[1]).toContain('"OBJ-001"');

    await module
        .getByRole("checkbox", { name: "Zeile auswählen", exact: true })
        .check();
    await expect(
        module.getByRole("region", {
            name: "Ausgewählte Datensätze",
            exact: true,
        }),
    ).toContainText("1 ausgewählt");
    await editTextFilter(
        page,
        module,
        "Objektanschrift",
        "nicht-vorhandenes-objekt",
    );
    await expect(
        module.getByText("Keine passenden Objekte", { exact: true }),
    ).toBeVisible();
    await expect(
        module.getByRole("region", {
            name: "Ausgewählte Datensätze",
            exact: true,
        }),
    ).toHaveCount(0);
    await expect(
        module.getByRole("button", { name: "Export", exact: true }),
    ).toBeDisabled();
    await module
        .getByRole("button", { name: "Filter zurücksetzen", exact: true })
        .click();
    await expect(details).toHaveCount(6);

    await page.reload();
    await expect(details).toHaveCount(6);
    await expect(
        module.getByRole("columnheader", { name: "Baujahr", exact: true }),
    ).toBeVisible();
    await module
        .getByRole("button", { name: "Meine Ansichten", exact: true })
        .click();
    await page
        .getByRole("menuitem", { name: "Berlin kompakt", exact: true })
        .click();
    await expect(details).toHaveCount(1);
    await expect(
        module.getByRole("columnheader", { name: "Baujahr", exact: true }),
    ).toHaveCount(0);
    await module
        .getByRole("button", {
            name: "Lindenhof – Details öffnen",
            exact: true,
        })
        .click();
    const detail = page.getByRole("dialog", { name: "Lindenhof", exact: true });
    await expect(
        detail.getByRole("heading", { name: "Objektstammdaten", exact: true }),
    ).toBeVisible();
    await expect(detail.getByText("OBJ-001", { exact: true })).toBeVisible();
    await expect(
        detail.getByText("Beispielallee 8", { exact: true }),
    ).toBeVisible();
    await expect(detail.getByText("2004", { exact: true })).toBeVisible();
    await expect(
        detail.getByText("Nora Beispiel", { exact: true }),
    ).toBeVisible();
    await capture(page, "property-detail");
    await detail
        .getByRole("button", { name: "Details schließen", exact: true })
        .click();
    await expect(detail).toHaveCount(0);
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
});

test("finances include all receivables while a simulated payment leaves the open-item list and updates totals", async ({
    page,
}) => {
    const { writes, errors } = observeDemo(page);
    await page.goto("/enterprise-demo/finanzen");
    await expect(
        page.getByRole("heading", { name: "Finanzen", exact: true }),
    ).toBeVisible();
    const finance = page.locator('[data-module="finance-receivables"]');
    await expect(finance.getByTestId("metric-receivables")).toContainText(
        "48 Forderungen",
    );
    await expect(finance.getByTestId("metric-receivables")).toContainText(
        "49.103,25",
    );
    await expect(finance.getByTestId("metric-received")).toContainText(
        "17.419,97",
    );
    await expect(finance.getByTestId("metric-open")).toContainText("31.683,28");
    for (const name of ["Soll", "Gezahlt", "Offen"]) {
        await expect(
            finance.getByRole("columnheader", { name, exact: true }),
        ).toBeVisible();
    }
    const financeTotal = finance.getByTestId("total-filtered-outstanding");
    const initialTotal = await currencyCents(financeTotal);
    expect(initialTotal).toBe(3_168_328);
    await expectGridLayout(page, finance, true);
    await capture(page, "finance");
    await finance
        .getByRole("button", { name: "Nächste Seite", exact: true })
        .click();
    await expect.poll(() => currencyCents(financeTotal)).toBe(initialTotal);
    const allReceivables = await downloadCsv(
        page,
        finance.getByRole("button", { name: "Export", exact: true }),
    );
    expect(allReceivables.lines).toHaveLength(49);
    expect(
        allReceivables.lines
            .slice(1)
            .filter((line) => line.includes('"Ausgeglichen"')),
    ).toHaveLength(12);

    await page
        .getByRole("navigation", { name: "Hauptnavigation", exact: true })
        .locator('a[href="/enterprise-demo/zahlungen-op"]')
        .click();
    await expect(page).toHaveURL(/\/enterprise-demo\/zahlungen-op$/);
    await expect(
        page.getByRole("heading", { name: "Offene Posten", exact: true }),
    ).toBeVisible();
    const module = page.locator('[data-module="open-items"]');
    await expect(module.getByTestId("metric-open-count")).toContainText("36");
    await expect(
        module.getByRole("columnheader", { name: "Soll", exact: true }),
    ).toHaveCount(0);
    await expect(
        module.getByRole("columnheader", { name: "Gezahlt", exact: true }),
    ).toHaveCount(0);
    const openItems = await downloadCsv(
        page,
        module.getByRole("button", { name: "Export", exact: true }),
    );
    expect(openItems.lines).toHaveLength(37);
    expect(openItems.lines.join("\n")).not.toContain('"Ausgeglichen"');
    await expectGridLayout(page, module, true);
    await capture(page, "open-items");

    await editTextFilter(page, module, "Mietpartei", "Leon Muster");
    await module
        .getByRole("button", {
            name: "MI-202611-002 – Details öffnen",
            exact: true,
        })
        .click();
    const detail = page.getByRole("dialog", {
        name: "MI-202611-002",
        exact: true,
    });
    await expect(
        detail.getByRole("heading", { name: "Zahlungshistorie", exact: true }),
    ).toBeVisible();
    await expect(
        detail.getByText("Teilzahlung eingegangen", { exact: true }),
    ).toBeVisible();
    await capture(page, "payment-detail");
    await detail
        .getByRole("button", { name: "Zahlung simulieren", exact: true })
        .click();
    await expect(
        detail.getByText("Demo-Zahlung simuliert", { exact: true }),
    ).toBeVisible();
    await expect(
        detail.getByText("Posten vollständig ausgeglichen", { exact: true }),
    ).toBeVisible();
    await expect(
        detail.getByRole("button", { name: "Zahlung simulieren", exact: true }),
    ).toBeDisabled();
    await detail
        .getByRole("button", { name: "Details schließen", exact: true })
        .click();
    await expect(detail).toHaveCount(0);
    await expect(
        module.getByRole("button", {
            name: "MI-202611-002 – Details öffnen",
            exact: true,
        }),
    ).toHaveCount(0);
    await editTextFilter(page, module, "Mietpartei", "");
    await expect
        .poll(() =>
            currencyCents(module.getByTestId("total-filtered-outstanding")),
        )
        .toBe(3_132_994);
    await expect(module.getByTestId("metric-open")).toContainText("31.329,94");
    await expect(module.getByTestId("metric-open-count")).toContainText("35");
    const remainingItems = await downloadCsv(
        page,
        module.getByRole("button", { name: "Export", exact: true }),
    );
    expect(remainingItems.lines).toHaveLength(36);
    expect(remainingItems.lines.join("\n")).not.toContain('"MI-202611-002"');
    expect(remainingItems.lines.join("\n")).not.toContain('"Ausgeglichen"');
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
});

test("mobile object, finance and open-item grids keep scrolling inside the table and the footer on screen", async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { writes, errors } = observeDemo(page);
    for (const view of [
        {
            path: "/enterprise-demo/objekte-einheiten",
            title: "Objekte",
            module: "properties-master-data",
            name: "properties-mobile",
            metrics: false,
        },
        {
            path: "/enterprise-demo/finanzen",
            title: "Finanzen",
            module: "finance-receivables",
            name: "finance-mobile",
            metrics: true,
        },
        {
            path: "/enterprise-demo/zahlungen-op",
            title: "Offene Posten",
            module: "open-items",
            name: "open-items-mobile",
            metrics: true,
        },
    ]) {
        await page.goto(view.path);
        await expect(
            page.getByRole("heading", { name: view.title, exact: true }),
        ).toBeVisible();
        const module = page.locator('[data-module="' + view.module + '"]');
        await expectGridLayout(page, module, view.metrics);
        const viewport = module.locator(
            '[data-slot="enterprise-grid-scroll"] [data-slot="scroll-area-viewport"]',
        );
        await expect
            .poll(() =>
                viewport.evaluate(
                    (node) => node.scrollWidth - node.clientWidth,
                ),
            )
            .toBeGreaterThan(0);
        await viewport.evaluate((node) => {
            node.scrollLeft = 250;
        });
        await expect
            .poll(() => viewport.evaluate((node) => node.scrollLeft))
            .toBeGreaterThan(0);
        await viewport.evaluate((node) => {
            node.scrollLeft = 0;
        });
        if (view.metrics) {
            await expect
                .poll(() =>
                    viewport.evaluate(
                        (node) => node.scrollHeight - node.clientHeight,
                    ),
                )
                .toBeGreaterThan(0);
            const footer = module.getByTestId("enterprise-footer");
            const footerBefore = await footer.boundingBox();
            await viewport.evaluate((node) => {
                node.scrollTop = 200;
            });
            await expect
                .poll(() => viewport.evaluate((node) => node.scrollTop))
                .toBeGreaterThan(0);
            const footerAfter = await footer.boundingBox();
            expect(Math.abs(footerAfter!.y - footerBefore!.y)).toBeLessThan(1);
            await viewport.evaluate((node) => {
                node.scrollTop = 0;
            });
        }
        await capture(page, view.name);
    }
    await page.evaluate(() => {
        document.documentElement.classList.add("dark");
        document.documentElement.style.colorScheme = "dark";
    });
    await capture(page, "open-items-mobile-dark");
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
});
