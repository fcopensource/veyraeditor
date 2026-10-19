# Changelog

## 1.0.0

First release.

- Completes npm package names in `import`, `export … from`, `import()`, `require()`, `jest.mock` and `vi.mock`, with each package's version and dependency type.
- Completes subpaths such as `next/navigation` from the package's own `exports`, or its folders when it has none.
- Completes Node.js built-ins, adding `node:` when the file already uses it.
- Monorepos: the nearest package.json first, then the workspace root.
- Warns about imports of packages that are not in package.json, that only work because another package installed them, or that are in package.json but not installed, with one-click install using npm, pnpm, yarn or bun.
- Hover an import to see the installed version, description, licence, links and the latest version on npm.
- Find Unused Dependencies, Add Import from Package, Install Package and Install All Dependencies commands.
- Understands `@/`, `~/`, `#` imports, tsconfig `paths`, SvelteKit, Astro and Vite virtual modules, and Vue, Svelte and Astro files.
