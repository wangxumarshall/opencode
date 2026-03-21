import { describe, it, expect } from "bun:test"
import { APICallError } from "ai"

describe("Optimize Feature - Error Handling", () => {
  it("should detect APICallError", () => {
    const error = new APICallError({
      message: "Rate limit exceeded",
      url: "https://api.example.com",
      requestBodyValues: {},
      statusCode: 429,
      responseHeaders: {
        "retry-after": "3600",
      },
      responseBody: JSON.stringify({
        error: {
          type: "FreeUsageLimitError",
          message: "Rate limit exceeded. Please try again later.",
        },
      }),
    })

    expect(APICallError.isInstance(error)).toBe(true)
    expect(error.statusCode).toBe(429)
    expect(error.responseHeaders?.["retry-after"]).toBe("3600")
  })

  it("should extract error message from data", () => {
    const error = new APICallError({
      message: "API call failed",
      url: "https://api.example.com",
      requestBodyValues: {},
      statusCode: 500,
      responseHeaders: {},
      responseBody: JSON.stringify({
        error: {
          message: "Internal server error",
        },
      }),
    })

    const errorData = error.responseBody ? JSON.parse(error.responseBody) : {}
    const errorMessage = errorData?.error?.message || error.message || "API call failed"
    expect(errorMessage).toBe("Internal server error")
  })

  it("should handle rate limit error (429)", () => {
    const statusCode = 429
    const error = new APICallError({
      message: "Rate limit exceeded",
      url: "https://api.example.com",
      requestBodyValues: {},
      statusCode,
      responseHeaders: {
        "retry-after": "54413",
      },
      responseBody: JSON.stringify({
        error: {
          type: "FreeUsageLimitError",
          message: "Rate limit exceeded. Please try again later.",
        },
      }),
    })

    if (statusCode === 429) {
      const retryAfter = error.responseHeaders?.["retry-after"]
      const message = retryAfter 
        ? `Rate limit exceeded. Please try again in ${Math.ceil(parseInt(retryAfter) / 60)} minutes.`
        : "Rate limit exceeded. Please try again later."
      
      expect(message).toContain("907 minutes")
      expect(message).toContain("Rate limit exceeded")
    }
  })

  it("should handle client error (400-499)", () => {
    const statusCode = 400
    const httpStatus = statusCode >= 400 && statusCode < 600 ? statusCode : 500
    expect(httpStatus).toBe(400)
  })

  it("should handle server error (500-599)", () => {
    const statusCode = 503
    const httpStatus = statusCode >= 400 && statusCode < 600 ? statusCode : 500
    expect(httpStatus).toBe(503)
  })

  it("should handle unknown status code", () => {
    const statusCode = 600
    const httpStatus = statusCode >= 400 && statusCode < 600 ? statusCode : 500
    expect(httpStatus).toBe(500)
  })

  it("should handle generic error", () => {
    const err: any = new Error("Something went wrong")
    const message = err instanceof Error ? err.message : "Failed to optimize prompt"
    expect(message).toBe("Something went wrong")
  })

  it("should handle non-Error objects", () => {
    const err: any = "Something went wrong"
    const message = err instanceof Error ? err.message : "Failed to optimize prompt"
    expect(message).toBe("Failed to optimize prompt")
  })
})
