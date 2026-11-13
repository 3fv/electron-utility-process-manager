import {
  app, MessageChannelMain, MessagePortMain, utilityProcess, UtilityProcess
} from "electron"
import { assert, getValue, isDefined, isNumber, isString } from "@3fv/guard"
import Fs from "fs"
import { Deferred } from "@3fv/deferred"
import * as UPM from "../common/index.js"
import defaults from "lodash/defaults.js"
import isEmpty from "lodash/isEmpty.js"
import negate from "lodash/negate.js"
import Tracer from "tracer"
import { asOption } from "@3fv/prelude-ts"
import { match } from "ts-pattern"

const log = Tracer.colorConsole({ level: "info" })
const isNotEmpty = negate(isEmpty)

/**
 * Contains & Manages a `Utility/Process`
 * providing simplified messaging & event
 * propagation.
 */
export class UPMMainService<ReqMap extends UPM.MessageRequestMap = any, MType extends UPM.MessageRequestNames<ReqMap> = UPM.MessageRequestNames<ReqMap>> implements UPM.IMessageClient<ReqMap, MType> {
  
  /**
   * As this container/wrapper implements
   * `IMessageClient`, it needs to provide
   * a `clientId`, which is constant in the
   * main process
   */
  readonly clientId:string = "main"
  
  /**
   * Send an event as `fire-and-forget`
   *
   * @param data
   * @param port
   */
  sendEvent(data:any, port:UPM.Port = this.childProcess_):void {
    const messageId = this.generateMessageId()
    const payload:UPM.NodeEnvelope = {
      channel: UPM.IPCChannel.UPMServiceMessage,
      payload: { messageId, eventData: data, kind: UPM.MessageKind.Event }
    }
    
    port.postMessage(payload)
  }
  
  /**
   * Register a handler for events the service pushes to
   * the main process (`UPMNodeProcess.sendEvent`)
   *
   * @param handler
   * @returns a function which removes the handler
   */
  addEventHandler(handler:UPM.ClientEventHandler):() => void {
    return this.eventHandlers_.add(handler)
  }
  
  /**
   * Remove a handler registered with `addEventHandler`
   *
   * @param handler
   */
  removeEventHandler(handler:UPM.ClientEventHandler):void {
    this.eventHandlers_.remove(handler)
  }
  
  /**
   * Register a handler for the exit of the service, whether it
   * follows a `stop()` (`expected`) or the process exited on its own
   *
   * @param handler
   * @returns a function which removes the handler
   */
  addExitHandler(handler:UPM.ServiceExitHandler):() => void {
    return this.exitHandlers_.add(handler)
  }
  
  /**
   * Remove a handler registered with `addExitHandler`
   *
   * @param handler
   */
  removeExitHandler(handler:UPM.ServiceExitHandler):void {
    this.exitHandlers_.remove(handler)
  }
  
  /**
   * Send request
   *
   * @param type
   * @param args
   */
  async executeRequest<Type extends MType, R extends UPM.MessageRequestReturnType<ReqMap, Type> = UPM.MessageRequestReturnType<ReqMap, Type>>(
      type:Type,
      ...args:UPM.MessageRequestParams<ReqMap, Type>
  ):Promise<R> {
    assert(!!this.childProcess_, "The process is not running")
    const messageId = this.generateMessageId(),
        pending:UPM.PendingRequestMessage<ReqMap, Type, R> = {
          deferred: new Deferred<R>(),
          messageId,
          timeoutId: setTimeout(
              () => this.removePendingMessage(messageId),
              UPM.Defaults.RequestTimeout
          )
        }
    
    this.pendingMessages_.set(messageId, pending)
    const payload:UPM.NodeMessage<ReqMap, Type> = {
      channel: UPM.IPCChannel.UPMServiceMessage,
      payload: { type, messageId, args, kind: UPM.MessageKind.Request }
    }
    
    this.childProcess_.postMessage(payload)
    
    try {
      const result = await pending.deferred.promise
      log.debug(`Completed utility request (messageId=${messageId})`)
      return result
    } catch (err) {
      log.error(`Failed utility request (messageId=${messageId})`, err)
      throw err
    }
  }
  
  close():void {
    log.warn("Close has no effect when called via the main process")
  }
  
  /**
   * Resolves when ready
   *
   * @returns {any}
   */
  whenReady():Promise<UPM.IMessageClient<ReqMap, MType>> {
    return this.init()
  }
  
  /**
   * Return a simple proxy facade wrapping
   * `executeRequest` into individual methods
   */
  getServiceClient():UPM.IServiceClient<ReqMap, MType> {
    return new Proxy<UPM.IServiceClient<ReqMap, MType>>({} as any, {
      get: (_target, prop) => {
        if (prop === "then") {
          return undefined
        }
        return (...args:any[]) => this.whenReady()
            .then(client => client.executeRequest(
                prop as MType,
                ...args as any
            ))
        
      }
    })
  }
  
