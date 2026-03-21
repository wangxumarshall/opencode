import { describe, it, expect } from "bun:test"
import { Instance } from "../../src/project/instance"
import { Provider } from "../../src/provider/provider"
import { Config } from "../../src/config/config"
import path from "path"

describe("Optimize Feature - Instance Context", () => {
  const projectRoot = path.join(__dirname, "../..")

  it("should have instance context", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        expect(Instance.directory).toBeDefined()
        expect(Instance.project).toBeDefined()
        console.log("Instance directory:", Instance.directory)
        console.log("Instance project:", Instance.project.id)
      },
    })
  })

  it("should get config successfully", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const cfg = await Config.get()
        console.log("Config:", {
          model: cfg.model,
          small_model: cfg.small_model,
          providers: Object.keys(cfg.provider || {}),
        })
        expect(cfg).toBeDefined()
      },
    })
  })

  it("should list providers successfully", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const providers = await Provider.list()
        console.log("Providers:", Object.keys(providers))
        expect(providers).toBeDefined()
        expect(Object.keys(providers).length).toBeGreaterThan(0)
      },
    })
  })

  it("should get default model successfully", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        try {
          const defaultModel = await Provider.defaultModel()
          console.log("Default model:", defaultModel)
          expect(defaultModel).toBeDefined()
          expect(defaultModel.providerID).toBeDefined()
          expect(defaultModel.modelID).toBeDefined()
        } catch (error) {
          console.error("Error getting default model:", error)
          throw error
        }
      },
    })
  })

  it("should get model successfully", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const defaultModel = await Provider.defaultModel()
        const model = await Provider.getModel(defaultModel.providerID, defaultModel.modelID)
        console.log("Model:", {
          id: model.id,
          providerID: model.providerID,
          api: model.api,
        })
        expect(model).toBeDefined()
      },
    })
  })

  it("should get language model successfully", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const defaultModel = await Provider.defaultModel()
        const model = await Provider.getModel(defaultModel.providerID, defaultModel.modelID)
        const language = await Provider.getLanguage(model)
        console.log("Language model:", language)
        expect(language).toBeDefined()
      },
    })
  })
})
