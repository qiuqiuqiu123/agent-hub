import { db } from '../src/db'
import { schedules } from '../src/db/schema'
import { generateId } from '../src/lib/constants'

async function main() {
  const id = generateId()

  await db.insert(schedules).values({
    id,
    pipelineId: 'pipeline-meme-comic',
    name: '每日热梗漫画',
    cron: '0 10 * * *',
    input: '{}',
    enabled: true,
  })

  console.log(`✓ 定时任务已创建: ${id}`)
  console.log('  名称: 每日热梗漫画')
  console.log('  Cron: 0 10 * * * (每天早上10点)')
}

main().catch((err) => {
  console.error('创建定时任务失败:', err)
  process.exit(1)
})
