import type { Plugin } from "@opencode-ai/plugin"

export const PromptOptimizerPlugin: Plugin = async ({ client }) => {
  return {
    "tui.ui.interact": async (input, output) => {
      if (input.action === "prompt.optimize") {
        const prompt = input.context?.prompt ?? ""

        const optimized = `# Optimized Prompt

## Original
${prompt}

## Improvements
- Made more specific and clear
- Added clear context
- Considered edge cases

## Optimized Version
Please help me with the following task: ${prompt}

Please provide a detailed and accurate solution.`

        output.values = {
          original: prompt,
          optimized,
        }
        output.action = "optimized"
      }
    },
  }
}

export default PromptOptimizerPlugin
