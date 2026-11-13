import { toMessageError, toRequestError, UPMRequestError } from "./errors.js"

class CodedError extends Error {
  readonly code = "E_CODED"
  readonly details = { field: "value" }
  
  constructor(message: string) {
    super(message)
    this.name = "CodedError"
  }
}

describe("toMessageError", () => {
  it("keeps the message, name, code, details & stack of an error", () => {
    const err = new CodedError("failed"),
      messageError = toMessageError(err)
    
    expect(messageError).toEqual({
      message: "failed",
      name: "CodedError",
      code: "E_CODED",
      details: { field: "value" },
      stack: err.stack
    })
  })
  
  it("converts a thrown non-error to its message", () => {
    expect(toMessageError("failed")).toEqual({ message: "failed" })
  })
})

describe("toRequestError", () => {
  it("restores the code, details, name & remote stack", () => {
    const messageError = toMessageError(new CodedError("failed")),
      err = toRequestError(messageError.message, messageError)
    
    expect(err).toBeInstanceOf(UPMRequestError)
    expect(err.message).toBe("failed")
    expect(err.name).toBe("CodedError")
    expect(err.code).toBe("E_CODED")
    expect(err.details).toEqual({ field: "value" })
    expect(err.remoteStack).toBe(messageError.stack)
  })
  
  it("falls back to the message when the response has no structured error", () => {
    const err = toRequestError("failed")
    
    expect(err.message).toBe("failed")
    expect(err.name).toBe("UPMRequestError")
    expect(err.code).toBeUndefined()
  })
})
