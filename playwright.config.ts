import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir:"./tests", timeout:45000, workers:1,
  use:{baseURL:"http://localhost:1420",viewport:{width:1360,height:850}},
  webServer:{command:"npm run dev",url:"http://localhost:1420",reuseExistingServer:true,timeout:60000},
});
