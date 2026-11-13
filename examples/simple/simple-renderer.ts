import UPMRendererClientFactory from "@3fv/electron-utility-process-manager/renderer"
import Tracer from "tracer"

const log = Tracer.colorConsole()

document.querySelector("#root").innerHTML = `simple-renderer-example`

async function simpleExampleUPM() {
  const client = await UPMRendererClientFactory.createClient("simple",`${process.type}-01`)
  client.addEventHandler(data => log.info("Event pushed by the service to the renderer", data))
  const result = await client.executeRequest("ping", process.type)
  log.info(`Result: ${result}`)
}

simpleExampleUPM()
  .catch(err => log.error(`renderer error: ${err.message}`, err))

export {}