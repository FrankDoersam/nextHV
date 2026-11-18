import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test.use({
    viewport: { width: 1440, height: 1000 },
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    reducedMotion: "reduce",
});

async function capture(page: Page, name: string) {
    await page.evaluate(() => document.fonts.ready);
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.screenshot({
        path: `screenshots/features-timeline-${name}.png`,
        fullPage: true,
        animations: "disabled",
    });
}

test("Timeline demo opens from the app menu, previews and downloads its files, and fits mobile navigation", async ({
    page,
}) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await mkdir("screenshots", { recursive: true });
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

    const writes: string[] = [];
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
    const timelineLink = page
        .getByRole("navigation", { name: "Hauptnavigation", exact: true })
        .getByRole("link", { name: /^Timeline/ });
    await timelineLink.click();
    await expect(page).toHaveURL(/\/reui-timeline-demo$/);
    await expect(
        page.getByRole("heading", { name: "Timeline 2", exact: true }),
    ).toBeVisible();
    await expect(timelineLink).toHaveAttribute("aria-current", "page");
    const timeline = page.getByRole("list", { name: "Activity timeline" });
    await expect(timeline.getByRole("listitem")).toHaveCount(4);
    await capture(page, "desktop");
    await timeline.screenshot({
        path: "screenshots/features-timeline-reference.png",
        animations: "disabled",
    });

    await timeline.getByRole("button", { name: /^SSO-map\.csv/ }).click();
    const preview = page.getByRole("dialog", {
        name: "SSO-map.csv",
        exact: true,
    });
    await expect(preview).toContainText("account-admins,Admin,Verified");
    await expect(preview).toHaveAccessibleDescription(
        /Demo-Vorschau mit fiktiven Daten/,
    );
    await capture(page, "attachment-preview");
    await page.keyboard.press("Escape");
    await expect(preview).toHaveCount(0);

    for (const file of [
        { name: "Handoff.pdf", content: "%PDF-" },
        {
            name: "SSO-map.csv",
            content: "directory_group,workspace_role,sync_status",
        },
        { name: "Import-log.txt", content: "Validated rows: 18400" },
    ]) {
        const downloaded = page.waitForEvent("download");
        await timeline
            .getByRole("button", { name: `Download ${file.name}`, exact: true })
            .click();
        const download = await downloaded;
        expect(download.suggestedFilename()).toBe(file.name);
        expect(await download.failure()).toBeNull();
        const stream = await download.createReadStream();
        expect(stream).not.toBeNull();
        const chunks: Buffer[] = [];
        for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
        expect(Buffer.concat(chunks).toString("utf8")).toContain(file.content);
    }

    // The direct URL remains reachable after reload, with the existing mobile menu.
    await page.reload();
    await expect(timeline).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page
        .getByRole("button", { name: "Menü öffnen", exact: true })
        .click();
    const navigation = page.getByRole("dialog", {
        name: "Navigation",
        exact: true,
    });
    const mobileLink = navigation.getByRole("link", { name: /^Timeline/ });
    await expect(mobileLink).toHaveAttribute("aria-current", "page");
    await mobileLink.click();
    await expect(navigation).toHaveCount(0);
    await capture(page, "mobile");

    const actionBounds = await timeline
        .getByRole("button")
        .evaluateAll((buttons) =>
            buttons.map((button) => {
                const { left, right } = button.getBoundingClientRect();
                return { left, right };
            }),
        );
    for (const bounds of actionBounds) {
        expect(bounds.left).toBeGreaterThanOrEqual(0);
        expect(bounds.right).toBeLessThanOrEqual(390);
    }
    await page.evaluate(() => {
        document.documentElement.classList.add("dark");
        document.documentElement.style.colorScheme = "dark";
    });
    await capture(page, "mobile-dark");
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
});
