export async function register() {
  // 仅在 Node.js server runtime 中初始化调度器
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initScheduler } = await import('@/lib/scheduler')
    await initScheduler()
  }
}
