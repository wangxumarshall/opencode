#!/usr/bin/env bun

// 测试脚本：直接调用optimize API并查看服务端日志

const prompt = process.argv[2] || "oopencode + glm5经常调用toolcall失败，深度研究opencode toolcall与claude code的差异性；另外看看glm5量化后对json格式中的某些字符出现json parsor error expected '}'。"

console.log(`测试提示词: "${prompt}"`)
console.log("正在调用API...")

const response = await fetch("http://localhost:4096/tui/optimize-prompt", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    prompt: prompt,
    sessionID: "ses-test-debug",
  }),
})

console.log(`\n响应状态: ${response.status}`)

const result = await response.json()

console.log("\n=== API 返回结果 ===")
console.log(JSON.stringify(result, null, 2))
console.log("====================")

console.log("\n请查看上面的服务端日志输出（在运行服务器的终端中）")
