import type { ToolProvider, ToolResult } from './types'

/**
 * 飞书 Tool Provider
 * 支持发送群消息和个人消息
 *
 * config 需要：
 *   appId, appSecret — 飞书应用凭证
 *   webhookUrl — (可选) 直接用 webhook 发消息
 *
 * input 参数：
 *   CONTENT — 消息内容（Markdown）
 *   CHAT_ID — 群 ID（webhook 模式不需要）
 *   MSG_TYPE — 消息类型，默认 "text"
 */

async function getAccessToken(appId: string, appSecret: string): Promise<string> {
  const resp = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  })
  const data = await resp.json() as { tenant_access_token?: string; code?: number; msg?: string }
  if (!data.tenant_access_token) {
    throw new Error(`飞书认证失败: ${data.msg || 'unknown'}`)
  }
  return data.tenant_access_token
}

export function createFeishuProvider(): ToolProvider {
  return {
    name: 'feishu',
    async execute(input: Record<string, string>, config: Record<string, string>): Promise<ToolResult> {
      const content = input.CONTENT || input.PROMPT || ''
      if (!content) {
        return { success: false, output: '', error: '缺少 CONTENT 参数' }
      }

      // Webhook 模式（简单直发）
      if (config.webhookUrl) {
        const resp = await fetch(config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ msg_type: 'text', content: { text: content } }),
        })
        const data = await resp.json() as { code?: number; msg?: string }
        if (data.code !== 0) {
          return { success: false, output: '', error: `飞书 webhook 失败: ${data.msg}` }
        }
        return { success: true, output: 'Message sent via webhook' }
      }

      // API 模式
      const { appId, appSecret } = config
      if (!appId || !appSecret) {
        return { success: false, output: '', error: '缺少 appId/appSecret 配置' }
      }

      const chatId = input.CHAT_ID || config.defaultChatId
      if (!chatId) {
        return { success: false, output: '', error: '缺少 CHAT_ID' }
      }

      const token = await getAccessToken(appId, appSecret)
      const msgType = input.MSG_TYPE || 'text'
      const msgContent = msgType === 'text'
        ? JSON.stringify({ text: content })
        : content

      const resp = await fetch('https://open.feishu.cn/open-apis/im/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          receive_id: chatId,
          msg_type: msgType,
          content: msgContent,
        }),
      })
      const data = await resp.json() as { code?: number; msg?: string; data?: { message_id?: string } }
      if (data.code !== 0) {
        return { success: false, output: '', error: `飞书消息发送失败: ${data.msg}` }
      }
      return { success: true, output: `message_id: ${data.data?.message_id || 'sent'}` }
    },
  }
}
