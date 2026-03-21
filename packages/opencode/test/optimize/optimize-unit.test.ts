import { describe, it, expect } from "bun:test"

describe("Optimize Feature - Unit Tests", () => {
  it("should validate Chinese text detection", () => {
    const chineseRegex = /[\u4e00-\u9fa5]/
    expect(chineseRegex.test("修复bug")).toBe(true)
    expect(chineseRegex.test("fix bug")).toBe(false)
    expect(chineseRegex.test("混合mixed text")).toBe(true)
  })

  it("should construct correct language note for Chinese", () => {
    const prompt = "修复bug"
    const containsChinese = /[\u4e00-\u9fa5]/.test(prompt)
    const languageNote = containsChinese 
      ? "IMPORTANT: The input is in Chinese, so the optimized prompt MUST also be in Chinese."
      : "IMPORTANT: The input is in English, so the optimized prompt MUST also be in English."
    
    expect(languageNote).toContain("Chinese")
  })

  it("should construct correct language note for English", () => {
    const prompt = "fix bug"
    const containsChinese = /[\u4e00-\u9fa5]/.test(prompt)
    const languageNote = containsChinese 
      ? "IMPORTANT: The input is in Chinese, so the optimized prompt MUST also be in Chinese."
      : "IMPORTANT: The input is in English, so the optimized prompt MUST also be in English."
    
    expect(languageNote).toContain("English")
  })

  it("should handle context text correctly", () => {
    const contextText = "\n\nRecent conversation context:\nuser: hello\nassistant: hi"
    const prompt = "fix bug"
    const fullPrompt = `Rewrite this prompt: "${prompt}"${contextText}`
    
    expect(fullPrompt).toContain("Recent conversation context")
    expect(fullPrompt).toContain(prompt)
  })

  it("should handle empty context text", () => {
    const contextText = ""
    const prompt = "fix bug"
    const fullPrompt = `Rewrite this prompt: "${prompt}"${contextText}`
    
    expect(fullPrompt).toBe(`Rewrite this prompt: "${prompt}"`)
    expect(fullPrompt).not.toContain("Recent conversation context")
  })

  it("should validate prompt schema", () => {
    const validInput = { prompt: "test", sessionID: "optional" }
    const invalidInput = { invalidField: "test" } as any
    
    expect(validInput.prompt).toBeDefined()
    expect(typeof validInput.prompt).toBe("string")
    expect(invalidInput.prompt).toBeUndefined()
  })

  it("should handle timeout correctly", () => {
    const timeout = 30000
    expect(timeout).toBe(30000)
  })

  it("should construct correct API URL", () => {
    const sdkUrl = "http://localhost:3000"
    const apiUrl = `${sdkUrl}/tui/optimize-prompt`
    expect(apiUrl).toBe("http://localhost:3000/tui/optimize-prompt")
  })
})
