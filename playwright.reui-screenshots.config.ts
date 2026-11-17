import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
    ...base,
    testMatch: "reui-demo-screenshots.spec.ts",
    testIgnore: [],
    timeout: 180_000,
    use: {
        ...base.use,
        viewport: { width: 1600, height: 1200 },
        deviceScaleFactor: 1,
        locale: "de-DE",
        timezoneId: "Europe/Berlin",
        colorScheme: "light",
        reducedMotion: "reduce",
        actionTimeout: 20_000,
    },
});