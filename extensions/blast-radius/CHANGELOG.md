# Changelog

## 1.0.0

- The blast radius of your uncommitted changes in Source Control: every file, test, route, page, component and config file that depends on what you changed, with a count on the view and in the status bar.
- A graph of the blast radius: changed files in the middle, one ring per import hop, hover to trace the path, click to open.
- Run only the affected tests: Vitest, Jest, Mocha, Playwright, `node --test` and pytest are detected, or set your own command.
- "Used by N files · blast radius M" at the top of every source file.
- Show the blast radius of any file from the Explorer or an editor tab.
- Deleted files still show every file that imported them.
- Copy a Markdown impact report for your pull request.
- JavaScript, TypeScript, Vue, Svelte, Astro and Python; `tsconfig`/`jsconfig` path aliases and `baseUrl`, including monorepos.
