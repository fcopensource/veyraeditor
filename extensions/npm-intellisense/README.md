# Veyra npm IntelliSense

**Autocomplete npm packages in your imports, catch missing ones before they break your build, and keep `package.json` tidy.**

A faster, smarter take on npm IntelliSense, by the makers of [Veyra Studio](https://veyraeditor.com). Free and open source.

```js
import { motion } from "fra|"        // framer-motion   ^11.2.0   dependency
import { useRouter } from "next/|"   // next/navigation, next/link, next/image…
import fs from "node:|"              // node:fs, node:path, node:crypto…
const express = require("ex|")       // express   ^4.21.0   dependency
```

## Features

### Package completions, with versions
Type inside the quotes of an `import`, `export … from`, `import()`, `require()`, `jest.mock()` or `vi.mock()` and pick from the packages in your `package.json`. Each suggestion shows its **version** and whether it is a dependency, dev dependency, peer or optional dependency. Your dependencies come first, then dev dependencies, then Node.js built-ins.

### Subpaths
After `package/`, see what the package actually exports: `next/navigation`, `@mui/material/Button`, `date-fns/locale`, read from the package's own `exports`. For packages without `exports`, browse their folders and files.

### Node.js built-ins
`fs`, `path`, `crypto`, `fs/promises` and every other built-in. If your file already writes `node:fs`, completions add `node:` too.

### Catch missing packages
Imports are checked as you type:

| Warning | What it means | Quick fix |
|---|---|---|
| **not installed and not in package.json** | The import will fail. | **Install it**, as a dependency or dev dependency |
| **not in package.json** | It works only because another package installed it, and can break when that package changes. | **Add it to package.json** |
| **in package.json but not installed** | Someone added it and you have not installed yet. | **Run install** |

Quick fixes use **your** package manager: npm, pnpm, yarn or bun, detected from the lockfile or the `packageManager` field.

### Package details on hover
Hover an import to see the installed version, the version in `package.json`, the description, licence, number of dependencies, whether types are included, links to npm, the homepage and repository, and the **latest version on npm**.

### Find unused dependencies
Run **Veyra npm: Find Unused Dependencies** (or right-click a `package.json`) to list dependencies no file imports. Build tools, `@types` packages, ESLint and Prettier plugins and anything used in your `scripts` are skipped. Select the ones to remove and uninstall them in one step.

### Add import
**Veyra npm: Add Import from Package** picks a package, then writes the import where your imports are, as a default, named, namespace or side-effect import. It writes `require()` in CommonJS files and finds a good name, like `reactQuery` for `@tanstack/react-query`.

### Works with your setup
- **Monorepos and workspaces:** the nearest `package.json` first, then the workspace root.
- **Aliases** are not mistaken for packages: `@/`, `~/`, `#imports`, tsconfig and jsconfig `paths`, SvelteKit `$app` and `$lib`, Astro, Vite `virtual:` modules, and your own `veyraNpm.ignore` list.
- **JavaScript, TypeScript, JSX, TSX, Vue, Svelte and Astro.** In `.vue`, `.svelte` and `.astro` files only the script is checked.
- **Yarn Plug'n'Play** projects, which have no `node_modules`.

## Commands

| Command | |
|---|---|
| Veyra npm: Add Import from Package… | Pick a package and add an import for it |
| Veyra npm: Install Package… | Install packages with your package manager |
| Veyra npm: Install All Dependencies | Run install for the current package |
| Veyra npm: Find Unused Dependencies | List and remove dependencies nothing imports |

## Settings

| Setting | Default | |
|---|---|---|
| `veyraNpm.checkImports` | `true` | Warn about missing or uninstalled packages |
| `veyraNpm.builtins` | `true` | Suggest Node.js built-in modules |
| `veyraNpm.nodeProtocol` | `auto` | Write `node:fs` always, never, or when the file already does |
| `veyraNpm.importStyle` | `auto` | What Add Import writes: `import`, `require` or matching the file |
| `veyraNpm.latestVersion` | `true` | Show the latest npm version on hover (the only network request; turn off to stay offline) |
| `veyraNpm.ignore` | `[]` | Extra import prefixes that are not npm packages |

## Privacy

Everything runs on your computer from your `package.json` and `node_modules`. The only network request is the optional latest-version lookup on hover, sent to the public npm registry with just the package name. No telemetry.

In Restricted Mode, completions and hovers work and installing is turned off.

## More from Veyra

- [Veyra Live Server](https://marketplace.visualstudio.com/items?itemName=flightcoders.veyra-live-server): a local server with live reload.
- [Veyra Port Manager](https://marketplace.visualstudio.com/items?itemName=flightcoders.veyra-port-manager): see and free the ports your dev servers use.
- [Veyra Studio](https://veyraeditor.com): a fast, free code editor with AI built in.
