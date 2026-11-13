/**
 * The serializable form of an error raised by a
 * request handler in the `utilityProcess`, sent
 * to the client along with the `error` message
 */
export interface MessageError {
  /**
   * The error's message
   */
  message: string
  
  /**
   * The error's `name` (`TypeError`, a custom class name, ...)
   */
  name?: string
  
  /**
   * The error's `code`, when it has one
   */
  code?: string | number
  
  /**
   * The error's `details`, when it has them,
   * they must be structured-cloneable
   */
  details?: any
  
  /**
   * The stack of the error in the `utilityProcess`
   */
  stack?: string
}

/**
 * The error a client's `executeRequest(...)` rejects with when
 * the request handler in the `utilityProcess` failed, it carries
 * the `code` & `details` of the original error
 */
export class UPMRequestError extends Error {
  /**
   * The `code` of the original error
   */
  readonly code: string | number
  
  /**
   * The `details` of the original error
   */
  readonly details: any
  
  /**
   * The stack of the original error in the `utilityProcess`
   */
  readonly remoteStack: string
  
  constructor(error: MessageError) {
    super(error.message)
    this.name = error.name ?? "UPMRequestError"
    this.code = error.code
    this.details = error.details
    this.remoteStack = error.stack
  }
}

/**
 * Convert whatever a request handler threw
 * to its serializable form
 *
 * @param err the thrown value
 */
export function toMessageError(err: any): MessageError {
  const message = err?.message ?? String(err)
  return err instanceof Error || typeof err === "object" && err !== null ?
    {
      message,
      name: err.name,
      code: err.code,
      details: err.details,
      stack: err.stack
    } :
    { message }
}

/**
 * Create the error a pending request rejects with
 *
 * @param error the `error` message of the response
 * @param errorDetail the structured error of the response,
 *   absent when the `utilityProcess` runs an older version
 */
export function toRequestError(error: string, errorDetail?: MessageError): UPMRequestError {
  return new UPMRequestError(errorDetail ?? { message: error })
}

/**
 * The `code` of the error a pending request rejects with when it is
 * cancelled before a response arrived: its client was closed, its port
 * closed, the `utilityProcess` exited or the request timed out
 */
export const RequestCancelledCode = "UPM_REQUEST_CANCELLED"

/**
 * Create the error a pending request rejects with when
 * it is cancelled before a response arrived
 *
 * @param reason why the request was cancelled
 */
export function toCancelledError(reason: string): UPMRequestError {
  return new UPMRequestError({
    message: reason,
    name: "UPMRequestCancelledError",
    code: RequestCancelledCode
  })
}
