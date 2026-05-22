/**
 * Prompt 模板变量替换
 * 支持 {{VAR}} 语法
 */
export function resolvePrompt(template: string, args: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return args[key] ?? `{{${key}}}`
  })
}
