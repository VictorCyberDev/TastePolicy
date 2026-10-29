import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.PW_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    launchOptions: process.env.PW_CHROMIUM
      ? { executablePath: process.env.PW_CHROMIUM, args: ["--no-sandbox"] }
      : undefined,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  // PW_BASE_URL points the suite at an already-running server (local dev loop).
  webServer: process.env.PW_BASE_URL
    ? undefined
    : {
        env: {
          QLOO_API_KEY: "",
          QLOO_API_BASE_URL: "",
          QLOO_AFFINITY_SCALE: "",
        },
        command: "npm run start -- --hostname 127.0.0.1",
        url: "http://127.0.0.1:3000/api/health",
        reuseExistingServer: false,
        timeout: 60000,
      },
});
