import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: ["*.spec.mjs"],
  timeout: 60_000,
  expect: { timeout: 12_000 },
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "tests/e2e/report", open: "never" }]],
  outputDir: "tests/e2e/test-results",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:3000",
    locale: "zh-TW",
    timezoneId: "Asia/Taipei",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1",
    url: "http://127.0.0.1:3000/lab",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      MOVIE_DB_API_KEY: "",
      WATCHPILOT_ENABLE_JEV: "0",
      TYPESAFE_API_KEY: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
