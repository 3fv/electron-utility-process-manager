
import Tracer from "tracer"
import upmNodeProcess from "@3fv/electron-utility-process-manager/node"

const log = Tracer.console()

upmNodeProcess.addEventHandler((clientId, port, payload) => {
  log.info(`Received event from (${clientId})`, payload)
  return true
})

upmNodeProcess.addRequestHandler("heartbeat", async (type, messageId, data) => {
  log.info(`Heartbeat request received (${messageId})`, data)
  return true
})
// Child process
//process.parentPort.on('message', (ev) => {

// log.info(`Child process received event with port`,ev)
// port = ev.ports[0]
// port.start()
// port.postMessage({
//   name: "child process"
// })
// port.on("message", ev => {
//   // log.info(`Child process received event ON port`,ev)
// })
//
// ...
//})

export {}