  private readonly config_:UPM.CreateServiceConfig
  
  private readyDeferred_:Deferred<this> = null
  
  private killDeferred_:Deferred<number> = null
  
  private messageIdSeq_ = 0
  
  private childProcess_:UtilityProcess = null
  
  private pendingMessages_ = new Map<number, UPM.PendingRequestMessage>()
  
  private eventHandlers_ = new UPM.ClientEventHandlers()
  
  private exitHandlers_ = new UPM.ServiceExitHandlers()
  
  private messageChannels_ = new Map<string, MessageChannelMain>()
  
  private onServiceExit(code:number) {
    log.warn(`Service Exit (code=${code})`)
    let deferred = this.killDeferred_
    if (deferred) {
      if (!deferred.isSettled()) {
        deferred.resolve(code)
      } else {
        log.warn(`kill deferred is already settled (code=${code})`)
      }
      this.exitHandlers_.dispatch({ code, expected: true })
      return
    }
    this.killDeferred_ = Deferred.resolve(code)
    
    this.cancelAllPendingMessages()
    this.removeAllMessageChannels()
    this.exitHandlers_.dispatch({ code, expected: false })
  }
  
  /**
   * Returned client side port (for Renderer)
   * @param clientId
   */
  createMessageChannel(clientId:string):MessagePortMain {
    assert(
        this.readyDeferred_?.isFulfilled() ?? false,
        `Service (${this.serviceName}) is not fulfilled or has an error`
    )
    const channel = new MessageChannelMain(), { port1, port2 } = channel
    
    this.messageChannels_.set(clientId, channel)
    try {
      this.childProcess_.postMessage({
        message: {
          channel: UPM.IPCChannel.UPMServiceNewClient, payload: { clientId }
        }
      }, [port1])
    } catch (err) {
      log.error(`Unable to create channel id=${clientId}`, err)
      this.closeMessageChannel(clientId, channel)
      throw err
    }
    return port2
  }
  
  /**
   * Create a port client for the main process
   * (useful to avoid congestion on default child_process channel)
   *
   * @param {string} clientId
   * @returns {UPM.MessagePortClient}
   */
  createMainClient(clientId:string):UPM.MessagePortClient<ReqMap, MType> {
    return new UPM.MessagePortClient(
        clientId,
        this.createMessageChannel(clientId)
    )
  }
  
  /**
   * Service is still in a healthy/running/runnable state
   */
  get isRunning() {
    return !this.killDeferred_
  }
  
  /**
   * Stop the service (kill)
   */
  async stop():Promise<void> {
    await this.kill()
  }
  
  /**
   * Resource management & cleanup
   */
  async [Symbol.asyncDispose]() {
    await this.stop()
  }
  
  /**
   * Initialize the service
   *
   * @private
   */
  private async init():Promise<this> {
    let deferred = this.readyDeferred_
    if (deferred) {
      return deferred.promise
    }
    deferred = this.readyDeferred_ = new Deferred()
    
    try {
      const exitListener = (code:number) => {
        if (code !== 0) {
          deferred.reject(new Error(`process exited with code ${code} upon starting`))
        }
      }
      const spawnListener = async () => {
        this.childProcess_.off("exit", exitListener)
        this.childProcess_.on("exit", this.onServiceExit.bind(this))
        this.childProcess_.on("message", this.onMessage.bind(this))
        deferred.resolve(this)
      }
      
      // BUILD ADDITIONAL FORK OPTIONS
      const childProcessOptions = asOption(this.config_.inspect)
          .filter(it => it !== false)
          .map(it => (
              {
                execArgv: [
                  match(it as UPM.ServiceInspectConfig)
                      .when(isNumber, port => `--inspect=${port}`)
                      .otherwise(({ port, break: shouldBreak }) => {
                        const ext = shouldBreak ? "-brk" : ""
                        return `--inspect${ext}=${port}`
                      })
                ]
              }
          ))
          .getOrElse({} as any)
      
      // FORK
      this.childProcess_ = utilityProcess
          .fork(this.entryFile, [], {
            ...childProcessOptions, serviceName: this.serviceName, env: {
              ...process.env, IN_CHILD_PROCESS: "true", APP_NAME: app.name
            }
          })
          .on("spawn", spawnListener)
          .on("exit", exitListener)
      
      await deferred.promise
    } catch (err) {
      deferred.reject(err)
    }
    
    return deferred.promise
  }
  
