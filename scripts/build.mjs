#!/usr/bin/env node

import { $, argv, fs as Fs, path as Path, echo, usePwsh, which } from "zx"
// import Path from "path"
// import Fs from "fs"
import Sh from "shelljs"

$.verbose = true
//usePwsh()

const scriptDir = import.meta.dirname
const rootDir = Path.resolve(scriptDir, "..")
const libDir = Path.join(rootDir, "lib")
const libExamplesDir = Path.join(rootDir, "lib-examples-cjs")
const cjsDir = Path.join(libDir, "cjs")
const mjsDir = Path.join(libDir, "mjs")

Sh.rm("-rf", libDir, libExamplesDir)

const cjsJsonFile = Path.join(cjsDir, "package.json")
const mjsJsonFile = Path.join(mjsDir, "package.json")

const rawArgv = process.argv.slice(2)

echo(`Working directory '${process.cwd()}'`)
console.log(`process.argv: `, rawArgv)
console.log(`argv: `, argv)

const die = (msg, exitCode = 1, err = null) => {
  if (err) {
    if (typeof err.printStackTrace === "function") {
      err.printStackTrace()
    } else {
      err.toString()
    }
  }
  
  echo`ERROR: ${msg}`
  process.exit(exitCode)
}

const run = (...args) => {
  echo`Running: ${args.join(" ")}`
  return $`${args}`.catch((err) =>
    die(
      `An error occurred while executing: ${args.join(" ")}: ${err.message}`,
      1,
      err
    )
  )
}

Sh.mkdir("-p", mjsDir, cjsDir)

const cjsJson = `{
    "type": "commonjs",
    "main": "./index.js",
    "module": "./index.js"
}`, mjsJson = `{
    "type": "module",
    "main": "./index.js",
    "module": "./index.js"
}`

// "exports": {
//   ".": {
//     "types": "./index.d.ts",
//       "default": "./index.js"
//   },
//   "./appenders/FileAppender.js": {
//     "types": "./appenders/FileAppender.d.ts",
//       "default": "./appenders/FileAppender.js"
//   }
// }

Fs.outputFileSync(cjsJsonFile, cjsJson, { encoding: "utf-8" })
Fs.outputFileSync(mjsJsonFile, mjsJson, { encoding: "utf-8" })

const tscArgs = ["-b", "tsconfig.json", ...rawArgv, "--preserveWatchOutput"]

// echo`Building with args: ${tscArgs.join(" ")}`
run("tsc", ...tscArgs)

echo`${libDir} successfully built`
