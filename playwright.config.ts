import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", timeout: 45000, workers: 1,
  use: { baseURL: "http://localhost:1427", viewport: { width: 1360, height: 850 } },
  webServer: { command: "npm run dev -- --port 1427", url: "http://localhost:1427", reuseExistingServer: false, timeout: 60000 },
});
