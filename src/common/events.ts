import Tracer from "tracer"
import type { ClientEventHandler, ServiceExitEvent, ServiceExitHandler } from "./types.js"

const log = Tracer.colorConsole({ level: "info" })

/**
 * Holds the handlers a client registered for
 * events pushed by the `utilityProcess`
 */
export class ClientEventHandlers {
  private readonly handlers_ = new Set<ClientEventHandler>()
  
  /**
   * Register a handler
   *
   * @param handler
   * @returns a function which removes the handler
   */
  add(handler: ClientEventHandler): () => void {
    this.handlers_.add(handler)
    return () => this.remove(handler)
  }
  
  remove(handler: ClientEventHandler): void {
    this.handlers_.delete(handler)
  }
  
  /**
   * Call every handler with the event data, a handler
   * which throws does not stop the others
   *
   * @param data
   */
  dispatch(data: any): void {
    for (const handler of [...this.handlers_]) {
      try {
        handler(data)
      } catch (err) {
        log.error(`Event handler failed`, err)
      }
    }
  }
}

/**
 * Holds the handlers registered for the
 * exit of a service (`utilityProcess`)
 */
export class ServiceExitHandlers {
  private readonly handlers_ = new Set<ServiceExitHandler>()
  
  /**
   * Register a handler
   *
   * @param handler
   * @returns a function which removes the handler
   */
  add(handler: ServiceExitHandler): () => void {
    this.handlers_.add(handler)
    return () => this.remove(handler)
  }
  
  remove(handler: ServiceExitHandler): void {
    this.handlers_.delete(handler)
  }
  
  /**
   * Call every handler with the exit event, a handler
   * which throws does not stop the others
   *
   * @param event
   */
  dispatch(event: ServiceExitEvent): void {
    for (const handler of [...this.handlers_]) {
      try {
        handler(event)
      } catch (err) {
        log.error(`Exit handler failed`, err)
      }
    }
  }
}
