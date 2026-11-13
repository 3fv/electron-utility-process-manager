# Electron UPM (Utility Process Manager)

## Overview

`@3fv/electron-utility-process-manager` manages `1..n` `Electron.utilityProcess` instances/services/processes via a
single library & provides fully typed client facades automatically

## Install

```shell
pnpm add @3fv/electron-utility-process-manager
```

## Usage

This library integrates into the `node`, `main` and `renderer` processes to provide
transparent access from any process to a `node` (`Electron.utilityProcess`).

### Possible Use-cases

- main -> node
- renderer -> node
- node -> node


### Debugging Config (Applies to all examples)

In order to debug a service/utility process, simply add the following to
the `options` argument passed to `createService`

```typescript
// ENABLE DEBUGGING (standard node.js inspect config)
const options = {
  inspect: {
    break: true, 
    port: 9449
  }
}
upmMainServiceManager.createService("example-service", "/path/to/entry.js", options)
```
> NOTE: If `break` is `true` the utility/service process
>  will not be paused until a debugger is attached.
>  the process will print a chrome debugging url (i.e. `ws://`)


### Pushing events from the utility process

`sendEvent` on the `node` side pushes any structured-cloneable value from the
utility process to its clients, as fire-and-forget. With no `clientId` it goes
to every client: the main process (`"main"`, exported as `MainClientId`) and
each client holding a port.

```typescript
import upmNodeProcess, { MainClientId } from "@3fv/electron-utility-process-manager/node"

// EVERY CLIENT
upmNodeProcess.sendEvent({ progress: 0.5 })

// ONLY THE NAMED CLIENTS, RETURNS THE IDS IT WAS POSTED TO
upmNodeProcess.sendEvent({ progress: 0.5 }, MainClientId, "renderer-01")

// THE IDS WHICH CAN CURRENTLY BE PUSHED TO
upmNodeProcess.clientIds
```

Every client (`UPMMainService` in the main process and the `MessagePortClient`
returned by `createMainClient` or `UPMRendererClientFactory.createClient`)
receives pushed events through `addEventHandler`, which returns a function that
removes the handler (`removeEventHandler(handler)` does the same):

```typescript
const removeHandler = client.addEventHandler(data => {
  console.info(`Event pushed by the service`, data)
})
```

### Request errors

When a request handler in the utility process throws, the client's
`executeRequest(...)` rejects with a `UPMRequestError` that carries the original
error's `message`, `name`, `code` and `details`, plus its stack as `remoteStack`:

```typescript
import { UPMRequestError } from "@3fv/electron-utility-process-manager"

try {
  await service.executeRequest("load", "missing.json")
} catch (err) {
  if (err instanceof UPMRequestError && err.code === "ENOENT") {
    console.warn(`Not found`, err.details)
  }
}
```

`details` must be structured-cloneable, since it crosses the process boundary.

A request that can no longer be answered rejects with a `UPMRequestError` whose
`code` is `RequestCancelledCode`: the utility process exited, the client's port
closed, the client was closed with `close()`, or the request timed out. This
holds for `UPMMainService.executeRequest(...)` and for every port client,
including those made with `createMainClient(...)`:

```typescript
import { RequestCancelledCode } from "@3fv/electron-utility-process-manager"

try {
  await client.executeRequest("load", "data.json")
} catch (err) {
  if (err.code === RequestCancelledCode) {
    console.warn(`The service went away before answering`)
  }
}
```

### Service exit

`UPMMainService.addExitHandler` reports the exit of the utility process. It
returns a function that removes the handler (`removeExitHandler(handler)` does
the same). `expected` is `true` when the exit follows a `stop()` and `false`
when the process exited on its own:

```typescript
const removeHandler = service.addExitHandler(({ code, expected }) => {
  if (!expected) {
    console.error(`Service exited unexpectedly (code=${code})`)
  }
})
```

### Logging

The library logs through `tracer`. Lifecycle messages (a service or a client
port being created, handlers being registered), warnings and errors are
written; the per-message lines (each message received, handled or sent) are
logged at `debug` and are not written.

### Examples

#### Simple Example

