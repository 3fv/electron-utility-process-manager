#!/usr/bin/env node

import assert from "node:assert"
import { $, argv, fs as Fs, path as Path, echo, usePwsh, which } from "zx"
// import Path from "path"
// import Fs from "fs"
import Sh from "shelljs"

import ElectronMon from "electronmon"
import { assertFatal } from "./common/process-util.mjs"

$.verbose = true

const scriptDir = import.meta.dirname
const rootDir = Path.resolve(scriptDir, "..")
const libDir = Path.join(rootDir, "lib")

const exampleName = argv.example
const breakAtMain = !!argv.break
const isNotEmptyString = (str) => !!str && typeof str === "string" && str.length > 0
assertFatal(isNotEmptyString(exampleName), `Example name is required --example=simple`)

const mainDir = Path.join(rootDir, "examples", "lib-examples", exampleName)
const mainJs = Path.join(mainDir, `${exampleName}-main.js`)

assertFatal(Fs.existsSync(mainJs), `Example ${mainJs} does not exist, did build succeed before running?`)


ElectronMon({
  cwd: rootDir,
  args: [
    breakAtMain ?  "--inspect-brk=9339" : "--inspect=9339",
    mainJs
  ],
  patterns: [
    `examples/lib-examples/${exampleName}/**/*.*`,
    `lib/cjs/**/*`,
    `!.idea`,
    `!.idea/**/*`,
    `!src`,
    `!src/**/*`,
    `!**.ts`,
    `!**/*~`,
    // `!**/*.*`,
    '!node_modules',
    '!node_modules/**/*',
    '!.*',
    '!**/*.map',
    '!**/*.ts'
  ]
}).catch(err => {
  console.error("Failed", err)
})
// (async () => {
//
//   const app = await
// })();