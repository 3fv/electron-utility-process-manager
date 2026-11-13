
import Tracer from "tracer"
import upmNodeProcess from "@3fv/electron-utility-process-manager/node"

const log = Tracer.console()

upmNodeProcess.addEventHandler((clientId, port, payload) => {
  log.info(`Received event from (${clientId})`, payload)
  return true
})

upmNodeProcess.addRequestHandler("ping", async (type, messageId, what: string) => {
  log.info(`Ping request received (${messageId})`, what)
  
  // PUSH AN EVENT TO EVERY CLIENT (THE MAIN PROCESS INCLUDED)
  upmNodeProcess.sendEvent({ pinged: what })
  return `pong: ${what}`
})

export {}