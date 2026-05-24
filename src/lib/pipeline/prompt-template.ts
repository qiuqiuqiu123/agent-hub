/**
 * Prompt 模板变量替换
 * 支持 {{VAR}} 和 {{VAR.field}} 语法（一层点号解析）
 */
export function resolvePrompt(template: string, args: Record<string, string>): string {
  return template.replace(/\{\{([\w.]+)\}\}/g, (match, key: string) => {
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
}
