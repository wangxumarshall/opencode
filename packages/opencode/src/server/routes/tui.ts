import { Hono, type Context } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { Bus } from "../../bus"
import { Session } from "../../session"
import { TuiEvent } from "@/cli/cmd/tui/event"
import { AsyncQueue } from "../../util/queue"
import { errors } from "../error"
import { lazy } from "../../util/lazy"
import { generateText } from "ai"
import { Provider } from "@/provider/provider"
import { Config } from "@/config/config"
import { Auth } from "@/auth"

const TuiRequest = z.object({
  path: z.string(),
  body: z.any(),
})

type TuiRequest = z.infer<typeof TuiRequest>

const request = new AsyncQueue<TuiRequest>()
const response = new AsyncQueue<any>()

export async function callTui(ctx: Context) {
  const body = await ctx.req.json()
  request.push({
    path: ctx.req.path,
    body,
  })
  return response.next()
}

const TuiControlRoutes = new Hono()
  .get(
    "/next",
    describeRoute({
      summary: "Get next TUI request",
      description: "Retrieve the next TUI (Terminal User Interface) request from the queue for processing.",
      operationId: "tui.control.next",
      responses: {
        200: {
          description: "Next TUI request",
          content: {
            "application/json": {
              schema: resolver(TuiRequest),
            },
          },
        },
      },
    }),
    async (c) => {
      const req = await request.next()
      return c.json(req)
    },
  )
  .post(
    "/response",
    describeRoute({
      summary: "Submit TUI response",
      description: "Submit a response to the TUI request queue to complete a pending request.",
      operationId: "tui.control.response",
      responses: {
        200: {
          description: "Response submitted successfully",
          content: {
            "application/json": {
              schema: resolver(z.boolean()),
            },
          },
        },
      },
    }),
    validator("json", z.any()),
    async (c) => {
      const body = c.req.valid("json")
      response.push(body)
      return c.json(true)
    },
  )

