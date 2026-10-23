# Changelog

## 1.0.0

First release.

- File path completions in imports, require(), HTML src and href, CSS url() and @import, Markdown links, and other path-like strings.
- Aliases from tsconfig.json and jsconfig.json paths (following extends), package.json imports, and the veyraPath.mappings setting.
- Imports written the way the project needs: no extension for bundlers, .js for Node ESM.
- Warnings for paths that don't exist, with the closest match as a quick fix.
- Image previews and file sizes in the suggestion list.
