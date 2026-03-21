import { describe, it, expect } from "bun:test"
import { Instance } from "../../src/project/instance"
import { Provider } from "../../src/provider/provider"
import { ProviderTransform } from "../../src/provider/transform"
import { Config } from "../../src/config/config"
import { Auth } from "../../src/auth"
import path from "path"

describe("Optimize Feature - Full Flow", () => {
  const projectRoot = path.join(__dirname, "../..")

  it("should simulate optimize-prompt flow with session model", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const prompt = "fix bug"
        const sessionID = undefined

        const canUseProvider = async (providerID: string) => {
          if (!providerID.includes("github-copilot")) return true
          const auth = await Auth.get(providerID)
          return auth?.type === "oauth"
        }

        const cfg = await Config.get()
        let model = undefined
        let modelSource = ""

        console.log("Step 1: Try session model")
        if (sessionID) {
          console.log("Session ID provided, would check session model")
        } else {
          console.log("No session ID, skipping session model check")
        }

        console.log("Step 2: Try configured model")
        if (!model && cfg.model) {
          const parts = cfg.model.split("/")
          const providerID = parts[0]
          const modelID = parts.slice(1).join("/")
          if (await canUseProvider(providerID)) {
            model = await Provider.getModel(providerID, modelID)
            modelSource = "configured"
            console.log("Found configured model:", model?.id)
          }
        }

        console.log("Step 3: Try default model")
        if (!model) {
          try {
            const defaultModel = await Provider.defaultModel()
            if (await canUseProvider(defaultModel.providerID)) {
              model = await Provider.getModel(defaultModel.providerID, defaultModel.modelID)
              modelSource = "default"
              console.log("Found default model:", model?.id)
            }
          } catch (e) {
            console.log("Default model failed:", e)
          }
        }

        console.log("Step 4: Try small_model")
        if (!model && cfg.small_model) {
          const parts = cfg.small_model.split("/")
          const providerID = parts[0]
          const modelID = parts.slice(1).join("/")
          if (await canUseProvider(providerID)) {
            model = await Provider.getModel(providerID, modelID)
            modelSource = "small_model"
            console.log("Found small_model:", model?.id)
          }
        }

        console.log("Step 5: Try available small model")
        if (!model) {
          for (const provider of Object.values(await Provider.list())) {
            if (!(await canUseProvider(provider.id))) continue
            model = await Provider.getSmallModel(provider.id)
            if (model) {
              modelSource = "available_small"
              console.log("Found available small model:", model?.id)
              break
            }
          }
        }

        if (!model) {
          console.log("No model available")
          expect(model).toBeDefined()
          return
        }

        console.log("Step 6: Get language model")
        const language = await Provider.getLanguage(model)
        console.log("Language model obtained")

        console.log("Step 7: Build context")
        let contextText = ""
        console.log("Context text:", contextText || "(empty)")

        console.log("Step 8: Build system prompt")
        const systemPrompt = `You are a helpful assistant. Your task is to rewrite user prompts to be more specific and actionable.

You must respond with ONLY the rewritten prompt itself. Do not include any introductory text like "Here is the rewritten prompt" or "将 prompt 重写为...". Just output the rewritten prompt directly.

Example:
User: "fix bug"
You: "Find and fix the bug in the code. Provide: 1) Bug description, 2) Root cause, 3) Fix with explanation, 4) Test steps."

Keep the same language as the input (Chinese → Chinese, English → English).`

        console.log("Step 9: Build options")
        const smallOptions = ProviderTransform.smallOptions(model)
        const containsChinese = /[\u4e00-\u9fa5]/.test(prompt)
        const languageNote = containsChinese 
          ? "IMPORTANT: The input is in Chinese, so the optimized prompt MUST also be in Chinese."
          : "IMPORTANT: The input is in English, so the optimized prompt MUST also be in English."

        const generateParams: any = {
          model: language,
          system: systemPrompt,
          prompt: `Rewrite this prompt: "${prompt}"${contextText}

${languageNote}`,
          providerOptions: ProviderTransform.providerOptions(model, {
            ...smallOptions,
            store: false
          }),
          maxRetries: 0,
        }

        console.log("Step 10: Verify generate params")
        console.log("Model source:", modelSource)
        console.log("Generate params:", {
          model: generateParams.model.modelId,
          system: generateParams.system.slice(0, 50) + "...",
          prompt: generateParams.prompt,
          providerOptions: Object.keys(generateParams.providerOptions),
        })

        console.log("Step 11: All steps completed successfully")
        console.log("Note: Skipping actual API call to avoid rate limits")

        expect(generateParams).toBeDefined()
        expect(generateParams.model).toBeDefined()
        expect(generateParams.system).toBeDefined()
        expect(generateParams.prompt).toBeDefined()
        expect(generateParams.providerOptions).toBeDefined()
        expect(modelSource).toBe("default")
      },
    })
  }, 10000)
})
