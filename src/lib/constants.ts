export function generateId(): string {
  return crypto.randomUUID()
}

export const TASK_STATUS_LABELS: Record<string, string> = {
  pending: '待执行',
  running: '执行中',
  paused: '暂停中',
  completed: '已完成',
  unknown: '未知',
}

export const TASK_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-200 text-gray-700',
  running: 'bg-blue-200 text-blue-700',
  paused: 'bg-yellow-200 text-yellow-700',
  completed: 'bg-green-200 text-green-700',
  unknown: 'bg-red-200 text-red-700',
}
