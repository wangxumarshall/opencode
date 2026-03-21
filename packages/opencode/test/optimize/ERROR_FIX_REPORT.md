# Server Error 500 修复报告

## 问题定位

### 错误现象
```
AI_APICallError: Rate limit exceeded. Please try again later.
statusCode: 429
responseBody: {"type":"error","error":{"type":"FreeUsageLimitError","message":"Rate limit exceeded. Please try again later."}}
```

### 问题原因

1. **服务器端错误处理不完善**
   - 没有区分不同类型的 API 错误
   - 所有错误都返回 500 状态码
   - 没有正确处理速率限制错误（429）

2. **客户端错误处理不友好**
   - 没有显示具体的错误信息
   - 没有处理速率限制的重试时间提示

## 修复方案

### 1. 服务器端改进 ([tui.ts:315-338](file:///Users/wangxu/1-project/opencode/packages/opencode/src/server/routes/tui.ts#L315))

#### 导入 APICallError
```typescript
import { generateText, APICallError } from "ai"
```

#### 改进错误处理
```typescript
catch (err) {
  console.error("Optimize prompt error:", err)
  
  // 处理 API 调用错误
  if (APICallError.isInstance(err)) {
    const statusCode = err.statusCode || 500
    const errorData = err.responseBody ? JSON.parse(err.responseBody) : {}
    const errorMessage = errorData?.error?.message || err.message || "API call failed"
    
    // 特殊处理速率限制错误
    if (statusCode === 429) {
      return c.json({ 
        error: "Rate limit exceeded. Please try again later.",
        retryAfter: err.responseHeaders?.["retry-after"]
      }, 429 as any)
    }
    
    // 返回正确的 HTTP 状态码
    const httpStatus = statusCode >= 400 && statusCode < 600 ? statusCode : 500
    return c.json({ 
      error: errorMessage,
      statusCode 
    }, httpStatus as any)
  }
  
  // 处理其他错误
  const message = err instanceof Error ? err.message : "Failed to optimize prompt"
  return c.json({ error: message }, 500)
}
```

### 2. 客户端改进 ([index.tsx:496-518](file:///Users/wangxu/1-project/opencode/packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx#L496))

#### 改进错误显示
```typescript
const result = await res.json()

// 特殊处理速率限制错误
if (res.status === 429) {
  const retryAfter = result.retryAfter
  const message = retryAfter 
    ? `Rate limit exceeded. Please try again in ${Math.ceil(parseInt(retryAfter) / 60)} minutes.`
    : "Rate limit exceeded. Please try again later."
  toast.show({
    variant: "warning",
    message,
  })
  return
}

// 处理其他错误
if (!res.ok) {
  toast.show({
    variant: "error",
    message: result?.error || `Server error: ${res.status}`,
  })
  return
}
```

## 错误类型处理

### 1. 速率限制错误 (429)
- **状态码**: 429
- **错误信息**: "Rate limit exceeded. Please try again later."
- **重试时间**: 从 `retry-after` 响应头获取
- **用户提示**: 显示具体的重试时间（分钟）

### 2. 客户端错误 (400-499)
- **状态码**: 保持原始状态码
- **错误信息**: 从 API 响应中提取
- **用户提示**: 显示具体错误信息

### 3. 服务器错误 (500-599)
- **状态码**: 保持原始状态码
- **错误信息**: 从 API 响应中提取
- **用户提示**: 显示具体错误信息

### 4. 其他错误
- **状态码**: 500
- **错误信息**: 错误对象的 message 属性
- **用户提示**: 显示通用错误信息

## 测试验证

### 错误处理测试 (8/8 通过)
✓ should detect APICallError  
✓ should extract error message from data  
✓ should handle rate limit error (429)  
✓ should handle client error (400-499)  
✓ should handle server error (500-599)  
✓ should handle unknown status code  
✓ should handle generic error  
✓ should handle non-Error objects  

### 完整测试结果
- **单元测试**: 29/29 通过 ✓
- **类型检查**: 通过 ✓
- **项目构建**: 成功 ✓

## 改进效果

### 修复前
- 所有错误都返回 500 状态码
- 用户看到通用的 "Server error: 500" 消息
- 无法知道具体的错误原因
- 无法知道何时可以重试

### 修复后
- 正确区分不同类型的错误
- 返回正确的 HTTP 状态码
- 显示具体的错误信息
- 对于速率限制，显示重试时间
- 用户可以采取相应的行动

## 最佳实践

1. **错误分类**: 使用 `APICallError.isInstance()` 检测 API 错误
2. **状态码传递**: 保持原始 HTTP 状态码
3. **错误信息提取**: 从响应体中提取具体错误信息
4. **用户友好提示**: 显示可操作的错误信息
5. **重试机制**: 对于速率限制，显示重试时间

## 相关文件

- [src/server/routes/tui.ts](file:///Users/wangxu/1-project/opencode/packages/opencode/src/server/routes/tui.ts) - 服务器端错误处理
- [src/cli/cmd/tui/component/prompt/index.tsx](file:///Users/wangxu/1-project/opencode/packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx) - 客户端错误处理
- [test/optimize/error-handling.test.ts](file:///Users/wangxu/1-project/opencode/packages/opencode/test/optimize/error-handling.test.ts) - 错误处理测试

## 运行测试

```bash
cd packages/opencode

# 运行错误处理测试
bun test test/optimize/error-handling.test.ts

# 运行所有测试
bun test test/optimize/

# 类型检查
bun run typecheck
```

## 总结

通过改进错误处理，现在系统能够：
- 正确识别和处理不同类型的 API 错误
- 返回正确的 HTTP 状态码
- 显示具体且有用的错误信息
- 为用户提供可操作的建议

这大大提升了用户体验，特别是在遇到速率限制等常见错误时。
