import type { Plugin } from "@opencode-ai/plugin"

/**
 * Prompt Optimizer Plugin
 *
 * This plugin provides a customizable prompt optimization hook.
 * By default, the TUI uses the built-in /tui/optimize-prompt endpoint
 * which uses AI to optimize prompts with conversation context.
 *
 * You can customize the optimization behavior by modifying this plugin.
 * To use this plugin instead of the built-in optimizer, change the frontend
 * to call /tui/ui-interact with action "prompt.optimize".
 */
export const PromptOptimizerPlugin: Plugin = async ({ client }) => {
  return {
    "tui.ui.interact": async (input, output) => {
      if (input.action === "prompt.optimize") {
        const prompt = input.context?.prompt ?? ""
        const sessionID = input.context?.sessionID

        try {
          // Example: Get conversation context for better optimization
          let contextInfo = ""
          if (sessionID) {
            const messages = await client.session.messages({
              path: { id: sessionID },
              query: { limit: 5 },
            })
            if (messages.data && messages.data.length > 0) {
              const recentContext = messages.data
                .slice(-3)
                .map((m) => {
                  const role = m.info.role
                  const text = m.parts
                    .filter((p) => p.type === "text")
                    .map((p) => (p.type === "text" ? p.text.slice(0, 200) : ""))
                    .join(" ")
                  return `${role}: ${text}`
                })
                .join("\n")
              contextInfo = `\n\nRecent context:\n${recentContext}`
            }
          }

          // Custom optimization logic here
          // This is a simple example - replace with your own logic
          const optimized = buildOptimizedPrompt(prompt, contextInfo)

          output.values = {
            original: prompt,
            optimized,
          }
          output.action = "optimized"
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error"
          output.cancelled = true
          output.values = {
            error: message,
          }
        }
      }
    },
  }
}

function buildOptimizedPrompt(prompt: string, context: string): string {
  // Simple optimization example - customize as needed
  const lines = [
    "I need help with the following task:",
    "",
    prompt,
  ]

  if (context) {
    lines.push("", "Context from our conversation:", context)
  }

  lines.push(
    "",
    "Please provide a clear, detailed, and actionable response.",
  )

  return lines.join("\n")
}

export default PromptOptimizerPlugin
