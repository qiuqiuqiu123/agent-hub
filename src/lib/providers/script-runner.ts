import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ToolProvider, ToolResult } from './types'

const execFileAsync = promisify(execFile)

/**
 * Script Runner Tool Provider
 * 执行 Node.js 校验脚本，返回结构化结果
 *
 * config:
 *   workDir — 脚本执行的工作目录（可选）
 *   timeout — 超时毫秒数，默认 30000
 *
 * input:
 *   SCRIPT_PATH — 脚本路径（必须）
 *   HTML_PATH — 待校验文件路径（必须）
 *   ARGS — 额外参数，空格分隔（可选）
 *
 * output: JSON {"passed": boolean, "errors": string[], "warnings": string[]}
 */
export function createScriptRunnerProvider(): ToolProvider {
  return {
    name: 'script-runner',
    async execute(input: Record<string, string>, config: Record<string, string>): Promise<ToolResult> {
      const scriptPath = input.SCRIPT_PATH
      if (!scriptPath) {
        return { success: false, output: '', error: '缺少 SCRIPT_PATH 参数' }
      }

      const htmlPath = input.HTML_PATH
      if (!htmlPath) {
        return { success: false, output: '', error: '缺少 HTML_PATH 参数' }
      }

      const args = [scriptPath, htmlPath]
      if (input.ARGS) {
        args.push(...input.ARGS.split(' ').filter(Boolean))
      }

      const timeout = Number(config.timeout) || 30000
      const cwd = config.workDir || undefined

      try {
        const { stdout, stderr } = await execFileAsync('node', args, {
          timeout,
          cwd,
          maxBuffer: 1024 * 1024,
        })

        // 尝试解析 stdout 为 JSON
        const trimmed = stdout.trim()
        try {
          const parsed = JSON.parse(trimmed)
          return { success: parsed.passed !== false, output: trimmed }
        } catch {
          // 脚本输出非 JSON，包装为结构化结果
          const hasError = stderr.trim().length > 0 || trimmed.toLowerCase().includes('error')
          const result = {
            passed: !hasError,
            errors: hasError ? [stderr.trim() || trimmed] : [],
            warnings: [],
            raw: trimmed,
          }
          return { success: result.passed, output: JSON.stringify(result) }
        }
      } catch (err: unknown) {
        const error = err as { code?: string; stdout?: string; stderr?: string; message?: string }

        // 脚本非零退出但有 stdout（校验失败但正常输出结果）
        if (error.stdout?.trim()) {
          try {
            const parsed = JSON.parse(error.stdout.trim())
            return { success: false, output: error.stdout.trim() }
          } catch {
            // 非 JSON stdout
          }
        }

        const msg = error.stderr?.trim() || error.message || '脚本执行失败'
        return { success: false, output: '', error: msg }
      }
    },
  }
}
