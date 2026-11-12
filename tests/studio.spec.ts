import { test, expect } from "@playwright/test";

// Android Studio-style productivity: Recent Projects, Search Everywhere (double Shift), Recent Files (Ctrl/Cmd+E), TODO tool window.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const projects: Record<string, Record<string, string>> = {
      "/work/studio-project": {
        "src/App.tsx": "// TODO: split this component\nexport const app = 1;\n",
        "src/api.ts": "export const api = 2; // FIXME handle timeouts\n// HACK: retry twice\n",
        "README.md": "# Example\n",
      },
      "/work/notes": { "ideas.md": "# Ideas\n" },
    };
    let root = "";
    const calls: { cmd: string; args: Record<string, unknown> }[] = [];
    if (!localStorage.getItem("veyra.recentProjects")) localStorage.setItem("veyra.recentProjects", JSON.stringify([
      { path: "/work/notes", name: "notes", opened: Date.now() - 3 * 3600_000 },
      { path: "/work/gone", name: "gone", opened: Date.now() - 2 * 86400_000 },
    ]));
    const files = () => projects[root] || {};
    Object.assign(window, { testCalls: calls, __TAURI_INTERNALS__: {
      transformCallback: () => 1, unregisterCallback: () => {},
      invoke: async (cmd: string, args: Record<string, any> = {}) => {
        calls.push({ cmd, args });
        if (cmd === "choose_folder") { root = "/work/studio-project"; return root; }
        if (cmd === "open_folder") { if (!projects[args.path]) throw args.path + " no longer exists"; root = args.path; return root; }
        if (cmd === "list_directory") {
          const path = args.path || "";
          const names = Object.keys(files());
          const dirs = [...new Set(names.filter(n => n.includes("/")).map(n => n.split("/")[0]))];
          if (path) return names.filter(n => n.startsWith(path + "/")).map(n => ({ path: n, name: n.split("/").at(-1)!, directory: false }));
          return [...dirs.map(d => ({ path: d, name: d, directory: true })), ...names.filter(n => !n.includes("/")).map(n => ({ path: n, name: n, directory: false }))];
        }
        if (cmd === "project_files") return Object.keys(files());
        if (cmd === "read_file") return files()[args.path] ?? "";
        if (cmd === "search_workspace") {
          const re = args.options?.regex ? new RegExp(args.query, args.options.caseSensitive ? "" : "i") : null;
          return Object.entries(files()).flatMap(([path, text]) => text.split("\n").flatMap((line, i) => {
            const at = re ? line.search(re) : line.indexOf(args.query);
            return at >= 0 ? [{ path, line: i + 1, column: at + 1, text: line, start: at, end: at + 4 }] : [];
          }));
        }
        if (cmd === "git_status") return "## main\n";
        if (cmd === "plugin:event|listen") return 1;
        return null;
      },
    }, __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} } });
  });
});

test("recent projects reopen in one click and forget folders that are gone", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => { if (e.message !== "Canceled") errors.push(e.message); });
  await page.goto("/");
  const recent = page.locator(".welcome-projects");
  await expect(recent).toContainText("RECENT PROJECTS");
  await expect(recent.locator(".welcome-project")).toHaveCount(2);
  await expect(recent).toContainText("3 h ago");
  await page.screenshot({ path: "test-results/studio-welcome.png" });

  // A folder that no longer exists is dropped from the list
  await recent.getByRole("button", { name: /gone/ }).first().click();
  await expect(recent.locator(".welcome-project")).toHaveCount(1);

  // One click reopens a project without the folder dialog
  await recent.getByRole("button", { name: /notes/ }).first().click();
  await expect(page.locator('.tree-row[title="ideas.md"]')).toBeVisible();
  const calls = await page.evaluate(() => (window as any).testCalls.map((c: any) => c.cmd));
  expect(calls).toContain("open_folder");
  expect(calls).not.toContain("choose_folder");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("veyra.recentProjects") || "[]"));
  expect(stored[0].path).toBe("/work/notes");
  expect(stored.map((p: any) => p.path)).not.toContain("/work/gone");
  expect(errors).toEqual([]);
});

