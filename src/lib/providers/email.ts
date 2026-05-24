import type { ToolProvider, ToolResult } from './types'

/**
 * Email Tool Provider (SMTP)
 * 使用 fetch 调用外部 SMTP relay 或直接 nodemailer
 * MVP 阶段使用简单 HTTP relay 模式
 *
 * config 需要：
 *   smtpHost, smtpPort, smtpUser, smtpPass — SMTP 凭证
 *   from — 发件人地址
 *
 * input 参数：
 *   TO — 收件人（逗号分隔多个）
 *   SUBJECT — 邮件主题
 *   BODY — 邮件正文（纯文本或 HTML）
 *   HTML — "true" 表示 BODY 是 HTML
 */

export function createEmailProvider(): ToolProvider {
  return {
    name: 'email',
    async execute(input: Record<string, string>, config: Record<string, string>): Promise<ToolResult> {
      const { smtpHost, smtpPort, smtpUser, smtpPass, from } = config
      if (!smtpHost || !smtpUser || !smtpPass || !from) {
        return { success: false, output: '', error: '缺少 SMTP 配置 (smtpHost/smtpUser/smtpPass/from)' }
      }

      const to = input.TO
      const subject = input.SUBJECT || '(No Subject)'
      const body = input.BODY || input.CONTENT || input.PROMPT || ''

      if (!to) {
        return { success: false, output: '', error: '缺少 TO 收件人' }
      }

      // 使用动态 import nodemailer（如果可用）
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const nodemailer = await (Function('return import("nodemailer")')() as Promise<any>)
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: parseInt(smtpPort || '587'),
          secure: smtpPort === '465',
          auth: { user: smtpUser, pass: smtpPass },
        })

        const isHtml = input.HTML === 'true'
        const mailOptions = {
          from,
          to,
          subject,
          ...(isHtml ? { html: body } : { text: body }),
        }

        const info = await transporter.sendMail(mailOptions)
        return { success: true, output: `messageId: ${info.messageId}` }
      } catch (err) {
        // nodemailer 不可用时，返回错误提示
        const error = err instanceof Error ? err.message : String(err)
        if (error.includes('Cannot find module') || error.includes('MODULE_NOT_FOUND')) {
          return { success: false, output: '', error: '需要安装 nodemailer: pnpm add nodemailer' }
        }
        return { success: false, output: '', error: `邮件发送失败: ${error}` }
      }
    },
  }
}
