import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: ".", testMatch: ["vinext-preview.spec.mjs"],
  workers:1, retries:0,timeout:60000,expect:{timeout:15000},
  reporter:[["list"]],
  outputDir:"test-results",
  use:{...devices["Desktop Chrome"],baseURL:"http://127.0.0.1:3001",locale:"zh-TW",timezoneId:"Asia/Taipei",
    screenshot:"only-on-failure",trace:"retain-on-failure"},
  webServer:{
    command:"npm run start:vinext -- --host 127.0.0.1 --port 3001",
    url:"http://127.0.0.1:3001/lab",
    timeout:150000,reuseExistingServer:!process.env.CI,
    env:{MOVIE_DB_API_KEY:"",TYPESAFE_API_KEY:"",WATCHPILOT_ENABLE_JEV:"0",
      NEXT_TELEMETRY_DISABLED:"1"}
  },
});
