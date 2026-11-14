import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
    ...base,
    testMatch: "screenshots.spec.ts",
    testIgnore: [],
    timeout: 240_000,
    use: {
        ...base.use,
        actionTimeout: 15_000,
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 1,
        locale: "de-DE",
        timezoneId: "Europe/Berlin",
        colorScheme: "light",
        reducedMotion: "reduce",
    },
});
