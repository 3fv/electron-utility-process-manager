import { ipcMain } from "electron"
import { assert, isString } from "@3fv/guard"
import { Future } from "@3fv/prelude-ts"
import * as UPM from "../common/index.js"
import UPMMainService from "./UPMMainService.js"

import Tracer from "tracer"

const log = Tracer.colorConsole({ level: "info" })



export class UPMMainServiceManager {
  private services_ = new Map<string, UPMMainService<any,any>>()

  /**
   * On new client request from renderer
   *
   * @param ev
   * @param serviceName
   * @param clientId
   * @private
   */
  private onNewClient(ev: Electron.IpcMainEvent, serviceName: string, clientId: string) {
    const sender = ev.sender
    if (!sender) {
      log.error(`sender is invalid on new client ipc message`, ev)
      return
    }

    const proc = this.getService(serviceName)
    if (!proc) {
      log.error(`no proc found for ${serviceName}`, ev)
      return
    }
    try {
      const clientPort = proc.createMessageChannel(clientId)
      log.info(`Received client port for proc (id=${serviceName},clientId=${clientId})`)
      sender.postMessage(
          UPM.IPCChannel.UPMServiceNewClient,
          {serviceName, clientId},
          [clientPort]
      )
    } catch (err) {
      log.error(`failed to register new client`, err)
    }
  }
  
  createMainChannel
  <
    Args extends UPM.MessageRequestMap = any,
    MType extends UPM.MessageRequestNames<Args> = UPM.MessageRequestNames<Args>,
  >
  (serviceOrName: string | UPMMainService<Args, MType>, clientId: string): UPM.Port {
    try {
      const service = isString(serviceOrName) ? this.getService<Args,MType>(serviceOrName) : serviceOrName
      
      const clientPort = service.createMessageChannel(clientId)
      log.info(`Received client port for proc (id=${service.serviceName},clientId=${clientId})`)
      return clientPort
    } catch (err) {
      log.error(`failed to register new client`, err)
      throw err
    }
  }
  
  createMainClient<
    ReqMap extends UPM.MessageRequestMap = any,
    MType extends UPM.MessageRequestNames<ReqMap> = UPM.MessageRequestNames<ReqMap>,
  >(serviceName: string, clientId: string) {
    const service = this.getService<ReqMap,MType>(serviceName)
    assert(!!service,`no proc found for ${serviceName}`)
    
    try {
      return service.createMainClient(clientId)
    } catch (err) {
      log.error(`failed to register new client`, err)
      throw err
    }
  }
  
  /**
   * Destroy all services
   *
   * @private
   */
  private async destroy() {
    for (const [id] of [...this.services_.keys()]) {
      await this.destroyService(id)
    }
  }
  
  /**
   * Get the service for a given name
   *
   * @param serviceName
   */
  getService<
      ReqMap extends UPM.MessageRequestMap,
      Type extends UPM.MessageRequestNames<ReqMap> = UPM.MessageRequestNames<ReqMap>
  >(serviceName: string): UPMMainService<ReqMap, Type> {
    return this.services_.has(serviceName) ? this.services_.get(serviceName) : null
  }
  
  /**
   * Create a utility process/service
   *
   * @param serviceName
   * @param entryFile
   * @param options
   */
  async createService<
    ReqMap extends UPM.MessageRequestMap,
    Type extends UPM.MessageRequestNames<ReqMap> = UPM.MessageRequestNames<ReqMap>
  >(serviceName: string, entryFile: string, options: UPM.CreateServiceOptions = {}): Promise<UPMMainService<ReqMap,Type>> {
    assert(!this.services_.has(serviceName), `utility process with id (${serviceName}) is already registered`)
    const proc = new UPMMainService(serviceName, entryFile, {
      ...options,
      serviceName: options.serviceName ?? serviceName,
    })
    
    this.services_.set(serviceName, proc)
    
    try {
      await proc.whenReady()
      return proc
    } catch (err) {
      await this.destroyService(serviceName)
      throw err
    }
  }
  
  /**
   * Destroy a specific service
   *
   * @param serviceName
   */
  async destroyService(serviceName: string) {
    if (!this.services_.has(serviceName)) return

    const proc = this.services_.get(serviceName)
    this.services_.delete(serviceName)
    await proc.stop()
  }
  
  /**
   * Async dispose symbol
   */
  async [Symbol.asyncDispose]() {
    await this.destroy()
  }

  private constructor() {
    ipcMain.on(UPM.IPCChannel.UPMServiceNewClient, this.onNewClient.bind(this))
  }

  /**
   * Singleton instance
   *
   * @private
   */
  private static sInstance_: UPMMainServiceManager = null

  /**
   * Get singleton instance
   */
  static get(): UPMMainServiceManager {
    if (!this.sInstance_) {
      this.sInstance_ = new UPMMainServiceManager()
    }

    return this.sInstance_
  }
}

export const upmMainServiceManager = UPMMainServiceManager.get()

export default upmMainServiceManager
