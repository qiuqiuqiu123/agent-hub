/**
 * Prompt 模板变量替换
 * 支持 {{VAR}}、{{VAR.field}} 语法（一层点号解析）
 * 支持 {{#if VAR}}...{{/if}} 条件块（变量存在且非空时保留内容）
 */
export function resolvePrompt(template: string, args: Record<string, string>): string {
  // Phase 1: 条件块 {{#if VAR}}...{{/if}}
  let result = template.replace(
    /\{\{#if\s+([\w.]+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, key: string, content: string) => {
      const value = args[key]
      return (value && value.trim()) ? content : ''
    }
  )

  // Phase 2: 变量替换 {{VAR}}
  result = result.replace(/\{\{([\w.]+)\}\}/g, (match, key: string) => {
    // 直接匹配
    if (key in args) {
      return args[key]
    }

    // 点号解析：STEP_X_DATA.field
    const dotIndex = key.indexOf('.')
    if (dotIndex > 0) {
      const base = key.substring(0, dotIndex)
      const field = key.substring(dotIndex + 1)
      const baseValue = args[base]
      if (baseValue) {
        try {
          const parsed = JSON.parse(baseValue)
          if (parsed && typeof parsed === 'object' && field in parsed) {
            const val = parsed[field]
            return typeof val === 'string' ? val : JSON.stringify(val)
          }
        } catch {
          // 非 JSON，返回原始模板
        }
      }
    }

    return match
  })

  return result
}
