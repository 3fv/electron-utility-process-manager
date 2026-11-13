import type { UtilityProcess } from "electron"
import { Deferred } from "@3fv/deferred"
import type { MessageError } from "./errors.js"


export const Defaults = { RequestTimeout: 120000 }

export enum MessageKind {
  Event = "Event",
  Request = "Request",
  Response = "Response"
}

export enum IPCChannel {
  UPMServiceMessage = "UPMServiceMessage",
  UPMServiceNewClient = "UPMServiceNewClient"
}

export enum NodeMessageType {
  UPMNodeEventMessage = "UPMNodeEventMessage",
  UPMNodeRequestResponse = "UPMNodeRequestResponseMessage",
}

export type MessageRequestFnBase = (...args:any[]) => Promise<any>
export type MessageRequestMap = {}
export type MessageRequestNames<ReqMap extends MessageRequestMap> = keyof ReqMap
export type MessageRequestFn<ReqMap extends MessageRequestMap, Name extends MessageRequestNames<ReqMap>> = ReqMap[Name] extends MessageRequestFnBase ? ReqMap[Name] : never
export type MessageRequestParams<ReqMap extends MessageRequestMap, Name extends MessageRequestNames<ReqMap>> = ReqMap[Name] extends MessageRequestFnBase ? Parameters<ReqMap[Name]> : never
export type MessageRequestReturnType<ReqMap extends MessageRequestMap, Name extends MessageRequestNames<ReqMap>> = ReqMap[Name] extends MessageRequestFnBase ? Awaited<ReturnType<ReqMap[Name]>> : never

export interface Message<
  ReqMap extends MessageRequestMap = any,
  Type extends MessageRequestNames<ReqMap> = MessageRequestNames<ReqMap>,
  Args extends MessageRequestParams<ReqMap, Type> = MessageRequestParams<ReqMap, Type>,
  R extends MessageRequestReturnType<ReqMap, Type> = MessageRequestReturnType<ReqMap, Type>
>
{
  type: Type;
  kind: MessageKind;
  messageId: number;
  eventData?: any
  args?: Args
  result?: R
  error?: string
  
  /**
   * The structured form of `error` (`code`, `details`, ...)
   */
  errorDetail?: MessageError
}

export interface NodeEnvelope<Payload extends {} = any> {
  channel: IPCChannel
  payload: Payload
}

export type RequestHandler<
  ReqMap extends MessageRequestMap = any,
  Type extends MessageRequestNames<ReqMap> = MessageRequestNames<ReqMap>,
  Args extends MessageRequestParams<ReqMap, Type> = MessageRequestParams<ReqMap, Type>,
  R extends MessageRequestReturnType<ReqMap, Type> = MessageRequestReturnType<ReqMap, Type>
> = (type: Type, messageId: number, ...args: Args) => Promise<R>


export type NodeMessage<
  ReqMap extends MessageRequestMap = any,
  Type extends MessageRequestNames<ReqMap> = MessageRequestNames<ReqMap>> = NodeEnvelope<Message<ReqMap, Type>>

export interface PendingRequestMessage<
  ReqMap extends MessageRequestMap = any,
  Type extends MessageRequestNames<ReqMap> = MessageRequestNames<ReqMap>,
  R extends MessageRequestReturnType<ReqMap, Type> = MessageRequestReturnType<ReqMap, Type>
>
{
  deferred: Deferred<R>
  
  timeoutId: ReturnType<typeof setTimeout>
  
  messageId: number
}

/**
 * @returns true if payload was handled, false if not
 */
export type EventHandler = (clientId: string, port: Port, payload: any) => boolean

/**
 * Handles an event pushed by the `utilityProcess`
 * to a client (`UPMNodeProcess.sendEvent`)
 */
export type ClientEventHandler = (data: any) => void

/**
 * Describes the exit of a service (`utilityProcess`)
 */
export interface ServiceExitEvent {
  /**
   * The exit code of the process
   */
  code: number
  
  /**
   * `true` when the exit follows a `stop()`,
   * `false` when the process exited on its own (crash, ...)
   */
  expected: boolean
}

/**
 * Handles the exit of a service (`UPMMainService.addExitHandler`)
 */
export type ServiceExitHandler = (event: ServiceExitEvent) => void

/**
 * Port of any kind
 */
export type Port = MessagePort | Electron.MessagePortMain | Electron.ParentPort | UtilityProcess

/**
 * Debugging & Inspection config
 */
export type ServiceInspectConfig = number | {
  port: number
  break?: boolean
}

/**
 * Configuration to use when creating/launching
 * a service (`Electron.UtilityProcess`)
 */
export interface CreateServiceConfig {
  serviceName: string
  inspect: false | ServiceInspectConfig
}

/**
 * Optional/Partial `CreateServiceConfig`
 */
export type CreateServiceOptions = Partial<CreateServiceConfig>