import * as UPM from "../common/index.js"
import { Deferred } from "@3fv/deferred"
import { ipcRenderer } from "electron"
import { assert } from "@3fv/guard"
import Tracer from "tracer"

const log = Tracer.colorConsole({ level: "info" })

export class UPMRendererClientFactory {
  
  static async createClient<
    ReqMap extends UPM.MessageRequestMap = any,
    MType extends UPM.MessageRequestNames<ReqMap> = UPM.MessageRequestNames<ReqMap>
  >(serviceName: string, clientId: string = "renderer"): Promise<UPM.MessagePortClient<ReqMap, MType>> {
    const deferred =  new Deferred<UPM.MessagePortClient<ReqMap,MType>>()
    
    const onNewClient = (ev: Electron.IpcRendererEvent, data:{serviceName: string, clientId: string}) => {
      try {
        const {serviceName: portServiceName, clientId: portClientId} = data
        
        log.info(`Received new client & port for (service=${serviceName},portServiceName=${portServiceName},clientId=${clientId},portClientId=${portClientId})`)
        
        
        if (serviceName === portServiceName && clientId === portClientId) {
          log.info(`Matched client & service`)
          if (ev.ports.length !== 1) {
            deferred.reject(Error("A least 1 port must be transferred"))
          } else {
            const port = ev.ports[0]
            deferred.resolve(new UPM.MessagePortClient(clientId, port))
          }
        }
      } catch (err) {
        log.error(`OnNewClient error`, err)
        deferred.reject(err)
      }
    }
    
    try {
      ipcRenderer.on(UPM.IPCChannel.UPMServiceNewClient, onNewClient)
      ipcRenderer.send(UPM.IPCChannel.UPMServiceNewClient,serviceName, clientId)
      
      const serviceClient = await deferred.promise
      assert(!!serviceClient.port, "Port should be valid after new client resolve")
    } catch (err) {
      deferred.reject(err)
      throw err
    } finally {
      ipcRenderer.off(UPM.IPCChannel.UPMServiceNewClient, onNewClient)
    }
    
    return deferred.promise
  }
  
}

export default UPMRendererClientFactory