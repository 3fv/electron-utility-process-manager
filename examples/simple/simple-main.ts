// Modules to control application life and create native browser window
import { app, BrowserWindow } from "electron"
import { UPM } from "@3fv/electron-utility-process-manager"
import type { UPMMainService } from "@3fv/electron-utility-process-manager/main"

import Tracer from "tracer"
import Path from "path"

const log = Tracer.colorConsole()
let upmService: UPMMainService = null

/**
 * Boilerplate
 *
 * > Note: this can be done via a preload script,
 *     but for the sake of simplicity, we are just
 *     disabling all security here
 *
 * @returns {Promise<void>}
 */
async function createWindow(): Promise<void> {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 1000,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      sandbox: false,
      devTools: true
    }
  })
  
  // Load the sample page
  const htmlFile = Path.resolve(__dirname, "..", "..", "..", "examples", "simple", "simple-renderer.html")
  mainWindow.webContents.openDevTools({ mode: "right" })
  
  await mainWindow.loadFile(htmlFile)
  
  
}

async function start() {
  const upm = await import("@3fv/electron-utility-process-manager/main")
  const upmManager = upm.upmMainServiceManager

  Object.assign(global, {
    upm,
    upmManager
  })
  
  log.info("UPM manager ready, now creating service", upmManager)
  const entryFile = Path.join(__dirname, "simple-node.js")
  upmService = await upmManager.createService("simple", entryFile, {
    // ENABLE DEBUGGING (standard node.js inspect config)
    // inspect: {
    //   break: true,
    //   port: 9449
    // }
  })
  log.info("UPM service ready")
  
  upmService.addEventHandler(data => log.info("Event pushed by the service to main", data))
  
  upmService.sendEvent("test123")

  const clientPort = upmManager.createMainChannel("simple", "main-channel-01")
  log.info("Start the client port")
  if (UPM.isMessagePort(clientPort))
    clientPort.start()

  log.info("Post a message directly")
  clientPort.postMessage({
    channel: UPM.IPCChannel.UPMServiceMessage,
    payload: { kind: UPM.MessageKind.Event, messageId: -1, data: { test: "test456" } }
  })

  log.info("Send event via the UPMMainService wrapper")
  upmService.sendEvent({ test: "test789" }, clientPort)

  log.info(`Creating port client`)
  const client = upmManager.createMainClient("simple", "main-client-01")
  client.addEventHandler(data => log.info("Event pushed by the service to main-client-01", data))
  log.info(`Send request/response: ping`)
  
  const pongResult = await client.executeRequest("ping", "main")
  log.info(`Received pong response`, pongResult)
  
  log.info(`Create the window/renderer`)
  await createWindow()
  
  app.on("activate", function() {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

// When App is READY
app.whenReady().then(start)

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", function() {
  if (process.platform !== "darwin") app.quit()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
