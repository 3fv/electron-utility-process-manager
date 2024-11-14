import type { UtilityProcess } from "electron"
import { isDefined, isFunction, isString } from "@3fv/guard"
import { Deferred } from "@3fv/deferred"


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
export type MessageRequestReturnType<ReqMap extends MessageRequestMap, Name extends MessageRequestNames<ReqMap>> = ReqMap[Name] extends MessageRequestFnBase ? ReturnType<ReqMap[Name]> : never

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
  //data?: any
  eventData?: any
  args?: Args
  result?: R
  error?: string
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

export type Port = MessagePort | Electron.MessagePortMain | Electron.ParentPort | UtilityProcess
