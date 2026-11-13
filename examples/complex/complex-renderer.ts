import UPMRendererClientFactory from "@3fv/electron-utility-process-manager/renderer"
import Tracer from "tracer"
import { type PingPongExampleService } from "./complex-types"

const log = Tracer.colorConsole()

document.querySelector("#root").innerHTML = `complex-renderer-example`

async function complexExampleUPM() {
  const messageClient = await UPMRendererClientFactory.createClient<PingPongExampleService>("complex",`${process.type}-01`),
    serviceClient = messageClient.getServiceClient()
  
  messageClient.addEventHandler(data => log.info("Event pushed by the service to the renderer", data))
  
  const messageResult = await messageClient.executeRequest("ping", process.type),
    serviceResult = await serviceClient.ping(process.type)
  
  log.info(`messageResult=${messageResult}`)
  log.info(`serviceResult=${serviceResult}`)
}

complexExampleUPM()
  .catch(err => log.error(`renderer error: ${err.message}`, err))

export {}