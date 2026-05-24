import type { ToolProvider, ToolResult } from './types'

/**
 * GPT Image 2 Tool Provider
 * 调用 OpenAI Images API 生成图片
 *
 * config:
 *   apiKey — OpenAI API Key
 *   baseUrl — (可选) API base URL，默认 https://api.openai.com/v1
 *   size — 默认 1024x1024
 *   quality — 默认 high
 *   model — 默认 gpt-image-1
 *
 * input:
 *   PROMPT — 图片描述
 *   SIZE — (可选) 覆盖 config 中的 size
 *
 * output: JSON {"url": "...", "revised_prompt": "..."}
 */
export function createImageGenProvider(): ToolProvider {
  return {
    name: 'image-gen',
    async execute(input: Record<string, string>, config: Record<string, string>): Promise<ToolResult> {
      const prompt = input.PROMPT || input.CONTENT || ''
      if (!prompt) {
        return { success: false, output: '', error: '缺少 PROMPT 参数' }
      }

      const apiKey = config.apiKey
      if (!apiKey) {
        return { success: false, output: '', error: '缺少 apiKey 配置' }
      }

      const baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')
      const model = config.model || 'gpt-image-1'
      const size = input.SIZE || config.size || '1024x1024'
      const quality = config.quality || 'high'

      const resp = await fetch(`${baseUrl}/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          prompt,
          n: 1,
          size,
          quality,
        }),
      })

      if (!resp.ok) {
        const errText = await resp.text()
        return { success: false, output: '', error: `OpenAI API 错误 (${resp.status}): ${errText}` }
      }

      const data = await resp.json() as {
        data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>
      }

      const image = data.data?.[0]
      if (!image) {
        return { success: false, output: '', error: '未返回图片数据' }
      }

      const result = {
        url: image.url || '',
        b64_json: image.b64_json || '',
        revised_prompt: image.revised_prompt || '',
      }

      return { success: true, output: JSON.stringify(result) }
    },
  }
}