export const TuiRoutes = lazy(() =>
  new Hono()
    .post(
      "/append-prompt",
      describeRoute({
        summary: "Append TUI prompt",
        description: "Append prompt to the TUI",
        operationId: "tui.appendPrompt",
        responses: {
          200: {
            description: "Prompt processed successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", TuiEvent.PromptAppend.properties),
      async (c) => {
        await Bus.publish(TuiEvent.PromptAppend, c.req.valid("json"))
        return c.json(true)
      },
    )
    .post(
      "/ui-interact",
      describeRoute({
        summary: "TUI UI interact",
        description: "Handle UI interaction from plugins",
        operationId: "tui.uiInteract",
        responses: {
          200: {
            description: "Interaction result",
            content: {
              "application/json": {
                schema: resolver(z.any()),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", TuiEvent.UiInteract.properties),
      async (c) => {
        const input = c.req.valid("json")
        const { Plugin } = await import("@/plugin")

        const safeOutput = {
          values: {} as Record<string, any>,
          action: "",
          cancelled: false,
        }

        try {
          const timeoutMs = 30000
          const output = await Promise.race([
            Plugin.trigger("tui.ui.interact", input, safeOutput),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Plugin execution timeout")), timeoutMs),
            ),
          ])

          const validatedOutput = {
            values: typeof output?.values === "object" ? output.values : safeOutput.values,
            action: typeof output?.action === "string" ? output.action : safeOutput.action,
            cancelled: typeof output?.cancelled === "boolean" ? output.cancelled : safeOutput.cancelled,
          }

          return c.json(validatedOutput)
        } catch (err) {
          const message = err instanceof Error ? err.message : "Plugin execution failed"
          return c.json({ error: message, cancelled: true }, 500)
        }
      },
    )
    .post(
      "/optimize-prompt",
      describeRoute({
        summary: "Optimize prompt",
        description: "Use AI to optimize and enhance a user prompt based on conversation context",
        operationId: "tui.optimizePrompt",
        responses: {
          200: {
            description: "Optimized prompt",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    original: z.string(),
                    optimized: z.string(),
                  }),
                ),
              },
            },
          },
          ...errors(400, 500),
        },
      }),
      validator(
        "json",
        z.object({
          prompt: z.string(),
          sessionID: z.string().optional(),
        }),
      ),
      async (c) => {
        const { prompt, sessionID } = c.req.valid("json")

        try {
          // Get small model for optimization
          const cfg = await Config.get()
          let model = undefined

          // First try configured small_model
          if (cfg.small_model) {
            const parts = cfg.small_model.split("/")
            const providerID = parts[0]
            const modelID = parts.slice(1).join("/")
            // Skip if github-copilot with PAT (requires OAuth)
            if (providerID.includes("github-copilot")) {
              const auth = await Auth.get(providerID)
              if (auth?.type === "oauth") {
                model = await Provider.getModel(providerID, modelID)
              }
            } else {
              model = await Provider.getModel(providerID, modelID)
            }
          }

          // If no configured model, try each configured provider to find an available small model
          if (!model) {
            const providers = await Provider.list()
            for (const provider of Object.values(providers)) {
              // Skip github-copilot if using PAT (not OAuth)
              if (provider.id.includes("github-copilot")) {
                const auth = await Auth.get(provider.id)
                if (!auth || auth.type !== "oauth") continue
              }
              const small = await Provider.getSmallModel(provider.id)
              if (small) {
                model = small
                break
              }
            }
          }

          if (!model) {
            return c.json({ error: "No model available. Please configure a provider first." }, 500)
          }

          const language = await Provider.getLanguage(model)

          // Build context from session messages if available
          let contextText = ""
          if (sessionID) {
            const messages = await Session.messages({ sessionID, limit: 10 })
            if (messages.length > 0) {
              const recentMessages = messages
                .slice(-5)
                .map((m) => {
                  const role = m.info.role
                  const text = m.parts
                    .filter((p) => p.type === "text")
                    .map((p) => (p.type === "text" ? p.text : ""))
                    .join("\n")
                    .slice(0, 500)
                  return `${role}: ${text}`
                })
                .join("\n\n")
              contextText = `\n\nRecent conversation context:\n${recentMessages}`
            }
          }

          const systemPrompt = `You are a prompt optimization assistant. Your task is to improve user prompts to make them more effective, clear, and likely to get helpful responses.

Guidelines for optimization:
1. Make the prompt more specific and clear
2. Add relevant context that might be missing
3. Structure the prompt logically (context → task → requirements)
4. Keep the original intent intact
5. Don't add unnecessary complexity
6. If the prompt is already good, just make minor improvements

Return ONLY the optimized prompt, nothing else. Do not include any explanations or markdown formatting.`

          const result = await generateText({
            model: language,
            system: systemPrompt,
            prompt: `Original prompt:${contextText}\n\n"${prompt}"\n\nOptimize this prompt:`,
          })

          const optimized = result.text.trim()

          return c.json({
            original: prompt,
            optimized,
          })
        } catch (err) {
          console.error("Optimize prompt error:", err)
          const message = err instanceof Error ? err.message : "Failed to optimize prompt"
          return c.json({ error: message }, 500)
        }
      },
    )
    .post(
      "/open-help",
      describeRoute({
        summary: "Open help dialog",
        description: "Open the help dialog in the TUI to display user assistance information.",
        operationId: "tui.openHelp",
        responses: {
          200: {
            description: "Help dialog opened successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
        },
      }),
      async (c) => {
        await Bus.publish(TuiEvent.CommandExecute, {
          command: "help.show",
        })
        return c.json(true)
      },
    )
    .post(
      "/open-sessions",
      describeRoute({
        summary: "Open sessions dialog",
        description: "Open the session dialog",
        operationId: "tui.openSessions",
        responses: {
          200: {
            description: "Session dialog opened successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
        },
      }),
      async (c) => {
        await Bus.publish(TuiEvent.CommandExecute, {
          command: "session.list",
        })
        return c.json(true)
      },
    )
    .post(
      "/open-themes",
      describeRoute({
        summary: "Open themes dialog",
        description: "Open the theme dialog",
        operationId: "tui.openThemes",
        responses: {
          200: {
            description: "Theme dialog opened successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
        },
      }),
      async (c) => {
        await Bus.publish(TuiEvent.CommandExecute, {
          command: "session.list",
        })
        return c.json(true)
      },
    )
    .post(
      "/open-models",
      describeRoute({
        summary: "Open models dialog",
        description: "Open the model dialog",
        operationId: "tui.openModels",
        responses: {
          200: {
            description: "Model dialog opened successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
        },
      }),
      async (c) => {
        await Bus.publish(TuiEvent.CommandExecute, {
          command: "model.list",
        })
        return c.json(true)
      },
    )
    .post(
      "/submit-prompt",
      describeRoute({
        summary: "Submit TUI prompt",
        description: "Submit the prompt",
        operationId: "tui.submitPrompt",
        responses: {
          200: {
            description: "Prompt submitted successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
        },
      }),
      async (c) => {
        await Bus.publish(TuiEvent.CommandExecute, {
          command: "prompt.submit",
        })
        return c.json(true)
      },
    )
    .post(
      "/clear-prompt",
      describeRoute({
        summary: "Clear TUI prompt",
        description: "Clear the prompt",
        operationId: "tui.clearPrompt",
        responses: {
          200: {
            description: "Prompt cleared successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
        },
      }),
      async (c) => {
        await Bus.publish(TuiEvent.CommandExecute, {
          command: "prompt.clear",
        })
        return c.json(true)
      },
    )
    .post(
      "/execute-command",
      describeRoute({
        summary: "Execute TUI command",
        description: "Execute a TUI command (e.g. agent_cycle)",
        operationId: "tui.executeCommand",
        responses: {
          200: {
            description: "Command executed successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", z.object({ command: z.string() })),
      async (c) => {
        const command = c.req.valid("json").command
        await Bus.publish(TuiEvent.CommandExecute, {
          // @ts-expect-error
          command: {
            session_new: "session.new",
            session_share: "session.share",
            session_interrupt: "session.interrupt",
            session_compact: "session.compact",
            messages_page_up: "session.page.up",
            messages_page_down: "session.page.down",
            messages_line_up: "session.line.up",
            messages_line_down: "session.line.down",
            messages_half_page_up: "session.half.page.up",
            messages_half_page_down: "session.half.page.down",
            messages_first: "session.first",
            messages_last: "session.last",
            agent_cycle: "agent.cycle",
          }[command],
        })
        return c.json(true)
      },
    )
    .post(
      "/show-toast",
      describeRoute({
        summary: "Show TUI toast",
        description: "Show a toast notification in the TUI",
        operationId: "tui.showToast",
        responses: {
          200: {
            description: "Toast notification shown successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
        },
      }),
      validator("json", TuiEvent.ToastShow.properties),
      async (c) => {
        await Bus.publish(TuiEvent.ToastShow, c.req.valid("json"))
        return c.json(true)
      },
    )
    .post(
      "/publish",
      describeRoute({
        summary: "Publish TUI event",
        description: "Publish a TUI event",
        operationId: "tui.publish",
        responses: {
          200: {
            description: "Event published successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.union(
          Object.values(TuiEvent).map((def) => {
            return z
              .object({
                type: z.literal(def.type),
                properties: def.properties,
              })
              .meta({
                ref: "Event" + "." + def.type,
              })
          }),
        ),
      ),
      async (c) => {
        const evt = c.req.valid("json")
        await Bus.publish(Object.values(TuiEvent).find((def) => def.type === evt.type)!, evt.properties)
        return c.json(true)
      },
    )
    .post(
      "/select-session",
      describeRoute({
        summary: "Select session",
        description: "Navigate the TUI to display the specified session.",
        operationId: "tui.selectSession",
        responses: {
          200: {
            description: "Session selected successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator("json", TuiEvent.SessionSelect.properties),
      async (c) => {
        const { sessionID } = c.req.valid("json")
        await Session.get(sessionID)
        await Bus.publish(TuiEvent.SessionSelect, { sessionID })
        return c.json(true)
      },
    )
    .route("/control", TuiControlRoutes),
)
