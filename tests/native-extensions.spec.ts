import { test, expect, type Page } from "@playwright/test";

// Veyra's own extensions, built in: Error Lens, Auto Rename Tag, Path IntelliSense, npm IntelliSense, Todo Tree, Git Graph.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const files: Record<string, string> = {
      "package.json": JSON.stringify({ name: "demo", dependencies: { react: "^18.3.1" }, devDependencies: { vitest: "^2.0.0" } }, null, 2),
      "index.html": "<div>hello</div>\n",
      "src/main.ts": "import React from \"react\";\nimport lodash from \"lodash\";\nexport const n: number = \"text\";\n",
      "src/util.ts": "export const one = 1; // TODO: two\n",
      "src/styles/site.css": "body { margin: 0 }\n",
    };
    const calls: { cmd: string; args: Record<string, unknown> }[] = [];
    Object.assign(window, { testFiles: files, testCalls: calls, __TAURI_INTERNALS__: {
      transformCallback: () => 1, unregisterCallback: () => {},
      invoke: async (cmd: string, args: Record<string, any> = {}) => {
        calls.push({ cmd, args });
        if (cmd === "choose_folder") return "/work/demo";
        if (cmd === "list_directory") {
          const path = args.path || "", names = Object.keys(files);
          const children = new Map<string, boolean>();
          for (const name of names) {
            if (path && !name.startsWith(path + "/")) continue;
            const rest = path ? name.slice(path.length + 1) : name, slash = rest.indexOf("/");
            children.set(slash < 0 ? rest : rest.slice(0, slash), slash >= 0);
          }
          return [...children].map(([name, directory]) => ({ path: path ? path + "/" + name : name, name, directory }));
        }
        if (cmd === "project_files") return Object.keys(files);
        if (cmd === "read_file") { if (!(args.path in files)) throw "Not found"; return files[args.path]; }
        if (cmd === "search_workspace") return Object.entries(files).flatMap(([path, text]) => text.split("\n").flatMap((line, i) => /\bTODO\b/.test(line) ? [{ path, line: i + 1, column: line.indexOf("TODO") + 1, text: line, start: 0, end: 4 }] : []));
        if (cmd === "git_status") return "## main\n";
        if (cmd === "git_graph") return "abc1234\t\t (HEAD -> main)\tVeyra\tnow\tFirst commit";
        if (cmd === "git_log") return "abc1234\tVeyra\tnow\tFirst commit";
        if (cmd === "plugin:event|listen") return 1;
        return null;
      },
    }, __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} } });
  });
});

async function openProject(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Open a project", exact: false }).click();
  await expect(page.locator('.tree-row[title="src"]')).toBeVisible();
}
async function openFile(page: Page, path: string) {
  const parts = path.split("/");
  for (let i = 1; i < parts.length; i++) {
    const folder = page.locator(`.tree-row[title="${parts.slice(0, i).join("/")}"]`);
    if (!(await page.locator(`.tree-row[title="${parts.slice(0, i + 1).join("/")}"]`).count())) await folder.click();
  }
  await page.locator(`.tree-row[title="${path}"]`).click();
  await expect(page.getByRole("tab", { name: parts.at(-1) })).toBeVisible();
  await page.locator(".monaco-editor textarea").first().focus();
}

test("Extensions lists Veyra's own extensions as built in, on by default, and they can be switched off", async ({ page }) => {
  await openProject(page);
  await page.getByRole("button", { name: "Extensions", exact: true }).first().click();
  for (const name of ["Error Lens Veyra", "Auto Rename Tag Veyra", "Path IntelliSense Veyra", "Veyra npm IntelliSense", "Todo Tree Veyra", "Git Graph Veyra"])
    await expect(page.locator(".ext-row", { hasText: name }).first()).toContainText("On");
  await page.getByRole("button", { name: "Turn off Error Lens Veyra", exact: true }).click();
  await expect(page.locator(".ext-row", { hasText: "Error Lens Veyra" }).first()).toContainText("Off");
  expect(await page.evaluate(() => localStorage.getItem("veyra.native.disabled"))).toContain("error-lens");
  await page.getByRole("button", { name: "Turn on Error Lens Veyra", exact: true }).click();
  await expect(page.locator(".ext-row", { hasText: "Error Lens Veyra" }).first()).toContainText("On");
  await page.screenshot({ path: "test-results/native-extensions.png" });
});

