import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.e2e.ts",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    launchOptions: { executablePath: process.env.CHROME_PATH },
  },
  reporter: [
    ["list"],
    ["json", { outputFile: "../docs/evidence/browser-tests.json" }],
  ],
});
