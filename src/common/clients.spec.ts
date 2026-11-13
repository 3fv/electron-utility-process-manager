import { EventEmitter } from "events"
import { MessagePortClient } from "./clients.js"
import { RequestCancelledCode, UPMRequestError } from "./errors.js"
import { IPCChannel, MessageKind, Port } from "./types.js"

/**
 * Stands in for an `Electron.MessagePortMain`: records what
 * the client posts & lets a test deliver a message to it
 */
class FakePort extends EventEmitter {
  readonly posted = Array<any>()
  
  postMessage(message: any) {
    this.posted.push(message)
  }
  
  start() {
  }
  
  closeCount = 0
  
  close() {
    this.closeCount++
  }
  
  deliver(payload: any) {
    this.emit("message", { data: { channel: IPCChannel.UPMServiceMessage, payload } })
  }
}

function newClient() {
  const port = new FakePort(),
    client = new MessagePortClient<any>("test-client", port as any as Port)
  return { port, client }
}

describe("MessagePortClient", () => {
  it("dispatches an event pushed by the utility process to every handler", () => {
    const { port, client } = newClient(),
      handler1 = jest.fn(),
      handler2 = jest.fn()
    
    client.addEventHandler(handler1)
    client.addEventHandler(handler2)
    port.deliver({ messageId: 0, kind: MessageKind.Event, eventData: { value: 1 } })
    
    expect(handler1).toHaveBeenCalledTimes(1)
    expect(handler1).toHaveBeenCalledWith({ value: 1 })
    expect(handler2).toHaveBeenCalledWith({ value: 1 })
  })
  
  it("stops calling a removed handler", () => {
    const { port, client } = newClient(),
      removed = jest.fn(),
      removedByHandle = jest.fn(),
      kept = jest.fn()
    
    client.addEventHandler(removed)
    const remove = client.addEventHandler(removedByHandle)
    client.addEventHandler(kept)
    client.removeEventHandler(removed)
    remove()
    port.deliver({ messageId: 0, kind: MessageKind.Event, eventData: "data" })
    
    expect(removed).not.toHaveBeenCalled()
    expect(removedByHandle).not.toHaveBeenCalled()
    expect(kept).toHaveBeenCalledTimes(1)
  })
  
  it("keeps dispatching when a handler throws", () => {
    const { port, client } = newClient(),
      kept = jest.fn()
    
    client.addEventHandler(() => {
      throw new Error("handler failure")
    })
    client.addEventHandler(kept)
    port.deliver({ messageId: 0, kind: MessageKind.Event, eventData: "data" })
    
    expect(kept).toHaveBeenCalledTimes(1)
  })
  
  it("does not settle a pending request with an event of the same messageId", async () => {
    const { port, client } = newClient(),
      handler = jest.fn(),
      pending = client.executeRequest("ping", "what"),
      { messageId } = port.posted[0].payload
    
    client.addEventHandler(handler)
    port.deliver({ messageId, kind: MessageKind.Event, eventData: "pushed" })
    port.deliver({ messageId, kind: MessageKind.Response, type: "ping", result: "pong" })
    
    await expect(pending).resolves.toBe("pong")
    expect(handler).toHaveBeenCalledWith("pushed")
  })
  
  it("rejects with the handler's error & forgets the request", async () => {
    const { port, client } = newClient(),
      pending = client.executeRequest("ping", "what"),
      { messageId } = port.posted[0].payload
    
    port.deliver({
      messageId,
      kind: MessageKind.Response,
      type: "ping",
      error: "boom",
      errorDetail: { message: "boom", code: "E_BOOM" }
    })
    
    await expect(pending).rejects.toMatchObject({ message: "boom", code: "E_BOOM" })
    expect((client as any).pendingMessages_.size).toBe(0)
  })
  
  it("rejects every pending request when the port closes", async () => {
    const { port, client } = newClient(),
      first = client.executeRequest("ping", "one"),
      second = client.executeRequest("ping", "two")
    
    port.emit("close")
    
    await expect(first).rejects.toBeInstanceOf(UPMRequestError)
    await expect(second).rejects.toMatchObject({ code: RequestCancelledCode })
  })
  
  it("rejects pending & later requests once closed, and closes the port once", async () => {
    const { port, client } = newClient(),
      pending = client.executeRequest("ping", "what")
    
    client.close()
    client.close()
    
    await expect(pending).rejects.toMatchObject({ code: RequestCancelledCode })
    await expect(client.executeRequest("ping", "late")).rejects.toMatchObject({ code: RequestCancelledCode })
    expect(port.closeCount).toBe(1)
    expect(port.posted).toHaveLength(1)
  })
})
