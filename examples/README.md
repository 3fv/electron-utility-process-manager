# `@3fv/electron-utility-process-manager` examples

Two Electron applications that use the library from the `main`, `renderer` and
utility (`node`) processes. This package is private: it is a member of the
repository's pnpm workspace and is never published.

- [`simple`](simple): the bare-bones approach, with as little typing as possible
- [`complex`](complex): the same flow, fully typed

Each example has a `<name>-main.ts` (main process), `<name>-node.ts` (utility
process) and `<name>-renderer.ts` + `.html` (renderer).

## Commands

Run these from the repository root, after `pnpm install`:

| Command                                     | What it does                                              |
| ------------------------------------------- | --------------------------------------------------------- |
| `pnpm build`                                | Builds the library, which the examples compile against    |
| `pnpm build:examples`                       | Compiles this package (`tsc -b`) to `lib-examples/`       |
| `pnpm example --example=<simple\|complex>`    | Runs the built example in Electron (`--break` to pause)   |

The library is a `workspace:*` dependency, so at run time the examples load it
by its package name from `node_modules`. `tsconfig.json` maps the same names to
the library's `lib/cjs` build for type checking. Compiled output goes to
`lib-examples/`, which is not tracked.

See the [repository README](../README.md) for the library itself.
