import { EventEmitter } from "events"
import { MessageKind, RequestCancelledCode } from "../common/index.js"

/**
 * Stands in for an `Electron.UtilityProcess`: records what
 * the service posts & lets a test answer or exit
 */
class FakeUtilityProcess extends EventEmitter {
  readonly posted = Array<any>()
  
  postMessage(message: any) {
    this.posted.push(message)
  }
  
  kill() {
    this.emit("exit", 0)
    return true
  }
}

/**
 * Stands in for an `Electron.MessagePortMain`
 */
class FakeMessagePort extends EventEmitter {
  postMessage() {
  }
  
  start() {
  }
  
  close() {
  }
}

const mockProcesses = Array<FakeUtilityProcess>()

jest.mock("electron", () => ({
  app: { name: "test-app" },
  utilityProcess: {
    fork: () => {
      const child = new FakeUtilityProcess()
      mockProcesses.push(child)
      setImmediate(() => child.emit("spawn"))
      return child
    }
  },
  MessageChannelMain: class {
    readonly port1 = new FakeMessagePort()
    readonly port2 = new FakeMessagePort()
  }
}))

import { UPMMainService } from "./UPMMainService.js"

async function newService() {
  const service = new UPMMainService<any>("test-service", __filename)
  await service.whenReady()
  return { service, child: mockProcesses[mockProcesses.length - 1] }
}

function lastRequest(child: FakeUtilityProcess) {
  return child.posted[child.posted.length - 1].payload
}

describe("UPMMainService", () => {
  it("resolves a request with the service's result", async () => {
    const { service, child } = await newService(),
      pending = service.executeRequest("ping", "what"),
      { messageId } = lastRequest(child)
    
    child.emit("message", { payload: { messageId, kind: MessageKind.Response, type: "ping", result: "pong" } })
    
    await expect(pending).resolves.toBe("pong")
  })
  
  it("rejects a request with the handler's error", async () => {
    const { service, child } = await newService(),
      pending = service.executeRequest("ping", "what"),
      { messageId } = lastRequest(child)
    
    child.emit("message", {
      payload: {
        messageId,
        kind: MessageKind.Response,
        type: "ping",
        error: "boom",
        errorDetail: { message: "boom", code: "E_BOOM" }
      }
    })
    
    await expect(pending).rejects.toMatchObject({ message: "boom", code: "E_BOOM" })
  })
  
  it("rejects the pending requests of the service & of its main clients when the process exits", async () => {
    const { service, child } = await newService(),
      client = service.createMainClient("test-client"),
      onExit = jest.fn(),
      serviceRequest = service.executeRequest("ping", "service"),
      clientRequest = client.executeRequest("ping", "client")
    
    service.addExitHandler(onExit)
    child.emit("exit", 1)
    
    await expect(serviceRequest).rejects.toMatchObject({ code: RequestCancelledCode })
    await expect(clientRequest).rejects.toMatchObject({ code: RequestCancelledCode })
    expect(onExit).toHaveBeenCalledWith({ code: 1, expected: false })
  })
})