  /**
   * Handles what the service posts on its parent port:
   * `results` of `executeRequest(...)` & events pushed
   * with `UPMNodeProcess.sendEvent(...)`
   *
   * @param payloadOrEnvelope the service posts a `NodeEnvelope`
   * @private
   */
  private onMessage<Type extends MType = any>(payloadOrEnvelope:UPM.Message<ReqMap, Type> | UPM.NodeMessage<ReqMap, Type>) {
    const payload = (
            isDefined(payloadOrEnvelope?.["payload"]) ? payloadOrEnvelope["payload"] : payloadOrEnvelope
        ) as UPM.Message<ReqMap, Type>,
        { messageId, result, error, errorDetail } = payload
    
    // EVENT PUSHED BY THE SERVICE
    if (payload?.kind === UPM.MessageKind.Event) {
      log.debug(`Event received from service (${this.serviceName},messageId=${messageId})`)
      this.eventHandlers_.dispatch(payload.eventData)
      return
    }
    
    try {
      const pending = this.pendingMessages_.get(messageId)
      if (!pending) {
        log.debug(`Unable to find pending record ${messageId}`)
        return
      }
      
      if (pending.deferred.isSettled()) {
        log.error(`Already settled record ${messageId}`)
        return
      }
      
      this.removePendingMessage(messageId)
      if (!!error) {
        log.error(error)
        pending.deferred.reject(UPM.toRequestError(error, errorDetail))
        return
      }
      pending.deferred.resolve(result)
    } catch (err) {
      log.error(`Failed to handle message`, err)
    }
  }
  
  /**
   * This handler is currently unused, but
   * could be attached to a `MessagePort.on('close')`
   * event
   *
   * @param id
   * @param channel
   * @private
   */
  // noinspection JSUnusedLocalSymbols
  private onPortClose(id:string, channel:MessageChannelMain) {
    log.info(`main side of message channel(id=${id}) closed`)
    this.closeMessageChannel(id, channel)
  }
  
  /**
   * Close a message channel
   *
   * @param id
   * @param channel
   * @private
   */
  private closeMessageChannel(id:string, channel:MessageChannelMain) {
    if (this.messageChannels_.has(id)) {
      this.messageChannels_.delete(id)
    }
    
    Array(channel.port1, channel.port2)
        .forEach(p => {
          getValue(() => p.close())
        })
  }
  
  /**
   * Kill the service
   *
   * @private
   */
  private async kill():Promise<number> {
    if (!this.readyDeferred_ ||
        !this.readyDeferred_.isSettled() ||
        !this.childProcess_ ||
        this.killDeferred_) {
      log.error("Service is not ready OR the process is not running")
      // noinspection ES6MissingAwait
      return this.killDeferred_?.promise ?? Promise.resolve<number>(0)
    }
    
    let killDeferred = this.killDeferred_ = new Deferred<number>()
    
    // GET THE PROCESS
    const process = this.childProcess_
    
    // CANCEL ALL PENDING MESSAGES & REMOVE ALL CHANNELS
    this.cancelAllPendingMessages()
    this.removeAllMessageChannels()
    
    try {
      process.kill()
    } catch (err) {
      log.error("Unable to kill utility process", err)
      killDeferred.reject(err)
    }
    
    return await killDeferred.promise
  }
  
  /**
   * Close all message channels
   *
   * @private
   */
  private removeAllMessageChannels() {
    for (const [id, channel] of [...this.messageChannels_.entries()]) {
      this.closeMessageChannel(id, channel)
    }
  }
  
  /**
   * Remove all pending messages
   *
   * @private
   */
  private cancelAllPendingMessages():void {
    for (const key of [...this.pendingMessages_.keys()]) {
      this.removePendingMessage(key)
    }
  }
  
  /**
   * Remove a pending message from the queue,
   * whether settled or not
   *
   * @param messageId
   * @private
   */
  private removePendingMessage(messageId:number):void {
    const pending = this.pendingMessages_.get(messageId)
    if (!pending) {
      return
    }
    clearTimeout(pending.timeoutId)
    if (!pending.deferred.isSettled()) {
      pending.deferred.reject(
          "The pending message is being removed before promise is settled")
    }
    this.pendingMessages_.delete(messageId)
  }
  
  /**
   * Generate next message id
   *
   * @private
   */
  private generateMessageId():number {
    return this.messageIdSeq_++
  }
  
  /**
   * Construct a new service
   *
   * @param serviceName
   * @param entryFile
   * @param options
   */
  constructor(
      readonly serviceName:string,
      readonly entryFile:string,
      options:UPM.CreateServiceOptions = {}
  ) {
    assert(isString(entryFile) &&
        isNotEmpty(entryFile) &&
        Fs.existsSync(entryFile), `entry file must be provided (${entryFile})`)
    
    this.config_ = defaults({
      ...options
    }, {
      serviceName, inspect: false
    })
    
    this.init().catch(err => {
      log.error(`Failed to init utility process`, err)
    })
  }
}

export default UPMMainService