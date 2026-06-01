/**
 * 热梗漫画 Pipeline 端到端 Demo
 * 跳过 AI 步骤，用模拟数据测试 image-gen → wechat-mp 全流程
 *
 * 运行: npx tsx scripts/demo-meme-pipeline.ts
 */

import { createImageGenProvider } from '../src/lib/providers/image-gen'
import { createWechatMpProvider } from '../src/lib/providers/wechat-mp'

const IMAGE_GEN_CONFIG = {
  apiKey: process.env.IMAGE_GEN_API_KEY || '',
  baseUrl: process.env.IMAGE_GEN_BASE_URL || 'https://xiaomuai.cn/v1',
  model: process.env.IMAGE_GEN_MODEL || 'gpt-image-2',
  size: '1024x1024',
  quality: 'high',
}

const WECHAT_CONFIG = {
  appId: process.env.WECHAT_MP_APP_ID || '',
  appSecret: process.env.WECHAT_MP_APP_SECRET || '',
}

// 模拟 planner 输出
const MOCK_PLAN = {
  selected_meme: '程序员看到 AI 写的代码',
  title: '当程序员看到 AI 写的代码... | 热梗漫画',
  digest: 'AI 写代码翻车现场',
  combined_image_prompt: `A 4-panel comic strip, 2x2 grid layout. Panel 1: A confident programmer asks AI to write code. Panel 2: AI shows a wall of code, programmer impressed. Panel 3: Code runs with errors everywhere, programmer shocked. Panel 4: Programmer debugging at 3am with coffee cups. Style: manga comic, vibrant colors, humorous.`,
}

async function run() {
  console.log('=== 热梗漫画 Pipeline Demo ===\n')

  // Step 1: 生成漫画图片（暂时跳过，用占位图）
  console.log('[1/3] 生成漫画图片...')
  let imageUrl = ''
  let imageBase64 = ''

  const imageGen = createImageGenProvider()
  const imageResult = await imageGen.execute(
    { PROMPT: MOCK_PLAN.combined_image_prompt },
    IMAGE_GEN_CONFIG,
  )

  if (!imageResult.success) {
    console.log('  图片生成跳过（API 限制）:', imageResult.error)
    console.log('  使用占位图继续测试公众号流程...')
    imageUrl = 'https://picsum.photos/1024/1024'
  } else {
    const imageData = JSON.parse(imageResult.output)
    imageUrl = imageData.url || ''
    imageBase64 = imageData.b64_json || ''
    if (imageBase64) {
      console.log('  图片生成成功! (base64, 长度:', imageBase64.length, ')')
    } else {
      console.log('  图片生成成功! URL:', imageUrl.slice(0, 80) + '...')
    }
  }

  // Step 2: 排版（模拟 formatter 输出）
  console.log('\n[2/3] 排版公众号图文...')
  const htmlContent = `
<section style="text-align:center;padding:20px;">
  <h2 style="color:#333;font-size:20px;">${MOCK_PLAN.title}</h2>
  <p style="color:#666;font-size:14px;margin:10px 0;">今日热梗：${MOCK_PLAN.selected_meme}</p>
  <p style="text-align:center;"><img src="{{IMAGE_URL}}" style="width:100%;max-width:600px;border-radius:8px;margin:15px 0;" /></p>
  <p style="color:#666;font-size:13px;line-height:1.8;text-align:left;padding:0 10px;">
    第一格：程序员自信满满地问 AI 帮忙写代码<br/>
    第二格：AI 输出一大段代码，程序员眼冒星星<br/>
    第三格：运行代码，满屏报错，程序员震惊<br/>
    第四格：凌晨三点还在 debug，桌上全是咖啡杯
  </p>
  <p style="color:#999;font-size:12px;margin-top:20px;">#热梗漫画 #AI段子 #程序员日常</p>
  <p style="color:#999;font-size:12px;">关注「夜猫子agent工坊」，每日一更热梗漫画</p>
</section>`
  console.log('  排版完成，HTML 长度:', htmlContent.length)

  // Step 3: 发布到公众号草稿箱
  console.log('\n[3/3] 发布到公众号草稿箱...')
  const wechatMp = createWechatMpProvider()
  const publishInput: Record<string, string> = {
    TITLE: MOCK_PLAN.title,
    CONTENT: htmlContent,
    DIGEST: MOCK_PLAN.digest,
    AUTHOR: '夜猫子agent工坊',
  }
  // 封面 + 正文图片都用同一张
  if (imageBase64) {
    publishInput.THUMB_BASE64 = imageBase64
    publishInput.IMAGE_BASE64 = imageBase64
  } else {
    publishInput.THUMB_URL = imageUrl
  }

  const publishResult = await wechatMp.execute(publishInput, WECHAT_CONFIG)

  if (!publishResult.success) {
    console.error('发布失败:', publishResult.error)
    process.exit(1)
  }

  const publishData = JSON.parse(publishResult.output)
  console.log('  草稿创建成功!')
  console.log('  media_id:', publishData.media_id)
  console.log('\n=== Demo 完成 ===')
  console.log('请登录公众号后台查看草稿箱：https://mp.weixin.qq.com')
}

run().catch(err => {
  console.error('Demo 失败:', err)
  process.exit(1)
})