test("double Shift searches everywhere, Ctrl+E lists recent files", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open a project", exact: false }).click();
  await expect(page.locator('.tree-row[title="README.md"]')).toBeVisible();

  await page.keyboard.press("Shift"); await page.keyboard.press("Shift");
  await expect(page.locator(".palette-label")).toHaveText("SEARCH EVERYWHERE");
  const input = page.getByRole("textbox", { name: "Search commands or files" });
  await input.fill("api");
  await expect(page.locator(".palette-group").first()).toHaveText("files");
  await expect(page.locator(".palette-row").first()).toContainText("api.ts");
  await input.fill("toggle sidebar");
  await expect(page.locator(".palette-group")).toContainText(["actions"]);
  await page.keyboard.press("Enter");
  await expect(page.locator(".palette")).toHaveCount(0);
  await page.keyboard.press("Meta+b");

  // Shift, then a letter, then Shift is typing, not a double tap
  await page.keyboard.press("Shift"); await page.keyboard.press("a"); await page.keyboard.press("Shift");
  await expect(page.locator(".palette")).toHaveCount(0);

  await page.locator('.tree-row[title="README.md"]').click();
  await page.locator('.tree-row[title="src"]').click();
  await page.locator('.tree-row[title="src/api.ts"]').click();
  await page.keyboard.press("Meta+e");
  await expect(page.locator(".palette-label")).toHaveText("RECENT FILES");
  await expect(page.locator(".palette-row")).toHaveCount(2);
  await expect(page.locator(".palette-row").first()).toContainText("api.ts");
  await page.screenshot({ path: "test-results/studio-recent-files.png" });
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
  await expect(page.getByRole("tab", { name: "README.md" })).toHaveAttribute("aria-selected", "true");
});

test("TODO tool window groups comments by file and jumps to them", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open a project", exact: false }).click();
  await page.keyboard.press("Meta+Shift+p");
  await page.getByRole("textbox", { name: "Search commands or files" }).fill(">show todo");
  await page.keyboard.press("Enter");
  const panel = page.locator(".todo-panel");
  await expect(panel.locator(".todo-hit")).toHaveCount(3);
  await expect(panel.locator(".todo-file")).toHaveCount(2);
  await expect(page.locator(".bottom-tabs")).toContainText("TODO 3");
  await expect(panel.locator(".todo-hit em").first()).toHaveText("TODO");
  await expect(panel).toContainText("split this component");
  await page.screenshot({ path: "test-results/studio-todo.png" });
  await panel.getByRole("button", { name: "FIXME 1" }).click();
  await expect(panel.locator(".todo-hit")).toHaveCount(1);
  await panel.locator(".todo-hit").click();
  await expect(page.getByRole("tab", { name: "api.ts" })).toBeVisible();
});

test("no AI anywhere: no AI button, panel, shortcuts or commands", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /AI assistant|Veyra AI/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Open a project", exact: false }).click();
  await page.keyboard.press("Meta+l"); await page.keyboard.press("Meta+k");
  await expect(page.locator(".ai-panel, .ai-studio, [aria-label*='AI']")).toHaveCount(0);
  await page.keyboard.press("Meta+Shift+p");
  await page.getByRole("textbox", { name: "Search commands or files" }).fill(">AI");
  await expect(page.locator(".palette-row", { hasText: /\bAI\b/ })).toHaveCount(0);
  const calls = await page.evaluate(() => (window as any).testCalls.map((c: any) => c.cmd));
  expect(calls.filter((c: string) => c.startsWith("ai_"))).toEqual([]);
});

test("Support Veyra opens from the title bar, the Welcome page and the palette", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Support Veyra", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Support Veyra Studio" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".support-option")).toHaveCount(2);
  await expect(dialog).toContainText("Buy me a coffee");
  await expect(dialog).toContainText("Support with a card");
  await expect(dialog).toContainText("never sees your card details");
  await page.screenshot({ path: "test-results/support.png" });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.locator(".welcome-support").click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await page.keyboard.press("Meta+Shift+p");
  await page.getByRole("textbox", { name: "Search commands or files" }).fill(">support");
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
});
