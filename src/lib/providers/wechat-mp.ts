import type { ToolProvider, ToolResult } from './types'

/**
 * 微信公众号 Tool Provider（草稿箱模式）
 *
 * 流程：获取 access_token → 上传正文图片 → 上传封面图为永久素材 → 创建草稿
 *
 * config:
 *   appId — 公众号 AppID
 *   appSecret — 公众号 AppSecret
 *
 * input:
 *   TITLE — 文章标题
 *   CONTENT — HTML 正文（可包含 {{IMAGE_URL}} 占位符）
 *   THUMB_URL — 封面图 URL（下载后上传为永久素材）
 *   THUMB_BASE64 — (或) 封面图 base64
  *   IMAGE_BASE64 — (可选) 正文图片 base64，上传后替换 CONTENT 中的 {{IMAGE_URL}}
 *   SKIP_CONTENT_IMAGE_UPLOAD — (可选) 设为 true 时不上传正文图片
 *   AUTHOR — (可选) 作者
 *   DIGEST — (可选) 摘要
 *
 * output: JSON {"media_id": "...", "image_url": "...", "msg": "草稿已创建"}
 */

async function getAccessToken(appId: string, appSecret: string): Promise<string> {
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`
  const resp = await fetch(url)
  const data = await resp.json() as { access_token?: string; errcode?: number; errmsg?: string }
  if (!data.access_token) {
    throw new Error(`微信获取 token 失败: ${data.errmsg || 'unknown'} (${data.errcode})`)
  }
  return data.access_token
}

async function downloadImage(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const resp = await fetch(url)
  if (!resp.ok) {
    throw new Error(`下载图片失败: ${resp.status} ${url}`)
  }
  const contentType = resp.headers.get('content-type') || 'image/jpeg'
  const arrayBuffer = await resp.arrayBuffer()
  return { buffer: Buffer.from(arrayBuffer), contentType }
}

async function uploadThumbMaterial(
  accessToken: string,
  imageBuffer: Buffer,
  contentType: string,
): Promise<string> {
  // 构建 multipart/form-data
  const ext = contentType.includes('png') ? 'png' : 'jpg'
  const boundary = `----FormBoundary${Date.now()}`
  const filename = `thumb.${ext}`

  const header = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="media"; filename="${filename}"`,
    `Content-Type: ${contentType}`,
    '',
    '',
  ].join('\r\n')

  const footer = `\r\n--${boundary}--\r\n`

  const headerBuf = Buffer.from(header, 'utf-8')
  const footerBuf = Buffer.from(footer, 'utf-8')
  const body = Buffer.concat([headerBuf, imageBuffer, footerBuf])

  const url = `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${accessToken}&type=image`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  })

  const data = await resp.json() as { media_id?: string; errcode?: number; errmsg?: string }
  if (!data.media_id) {
    throw new Error(`上传封面失败: ${data.errmsg || 'unknown'} (${data.errcode})`)
  }
  return data.media_id
}

/**
 * 上传正文图片（返回微信域名 URL，可直接在 <img src> 中使用）
 */
