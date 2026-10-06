import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", timeout: 45000, workers: 1,
  // The specs use macOS shortcuts (Meta+S, Meta+Z); a Mac user agent makes Monaco and Veyra bind them on any host.
  use: { baseURL: "http://localhost:1427", viewport: { width: 1360, height: 850 }, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36" },
  webServer: { command: "npm run dev -- --port 1427", url: "http://localhost:1427", reuseExistingServer: false, timeout: 60000 },
});
