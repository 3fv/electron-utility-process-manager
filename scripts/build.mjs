#!/usr/bin/env node

import Sh from "shelljs"
import { $, argv, echo, fs as Fs, path as Path } from "zx"

$.verbose = true

const scriptDir = import.meta.dirname
const rootDir = Path.resolve(scriptDir, "..")
const libDir = Path.join(rootDir, "lib")
const libExamplesDir = Path.join(rootDir, "lib-examples-cjs")

Sh.rm("-rf", libDir, libExamplesDir)

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

const tscArgs = ["-b", "tsconfig.json", ...rawArgv, "--preserveWatchOutput"]

// echo`Building with args: ${tscArgs.join(" ")}`
run("tsc", ...tscArgs)

echo`${libDir} successfully built`

