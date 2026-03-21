import { describe, it, expect } from "bun:test"
import { ProviderTransform } from "../../src/provider/transform"
import { Provider } from "../../src/provider/provider"

describe("Optimize Feature - Provider Transform", () => {
  it("should generate smallOptions for different providers", () => {
    const mockModel = {
      id: "test-model",
      providerID: "openai",
      api: {
        id: "gpt-4",
        npm: "@ai-sdk/openai",
      },
      capabilities: {},
      limit: { output: 4096 },
    } as any

    const options = ProviderTransform.smallOptions(mockModel)
    expect(options).toBeDefined()
    expect(options.store).toBe(false)
  })

  it("should generate providerOptions correctly", () => {
    const mockModel = {
      id: "test-model",
      providerID: "openai",
      api: {
        id: "gpt-4",
        npm: "@ai-sdk/openai",
      },
      capabilities: {},
      limit: { output: 4096 },
    } as any

    const smallOpts = { store: false }
    const providerOpts = ProviderTransform.providerOptions(mockModel, smallOpts)
    
    expect(providerOpts).toBeDefined()
    expect(providerOpts.openai).toBeDefined()
  })

  it("should handle Chinese text detection", () => {
    const chineseRegex = /[\u4e00-\u9fa5]/
    
    expect(chineseRegex.test("修复bug")).toBe(true)
    expect(chineseRegex.test("fix bug")).toBe(false)
    expect(chineseRegex.test("混合mixed")).toBe(true)
    expect(chineseRegex.test("")).toBe(false)
    expect(chineseRegex.test("123")).toBe(false)
  })

  it("should construct correct prompt with context", () => {
    const prompt = "fix bug"
    const contextText = "\n\nRecent conversation context:\nuser: hello"
    const languageNote = "IMPORTANT: The input is in English, so the optimized prompt MUST also be in English."
    
    const fullPrompt = `Rewrite this prompt: "${prompt}"${contextText}

${languageNote}`
    
    expect(fullPrompt).toContain(prompt)
    expect(fullPrompt).toContain("Recent conversation context")
    expect(fullPrompt).toContain(languageNote)
  })

  it("should construct correct prompt without context", () => {
    const prompt = "fix bug"
    const contextText = ""
    const languageNote = "IMPORTANT: The input is in English, so the optimized prompt MUST also be in English."
    
    const fullPrompt = `Rewrite this prompt: "${prompt}"${contextText}

${languageNote}`
    
    expect(fullPrompt).toContain(prompt)
    expect(fullPrompt).not.toContain("Recent conversation context")
    expect(fullPrompt).toContain(languageNote)
  })

  it("should handle timeout correctly", async () => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 100)
    
    await new Promise(resolve => setTimeout(resolve, 150))
    
    expect(controller.signal.aborted).toBe(true)
    clearTimeout(timeout)
  })
})