async function uploadContentImage(
  accessToken: string,
  imageBuffer: Buffer,
  contentType: string,
): Promise<string> {
  const ext = contentType.includes('png') ? 'png' : 'jpg'
  const boundary = `----FormBoundary${Date.now()}`
  const filename = `content.${ext}`

  const header = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="media"; filename="${filename}"`,
    `Content-Type: ${contentType}`,
    '',
    '',
  ].join('\r\n')

  const footer = `\r\n--${boundary}--\r\n`

  const headerBuf = Buffer.from(header, 'utf-8')
  const footerBuf = Buffer.from(footer, 'utf-8')
  const body = Buffer.concat([headerBuf, imageBuffer, footerBuf])

  const url = `https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=${accessToken}`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  })

  const data = await resp.json() as { url?: string; errcode?: number; errmsg?: string }
  if (!data.url) {
    throw new Error(`上传正文图片失败: ${data.errmsg || 'unknown'} (${data.errcode})`)
  }
  return data.url
}

async function createDraft(
  accessToken: string,
  article: {
    title: string
    content: string
    thumb_media_id: string
    author?: string
    digest?: string
  },
): Promise<string> {
  const url = `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${accessToken}`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      articles: [{
        title: article.title,
        author: article.author || '',
        digest: article.digest || '',
        content: article.content,
        thumb_media_id: article.thumb_media_id,
        content_source_url: '',
        need_open_comment: 0,
      }],
    }),
  })

  const data = await resp.json() as { media_id?: string; errcode?: number; errmsg?: string }
  if (!data.media_id) {
    throw new Error(`创建草稿失败: ${data.errmsg || 'unknown'} (${data.errcode})`)
  }
  return data.media_id
}

export function createWechatMpProvider(): ToolProvider {
  return {
    name: 'wechat-mp',
    async execute(input: Record<string, string>, config: Record<string, string>): Promise<ToolResult> {
      const { appId, appSecret } = config
      if (!appId || !appSecret) {
        return { success: false, output: '', error: '缺少 appId/appSecret 配置' }
      }

      const title = input.TITLE
      const content = input.CONTENT
      if (!title || !content) {
        return { success: false, output: '', error: '缺少 TITLE 或 CONTENT 参数' }
      }

      const thumbUrl = input.THUMB_URL
      const thumbBase64 = input.THUMB_BASE64
      if (!thumbUrl && !thumbBase64) {
        return { success: false, output: '', error: '缺少 THUMB_URL 或 THUMB_BASE64（封面图）' }
      }

      try {
        const accessToken = await getAccessToken(appId, appSecret)

        // 上传正文图片（如果有 IMAGE_BASE64）
        let finalContent = content
        const imageBase64 = input.IMAGE_BASE64
        let contentImageUrl = ''
        if (imageBase64 && input.SKIP_CONTENT_IMAGE_UPLOAD !== 'true') {
          const imgBuffer = Buffer.from(imageBase64, 'base64')
          contentImageUrl = await uploadContentImage(accessToken, imgBuffer, 'image/png')
          // 替换 content 中的占位符，或追加图片到正文
          if (finalContent.includes('{{IMAGE_URL}}')) {
            finalContent = finalContent.replace(/\{\{IMAGE_URL\}\}/g, contentImageUrl)
          } else {
            // 没有占位符则在正文开头插入图片
            finalContent = `<p style="text-align:center;"><img src="${contentImageUrl}" style="width:100%;max-width:600px;" /></p>\n${finalContent}`
          }
        } else if (finalContent.includes('{{IMAGE_URL}}')) {
          finalContent = finalContent.replace(/\{\{IMAGE_URL\}\}/g, '')
        }

        // 上传封面图：优先用 URL，避免部分生成图片的 PNG 编码/元数据被微信素材接口拒绝
        let buffer: Buffer
        let contentType: string
        if (thumbUrl) {
          const downloaded = await downloadImage(thumbUrl!)
          buffer = downloaded.buffer
          contentType = downloaded.contentType
        } else {
          buffer = Buffer.from(thumbBase64!, 'base64')
          contentType = 'image/png'
        }
        const thumbMediaId = await uploadThumbMaterial(accessToken, buffer, contentType)

        // 创建草稿
        const mediaId = await createDraft(accessToken, {
          title,
          content: finalContent,
          thumb_media_id: thumbMediaId,
          author: input.AUTHOR,
          digest: input.DIGEST,
        })

        return {
          success: true,
          output: JSON.stringify({
            media_id: mediaId,
            image_url: contentImageUrl || undefined,
            msg: '草稿已创建，请在公众号后台确认发布',
          }),
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        return { success: false, output: '', error }
      }
    },
  }
}
