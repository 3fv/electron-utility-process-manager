#!/usr/bin/env node

import { $, argv, fs as Fs, path as Path, echo, usePwsh, which, os, useBash } from "zx"
import Sh from "shelljs"
import Os from "os"
import { readdirSync, readFileSync, writeFileSync, existsSync } from "fs"
import { join, dirname } from "path"

$.verbose = true
const isLinux = /Linux/.test(Os.type())
const isMac = /Darwin/.test(Os.type())
const isWindows = /Win/.test(Os.type())
if (isWindows)
    usePwsh()
else
    useBash()

const scriptDir = import.meta.dirname
const rootDir = Path.resolve(scriptDir, "..")
const libDir = Path.join(rootDir, "lib")
const cjsDir = Path.join(libDir, "cjs")
const mjsDir = Path.join(libDir, "mjs")
const cjsJsonFile = Path.join(cjsDir, "package.json")
const mjsJsonFile = Path.join(mjsDir, "package.json")

const rawArgv = process.argv.slice(2)

echo(`Working directory '${process.cwd()}'`)
console.log(`process.argv: `, rawArgv)
console.log(`argv: `, argv)

const die = (msg, exitCode = 1, err = null) => {
    if (err) {
        if (typeof err.printStackTrace === "function")
            err.printStackTrace()
        else
            err.toString()
    }

    echo`ERROR: ${msg}`
    process.exit(exitCode)
}

const run = (...args) => $`${args}`
    .catch(err => die(`An error occurred while executing: ${args.join(' ')}: ${err.message}`, 1, err))

Sh.mkdir("-p", mjsDir, cjsDir)

Fs.outputFileSync(cjsJsonFile, '{"type":"commonjs"}\n', { encoding: 'utf-8' })
Fs.outputFileSync(mjsJsonFile, '{"type":"module"}\n', { encoding: 'utf-8' })

const tscArgs = ["-b", "tsconfig.json", ...rawArgv, "--preserveWatchOutput"]

echo`Building with args: ${tscArgs.join(' ')}`
await run("tsc", ...tscArgs)

// Fix ESM imports — add .js extensions for Node.js native ESM resolution
function fixImports(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      fixImports(fullPath)
      continue
    }
    if (!entry.name.endsWith(".js") && !entry.name.endsWith(".d.ts")) continue
    if (entry.name.endsWith(".d.ts.map")) continue

    let content = readFileSync(fullPath, "utf8")
    let changed = false

    content = content.replace(
      /((?:from|import)\s*\(?\s*["'])(\.\.?\/[^"']*)(["'])/g,
      (match, pre, spec, suf) => {
        if (
          /\.\w+$/.test(spec) &&
          (spec.endsWith(".js") ||
            spec.endsWith(".mjs") ||
            spec.endsWith(".cjs") ||
            spec.endsWith(".json"))
        ) {
          return match
        }
        const base = dirname(fullPath)
        if (existsSync(join(base, spec, "index.js"))) {
          changed = true
          return `${pre}${spec}/index.js${suf}`
        }
        if (existsSync(join(base, spec + ".js"))) {
          changed = true
          return `${pre}${spec}.js${suf}`
        }
        return match
      }
    )

    if (changed) writeFileSync(fullPath, content)
  }
}

if (existsSync(mjsDir) && !rawArgv.includes("--watch") && !rawArgv.includes("-w")) {
  fixImports(mjsDir)
  echo`Fixed ESM imports`
}

echo`${libDir} successfully built`
