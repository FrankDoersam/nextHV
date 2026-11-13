import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
    testDir: "tests/e2e",
    fullyParallel: false,
    workers: 1,
    use: {
        baseURL: process.env.E2E_URL ?? "http://127.0.0.1:8000",
        ...devices["Desktop Chrome"],
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
    },
    webServer: {
        command: "php artisan serve --host=127.0.0.1 --port=8000",
        url: "http://127.0.0.1:8000/up",
        reuseExistingServer: !process.env.CI,
    },
    reporter: "list",
});
