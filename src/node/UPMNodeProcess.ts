import { assert, isPromise } from "@3fv/guard"
import { match } from "ts-pattern"
import * as UPM from "../common/index.js"
import Tracer from "tracer"
import { Future } from "@3fv/prelude-ts"

const log = Tracer.colorConsole()

export class UPMNodeProcess
{
  readonly processPort = process.parentPort
  
  private readonly clientPorts_ = new Map<string, Electron.MessagePortMain>()
  
  private readonly requestHandlers_ = new Map<string, UPM.RequestHandler>()
  
  private readonly eventHandlers_ = Array<UPM.EventHandler>()
  
  private onServiceClientPort(clientId: string, port: Electron.MessagePortMain) {
    log.info(`Received new client port for clientId (${clientId})`)
    assert(!this.clientPorts_.has(clientId), `port already registered for clientId(${clientId})`)
    
    port.on("message", (ev: Electron.MessageEvent) => {
      const envelope = (
          ev.data?.message ?? ev.data
        ) as UPM.NodeEnvelope,
        { channel, payload } = envelope
      log.info(`Message received on client port (${clientId})`, envelope)
      
      assert(
        channel === UPM.IPCChannel.UPMServiceMessage,
        `Only IPCChannel.UPMServiceMessage are allowed on client ports: ${channel}`
      )
      Future.of(this.onServiceMessage(clientId, port, payload))
        .onFailure(err => log.error(`Unable to handle message`, err))
    })
    
    port.on("close", () => {
      this.clientPorts_.delete(clientId)
    })
    
    port.start()
  }
  
  private async onServiceMessage(clientId: string, port: UPM.Port, payload: UPM.Message<any, any>) {
    log.info(`onServiceMessage from (clientId=${clientId})`, payload)
    const { messageId, kind, args, eventData, type } = payload
    await match(kind)
      .with(UPM.MessageKind.Request, async () => {
        try {
          assert(
            this.requestHandlers_.has(type),
            `Unknown request handler (${type})`
          )
          
          const handler = this.requestHandlers_.get(type)
          const result = await handler(type, messageId, ...args as any),
            msg:UPM.NodeMessage = {
              channel: UPM.IPCChannel.UPMServiceMessage,
              payload: {
                  type,
                  kind: UPM.MessageKind.Response,
                  messageId,
                  result
                }
            }
          
          port.postMessage(msg)
        } catch (err) {
          log.error(`Unable to handle message`, err)
          const msg:UPM.NodeMessage = {
            channel: UPM.IPCChannel.UPMServiceMessage,
            payload:
              {
                type,
                kind: UPM.MessageKind.Response,
                messageId,
                result: null,
                error: err.message ?? err.toString()
              }
          }
          port.postMessage(msg)
        }
      })
      .with(UPM.MessageKind.Event, async () => {
        try {
          for (const handler of this.eventHandlers_) {
            let res = handler(clientId, port, eventData)
            if (isPromise(res)) {
              const resPromise = res as Promise<boolean>
              res = await resPromise
            }
            
            if (res === true) {
              log.info(`Successfully handled (${messageId}) event`)
              return
            }
          }
          
        } catch (err) {
          log.error(`Unable to handle event (${messageId})`, err)
        }
      })
      .otherwise(async kind => {
        log.error(`Message kind (${kind}) is invalid here`)
      })
  }
  
  private onMessage(port: UPM.Port, message: Electron.MessageEvent) {
    log.info(`Message received on utilityProcess`, message.data)
    const { channel, payload } = (
      message.data?.message ?? message.data
    ) as UPM.NodeEnvelope
    match(channel)
      .when(c => c === UPM.IPCChannel.UPMServiceMessage, () => this.onServiceMessage("main", port, payload))
      .when(
        c => c === UPM.IPCChannel.UPMServiceNewClient,
        () => this.onServiceClientPort(payload.clientId, message.ports[0])
      )
      .otherwise(c => {
        log.error(`Unknown channel (${c})`)
      })
    
  }
  
  private constructor() {
    this.processPort.on("message", (message: Electron.MessageEvent) => this.onMessage(this.processPort, message))
  }
  
  addRequestHandler<
    ReqMap extends UPM.MessageRequestMap = any,
    Type extends UPM.MessageRequestNames<ReqMap> = UPM.MessageRequestNames<ReqMap>
  >(type: Type, handler: UPM.RequestHandler<ReqMap, Type>) {
    log.info(`Registering request handler for type (${type.toString()})`)
    this.requestHandlers_.set(type as string, handler)
  }
  
  addEventHandler(handler: UPM.EventHandler) {
    log.info(`Registering event handler`)
    this.eventHandlers_.push(handler)
  }
  
  /**
   * Singleton instance
   *
   * @private
   */
  private static sInstance_: UPMNodeProcess = null
  
  /**
   * Get singleton instance
   */
  static get(): UPMNodeProcess {
    if (!this.sInstance_) {
      this.sInstance_ = new UPMNodeProcess()
    }
    
    return this.sInstance_
  }
}

const upmNodeProcess = UPMNodeProcess.get()

export default upmNodeProcess