> NOTE: The simple example uses the bare-bones approach
> and basically avoids typing wherever possible. For a
> fully typed example, checkout the [complex example](#complex-example)

##### Node/Utility Process ([simple-node.ts](examples/simple/simple-node.ts))

```typescript
import upmNodeProcess from "@3fv/electron-utility-process-manager/node"

upmNodeProcess.addEventHandler((clientId, port, payload) => {
  console.info(`Received event from (${clientId})`, payload)
  return true
})

upmNodeProcess.addRequestHandler("ping", async (type, messageId, what:string) => {
  console.info(`Ping request received (${messageId})`, what)
  return `pong: ${what}`
})
```

##### Main Process ([simple-main.ts](examples/simple/simple-main.ts))

```typescript
import { app, BrowserWindow } from "electron"
import { UPM } from "@3fv/electron-utility-process-manager"
import type { UPMMainService } from "@3fv/electron-utility-process-manager/main"
import Path from "path"

let upmService:UPMMainService = null

async function start() {
  const upm = await import("@3fv/electron-utility-process-manager/main")
  const upmManager = upm.upmMainServiceManager
  
  Object.assign(global, {
    upm, upmManager
  })
  
  console.info("UPM manager ready, now creating service", upmManager)
  upmService = await upmManager.createService("simple", Path.join(__dirname, "simple-node.js"))
  console.info("UPM service ready")
  
  upmService.sendEvent("test123")
  
  const clientPort = upmManager.createMainChannel("simple", "main-channel-01")
  console.info("Start the client port")
  if (UPM.isMessagePort(clientPort)) clientPort.start()
  
  console.info("Post a message directly")
  clientPort.postMessage({
    channel: UPM.IPCChannel.UPMServiceMessage,
    payload: { kind: UPM.MessageKind.Event, messageId: -1, data: { test: "test456" } }
  })
  
  console.info("Send event via the UPMMainService wrapper")
  upmService.sendEvent({ test: "test789" }, clientPort)
  
  console.info(`Creating port client`)
  const client = upmManager.createMainClient("simple", "main-client-01")
  console.info(`Send request/response: ping`)
  
  const pongResult = await client.executeRequest("ping", "main")
  console.info(`Received pong response`, pongResult)
  
  await createWindow()
  
  app.on("activate", function() {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}


/**
 * Boilerplate
 *
 * > Note: this can be done via a preload script,
 *     but for the sake of simplicity, we are just
 *     disabling all security here
 *
 * @returns {Promise<void>}
 */
async function createWindow():Promise<void> {
  const mainWindow = new BrowserWindow({
    width: 1000, height: 1000, webPreferences: {
      contextIsolation: false, nodeIntegration: true, sandbox: false, devTools: true
    }
  })
  
  const htmlFile = Path.resolve(__dirname, "..", "..", "..", "examples", "simple", "simple-renderer.html")
  mainWindow.webContents.openDevTools({ mode: "right" })
  
  await mainWindow.loadFile(htmlFile)
}

app.whenReady().then(start)

app.on("window-all-closed", function() {
  if (process.platform !== "darwin") app.quit()
})

```

##### Renderer Process ([simple-renderer.ts](examples/simple/simple-renderer.ts))

```typescript
import UPMRendererClientFactory from "@3fv/electron-utility-process-manager/renderer"

document.querySelector("#root").innerHTML = `simple-renderer-example`

async function simpleExampleUPM() {
  const client = await UPMRendererClientFactory.createClient("simple", `${process.type}-01`)
  const result = await client.executeRequest("ping", process.type)
  console.info(`Result: ${result}`)
}

simpleExampleUPM()
    .catch(err => console.error(`renderer error: ${err.message}`, err))

export {}
```

#### Complex Example

Checkout the [source here](examples/complex), it's basically the simple example,
but fully typed

## Commands

[pnpm](https://pnpm.io) is the package manager, at the version pinned by the
`packageManager` field of `package.json`. The repository is a pnpm workspace of
two packages: the library at the root and [`examples`](examples), which depends
on the library through `workspace:*`.

| Command                                  | What it does                                                    |
| ---------------------------------------- | --------------------------------------------------------------- |
| `pnpm install`                           | Installs dependencies from `pnpm-lock.yaml`                     |
| `pnpm build`                             | Compiles `src/` to `lib/mjs` and `lib/cjs` (`tsc -b`)           |
| `pnpm build:watch`                       | Same, in watch mode                                             |
| `pnpm build:examples`                    | Compiles `examples/` to `examples/lib-examples` (build first)   |
| `pnpm example --example=<simple\|complex>` | Runs a built example in Electron, restarting it on changes    |
| `pnpm test`                              | Runs jest over the compiled specs in `lib/cjs` (build first)    |
| `pnpm release`                           | Starts the GitHub Actions release workflow (patch bump)         |

The package is a hybrid: `lib/mjs` holds the ES modules and `lib/cjs` the
CommonJS build, selected through the `exports` map of `package.json`. The
`node` and `browser` conditions come first in that map and select the CommonJS
build, so Node and Electron load `lib/cjs` for `import` as well as `require`.

Electron downloads its binary the first time it runs, so `pnpm install` does not
fetch it. `pnpm-workspace.yaml` denies the `@parcel/watcher` install script; its
native binary comes from its optional dependencies. It also sets
`minimumReleaseAge: 0`, so a dependency released within the last day installs.

To use a local checkout from another project, run
`pnpm link /path/to/electron-utility-process-manager` in that project after
`pnpm build` here.

## Releasing

Releases run entirely in GitHub Actions (`.github/workflows/release.yml`),
started by `pnpm release` or by
`gh workflow run release.yml --ref master -f bump=<patch|minor|major|none>` (add
`-f dist-tag=<tag>` to publish under a tag other than `latest`):

1. The `version` job runs `pnpm version`, which builds and tests the package
   (`preversion`), commits and tags `vX.Y.Z`, and pushes both to `master`.
2. The `publish` job checks out that tag, builds it and runs `npm publish`
   through npm trusted publishing, so no npm token or two-factor prompt is
   involved. If it fails, re-run that job alone: it publishes the same tag.

`bump=none` publishes the version already in `package.json` at the dispatched
commit without bumping or tagging.

Trusted publishing needs a one-time registration of the workflow on npm:

    npm trust github @3fv/electron-utility-process-manager --repo 3fv/electron-utility-process-manager --file release.yml --allow-publish

## TODO

- [x] CI/CD (release workflow)
- [ ] Tests (client-side event dispatch is covered; the Electron processes are not)