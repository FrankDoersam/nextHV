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
    await page.getByLabel("E-Mail-Adresse").fill("e2e@example.test");
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

test("portfolio totals survive group paging and collapse while filters clear selection", async ({
    page,
}) => {
    const { writes, errors } = observeDemo(page);
    await page.goto("/enterprise-demo/objekte-einheiten");
    await expect(
        page.getByRole("heading", { name: "Objekte & Einheiten", exact: true }),
    ).toBeVisible();
    const module = page.locator('[data-module="properties-units"]');
    await expect(module.getByTestId("metric-portfolio")).toContainText(
        "48 Einheiten",
    );
    await expect(
        module.getByText("48 von 48 Einheiten", { exact: true }),
    ).toBeVisible();
    const rentTotal = await module
        .getByTestId("total-filtered-rent")
        .innerText();
    const rentMetric = await module.getByTestId("metric-rent").innerText();
    await capture(page, "properties");

    await module
        .getByRole("button", { name: "Nächste Seite", exact: true })
        .click();
    await expect(
        module.getByText("Gruppe 4–6 von 6", { exact: true }),
    ).toBeVisible();
    await expect(module.getByTestId("total-filtered-rent")).toHaveText(
        rentTotal,
        { useInnerText: true },
    );
    await expect(module.getByTestId("metric-rent")).toHaveText(rentMetric, {
        useInnerText: true,
    });
    await module
        .getByRole("button", { name: "Vorherige Seite", exact: true })
        .click();
    await expect(
        module.getByText("Gruppe 1–3 von 6", { exact: true }),
    ).toBeVisible();

    const expandedGroup = module
        .getByRole("button", { name: /: zuklappen$/ })
        .first();
    const expandedLabel = (await expandedGroup.getAttribute("aria-label"))!;
    const groupTotal = await expandedGroup
        .locator("xpath=ancestor::tr")
        .innerText();
    await expandedGroup.click();
    const collapsedGroup = module.getByRole("button", {
        name: expandedLabel.replace(/zuklappen$/, "aufklappen"),
        exact: true,
    });
    await expect(collapsedGroup).toHaveAttribute("aria-expanded", "false");
    await expect(collapsedGroup.locator("xpath=ancestor::tr")).toHaveText(
        groupTotal,
        { useInnerText: true },
    );
    await expect(
        module.getByRole("button", { name: / – Details öffnen$/ }),
    ).toHaveCount(0);
    await expect(module.getByTestId("total-filtered-rent")).toHaveText(
        rentTotal,
        { useInnerText: true },
    );
    await collapsedGroup.click();

    await module
        .getByRole("checkbox", { name: "Zeile auswählen", exact: true })
        .first()
        .check();
    await expect(
        module.getByRole("region", {
            name: "Ausgewählte Datensätze",
            exact: true,
        }),
    ).toContainText("1 ausgewählt");
    await expect(module.getByTestId("total-selected-rent")).toHaveCount(1);
    await module
        .getByRole("group", { name: "Vordefinierte Ansichten", exact: true })
        .getByRole("button", { name: /^Leerstand/ })
        .click();
    await expect(
        module.getByText("6 von 48 Einheiten", { exact: true }),
    ).toBeVisible();
    await expect(
        module.getByRole("region", {
            name: "Ausgewählte Datensätze",
            exact: true,
        }),
    ).toHaveCount(0);
    await expect(module.getByTestId("total-selected-rent")).toHaveCount(0);
    await expect(module.getByTestId("total-filtered-rent")).toHaveText(
        /0,00\s*€/,
    );

    await module
        .getByRole("textbox", { name: "Einheiten durchsuchen", exact: true })
        .fill("nicht-vorhandene-demo-einheit");
    await expect(
        module.getByText("Keine passenden Einheiten", { exact: true }),
    ).toBeVisible();
    await expect(
        module.getByText("0 von 48 Einheiten", { exact: true }),
    ).toBeVisible();
    await expect(
        module.getByRole("button", { name: "Export", exact: true }),
    ).toBeDisabled();
    await module
        .getByRole("button", { name: "Filter zurücksetzen", exact: true })
        .click();
    await expect(
        module.getByText("48 von 48 Einheiten", { exact: true }),
    ).toBeVisible();
    await expect(module.getByTestId("total-filtered-rent")).toHaveText(
        rentTotal,
        { useInnerText: true },
    );

    await page
        .getByRole("navigation", { name: "Enterprise-Demos", exact: true })
        .getByRole("link", { name: "Zahlungen / OP", exact: true })
        .click();
    await expect(page).toHaveURL(/\/enterprise-demo\/zahlungen-op$/);
    await expect(
        page.getByRole("heading", {
            name: "Zahlungen & offene Posten",
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        page
            .locator('[data-module="payments-open-items"]')
            .getByTestId("metric-receivables"),
    ).toContainText("48 Posten");
    await capture(page, "payments");
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
});

test("a simulated payment updates the detail history and full balance without a business API write", async ({
    page,
}) => {
    const { writes, errors } = observeDemo(page);
    await page.goto("/enterprise-demo/zahlungen-op");
    await expect(
        page.getByRole("heading", {
            name: "Zahlungen & offene Posten",
            exact: true,
        }),
    ).toBeVisible();
    const module = page.locator('[data-module="payments-open-items"]');
    const total = module.getByTestId("total-filtered-outstanding");
    const initialBalance = await currencyCents(total);
    const search = module.getByRole("textbox", {
        name: "Posten durchsuchen",
        exact: true,
    });
    await search.fill("OP-0002");
    await expect(
        module.getByText("1 von 48 Posten", { exact: true }),
    ).toBeVisible();
    const remaining = await currencyCents(total);
    expect(remaining).toBeGreaterThan(0);
    await module
        .getByRole("button", { name: "Lindenhof: aufklappen", exact: true })
        .click();
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
        detail.getByText("Ausgeglichen", { exact: true }),
    ).toBeVisible();
    await expect(
        detail.getByRole("button", { name: "Zahlung simulieren", exact: true }),
    ).toBeDisabled();
    await expect(total).toHaveText(/0,00\s*€/);
    await detail
        .getByRole("button", { name: "Details schließen", exact: true })
        .click();
    await expect(detail).toHaveCount(0);
    await search.fill("");
    await expect(
        module.getByText("48 von 48 Posten", { exact: true }),
    ).toBeVisible();
    await expect
        .poll(() => currencyCents(total))
        .toBe(initialBalance - remaining);
    await expect(module.getByTestId("metric-open")).toContainText(
        new Intl.NumberFormat("de-DE", {
            style: "currency",
            currency: "EUR",
        }).format((initialBalance - remaining) / 100),
    );
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
});

test("mobile payment controls fit the viewport with internal table scrolling in light and dark", async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { writes, errors } = observeDemo(page);
    await page.goto("/enterprise-demo/zahlungen-op");
    await expect(
        page.getByRole("heading", {
            name: "Zahlungen & offene Posten",
            exact: true,
        }),
    ).toBeVisible();
    const module = page.locator('[data-module="payments-open-items"]');
    await expect(
        module.getByRole("textbox", {
            name: "Posten durchsuchen",
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        module.getByRole("button", { name: "Export", exact: true }),
    ).toBeVisible();
    await expect(
        module.getByRole("combobox", { name: "Gruppierung", exact: true }),
    ).toBeVisible();
    await capture(page, "payments-mobile");
    const tableViewport = module.locator('[data-slot="data-grid"]');
    await expect
        .poll(() =>
            tableViewport.evaluate(
                (node) => node.scrollWidth - node.clientWidth,
            ),
        )
        .toBeGreaterThan(0);
    await tableViewport.evaluate((node) => {
        node.scrollLeft = 250;
    });
    await expect
        .poll(() => tableViewport.evaluate((node) => node.scrollLeft))
        .toBeGreaterThan(0);
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await tableViewport.evaluate((node) => {
        node.scrollLeft = 0;
    });

    await page.evaluate(() => {
        document.documentElement.classList.add("dark");
        document.documentElement.style.colorScheme = "dark";
    });
    await expect(page.locator("html")).toHaveClass(/dark/);
    await capture(page, "payments-mobile-dark");
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
});