test("Error Lens shows problems at the end of their line, and npm IntelliSense flags undeclared packages", async ({ page }) => {
  await openProject(page);
  await openFile(page, "src/main.ts");
  // One message per line with a problem, the most severe first: line 2 has TypeScript's error plus npm IntelliSense's warning (hints are left out, as in the VS Code extension).
  await expect(page.locator(".veyra-lens-text")).toHaveCount(3, { timeout: 15000 });
  await expect(page.locator(".veyra-lens-line.lens-error")).toHaveCount(3);
  // The message is drawn by CSS (::after), the way VS Code draws extension decorations.
  const messages = async () => page.locator(".veyra-lens-text").evaluateAll(spans => spans.map(span => getComputedStyle(span, "::after").content));
  await expect.poll(messages).toEqual(expect.arrayContaining([expect.stringContaining("Type 'string' is not assignable to type 'number'")]));
  await expect.poll(messages).toEqual(expect.arrayContaining([expect.stringContaining("lodash' or its corresponding type declarations.  (+1 more)")]));
  // npm IntelliSense: lodash isn't in package.json; react is.
  await page.getByRole("button", { name: "Problems", exact: true }).click();
  await expect(page.locator(".problems-panel")).toContainText("'lodash' isn't in package.json");
  await expect(page.locator(".problems-panel")).not.toContainText("'react' isn't in package.json");
  await page.screenshot({ path: "test-results/error-lens.png" });
});

test("npm IntelliSense completes packages and Node built-ins; Path IntelliSense completes files", async ({ page }) => {
  await openProject(page);
  await openFile(page, "src/util.ts");
  await page.keyboard.press("Meta+End");
  await page.keyboard.type('\nimport x from "re');
  await expect(page.locator(".suggest-widget .monaco-list-row", { hasText: "react" }).first()).toBeVisible({ timeout: 10000 });
  await page.keyboard.press("Escape");
  await page.keyboard.type('\nimport fs from "node:f');
  await page.keyboard.press("Control+Space");
  await expect(page.locator(".suggest-widget .monaco-list-row", { hasText: "node:fs" }).first()).toBeVisible({ timeout: 10000 });
  await page.keyboard.press("Escape");
  await page.keyboard.type('\nimport y from "./');
  await expect(page.locator(".suggest-widget .monaco-list-row", { hasText: "styles/" }).first()).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".suggest-widget .monaco-list-row", { hasText: "main" }).first()).toBeVisible();
  await page.screenshot({ path: "test-results/path-intellisense.png" });
});

test("Auto Rename Tag renames the closing tag with the opening tag", async ({ page }) => {
  await openProject(page);
  await openFile(page, "index.html");
  await page.keyboard.press("Meta+Home");
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight"); // after "<div"
  await page.keyboard.press("Backspace"); await page.keyboard.press("Backspace"); await page.keyboard.press("Backspace");
  await page.keyboard.type("section");
  await expect(page.locator(".view-lines")).toContainText("<section>hello</section>");
});

test("Todo Tree and Git Graph open their Veyra windows", async ({ page }) => {
  await openProject(page);
  await page.getByRole("button", { name: "Extensions", exact: true }).first().click();
  await page.getByRole("button", { name: "Open Todo Tree Veyra", exact: true }).click();
  await expect(page.locator(".todo-panel .todo-hit")).toHaveCount(1);
  await page.getByRole("button", { name: "Extensions", exact: true }).first().click();
  await page.getByRole("button", { name: "Open Git Graph Veyra", exact: true }).click();
  await expect(page.getByText("First commit").first()).toBeVisible();
});
