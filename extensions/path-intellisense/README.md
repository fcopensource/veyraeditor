<p align="center">
  <img src="https://raw.githubusercontent.com/fcopensource/veyraeditor/main/extensions/path-intellisense/media/readme/hero.png" alt="Path IntelliSense Veyra: completing @/assets/ with folders, images with their size, and a preview of logo.png" width="100%">
</p>

# Path IntelliSense Veyra

**File paths, completed as you type.**

Start a path with `./`, `../`, `/` or one of your aliases, and Path IntelliSense Veyra lists the folders and files that are really there. It works in imports, `require()`, HTML `src` and `href`, CSS `url()` and `@import`, and Markdown links. It also tells you when a path points to a file that doesn't exist. **Free, no setup.** By the makers of [Veyra Studio](https://veyraeditor.com).

- 📁 **Paths everywhere:** JavaScript, TypeScript, JSX, Vue, Svelte, Astro, HTML, CSS, SCSS, Less, Markdown, and any string that starts like a path.
- 🔗 **Aliases with no setup:** `@/components/…` from `tsconfig.json` or `jsconfig.json` `paths` (including `extends`), and `#utils/…` from package.json `imports`.
- ✍️ **Imports written the way your project needs:** no extension for bundlers, `.js` for Node ESM, folders instead of `/index`.
- ⚠️ **Broken paths flagged:** *Can't find "./utils/fromat". Did you mean "./utils/format"?*, with a one-click fix.
- 🖼️ **Image previews and file sizes** right in the suggestion list.

---

## Every path, one keystroke away

<img src="https://raw.githubusercontent.com/fcopensource/veyraeditor/main/extensions/path-intellisense/media/readme/completion.png" alt="Typing @/assets/ in a TSX file: folders icons and fonts first, then logo.png and hero.webp with their sizes, and a preview of the selected image" width="100%">

- Folders come first. Choosing one adds `/` and shows what's inside straight away.
- Aliases are resolved, and the list says where an alias points (`@/* → src`).
- In HTML, CSS and Markdown, `img/logo.png` works as well as `./img/logo.png`. Paths starting with `/` look in your workspace and in `public/` or `static/`, like Vite, Next.js and most site tools serve them.
- Hidden files stay hidden until you type a `.`, and `node_modules` is left out unless you type it.
- Package names (`react`, `lodash/fp`) are left to package completion, such as [Veyra npm IntelliSense](https://veyraeditor.com/npm-intellisense).
- VS Code's own TypeScript support also suggests import paths, so you'd see each file twice. The first time it matters, Path IntelliSense Veyra offers to turn those off (`typescript.suggest.paths` and `javascript.suggest.paths`). It only changes them if you say yes.

## Imports written the way your project needs

<img src="https://raw.githubusercontent.com/fcopensource/veyraeditor/main/extensions/path-intellisense/media/readme/style.png" alt="Side by side: a bundler project importing ./components/Header without an extension, and a Node ESM project importing ./db.js" width="100%">

Path IntelliSense Veyra reads your `tsconfig.json` (or `jsconfig.json` and `package.json`):

| Your project | Inserted |
|---|---|
| A bundler (Vite, Next.js, webpack), or `moduleResolution: "bundler"` / `"node"` | `./components/Header` |
| Node ESM: `moduleResolution: "node16"` or `"nodenext"` | `./db.js` for `db.ts`, which is what Node loads after compiling |
| Plain JavaScript with `"type": "module"` | `./util.js` |
| `allowImportingTsExtensions` | `./App.tsx` |

Set `veyraPath.importExtension` to `always` or `never` to choose yourself.

## Typos caught before you run

<img src="https://raw.githubusercontent.com/fcopensource/veyraeditor/main/extensions/path-intellisense/media/readme/broken.png" alt="./utils/fromat underlined, with the message: Can't find ./utils/fromat. Did you mean ./utils/format?, and the quick fix Change to ./utils/format" width="100%">

Paths that don't exist are underlined, and **Ctrl+.** changes them to the closest match. The check is careful not to cry wolf:

- Imports are resolved like TypeScript does: with each extension, a folder's `index` file, and `./db.js` finding `db.ts`.
- In HTML and Markdown, only paths to **files** are checked (`./styles/main.css`). Links to pages like `href="/about"` are routes, not files, so they're left alone.
- URLs, `#anchors`, template expressions, package names and paths you're still typing (ending in `/`) are never flagged.
- Create the missing file and the warning goes away by itself.

## Settings

| Setting | Default | |
|---|---|---|
| `veyraPath.importExtension` | `auto` | `auto` follows your project; `always` or `never` |
| `veyraPath.checkPaths` | `true` | Warn about paths that don't exist |
| `veyraPath.mappings` | `{}` | Extra aliases, like `{ "@": "${workspaceFolder}/src" }` |
| `veyraPath.absolutePathTo` | `""` | The folder `/` paths start from. Empty: the workspace, `public/` and `static/` |
| `veyraPath.showHiddenFiles` | `false` | Show files starting with a dot |
| `veyraPath.respectFilesExclude` | `true` | Leave out files hidden by `files.exclude` |
| `veyraPath.slashAfterFolder` | `true` | Add `/` after a folder and show its contents |

## Good to know

- Works in local, remote (SSH, WSL, containers) and virtual workspaces.
- No account, no telemetry, nothing sent anywhere.
- Path IntelliSense Veyra is an independent extension, written from scratch. It's inspired by the classic Path Intellisense extension.
- Requires VS Code 1.85 or newer.

## More from Veyra

- [Veyra npm IntelliSense](https://veyraeditor.com/npm-intellisense): autocomplete for package imports.
- [Veyra Env](https://veyraeditor.com/env): `.env` files checked, hidden on screen and kept out of git.
- [Veyra Query Lens](https://veyraeditor.com/mongodb): see how every MongoDB query performs.
- [Veyra Studio](https://veyraeditor.com): a fast, free code editor.

Found a bug or have an idea? [Open an issue](https://github.com/fcopensource/veyraeditor/issues). MIT licensed.
