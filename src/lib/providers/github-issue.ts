import type { ToolProvider, ToolResult } from './types'

/**
 * GitHub Issue Tool Provider
 * 支持创建 issue、更新 issue、添加 comment
 *
 * config 需要：
 *   token — GitHub Personal Access Token
 *   owner — 仓库 owner
 *   repo — 仓库名
 *
 * input 参数：
 *   ACTION — "create" | "update" | "comment"
 *   TITLE — issue 标题（create 必需）
 *   BODY — issue 内容或 comment 内容
 *   ISSUE_NUMBER — issue 编号（update/comment 必需）
 *   LABELS — 逗号分隔的标签（可选）
 */

export function createGithubIssueProvider(): ToolProvider {
  return {
    name: 'github-issue',
    async execute(input: Record<string, string>, config: Record<string, string>): Promise<ToolResult> {
      const { token, owner, repo } = config
      if (!token || !owner || !repo) {
        return { success: false, output: '', error: '缺少 token/owner/repo 配置' }
      }

      const action = input.ACTION || 'create'
      const headers = {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      }
      const baseUrl = `https://api.github.com/repos/${owner}/${repo}`

      if (action === 'create') {
        const title = input.TITLE
        if (!title) {
          return { success: false, output: '', error: '创建 issue 需要 TITLE' }
        }
        const body: Record<string, unknown> = { title, body: input.BODY || '' }
        if (input.LABELS) {
          body.labels = input.LABELS.split(',').map(l => l.trim())
        }

        const resp = await fetch(`${baseUrl}/issues`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        })
        const data = await resp.json() as { number?: number; html_url?: string; message?: string }
        if (!resp.ok) {
          return { success: false, output: '', error: `GitHub API: ${data.message}` }
        }
        return { success: true, output: `#${data.number} ${data.html_url}` }
      }

      if (action === 'update') {
        const issueNumber = input.ISSUE_NUMBER
        if (!issueNumber) {
          return { success: false, output: '', error: '更新 issue 需要 ISSUE_NUMBER' }
        }
        const body: Record<string, unknown> = {}
        if (input.TITLE) body.title = input.TITLE
        if (input.BODY) body.body = input.BODY
        if (input.LABELS) body.labels = input.LABELS.split(',').map(l => l.trim())

        const resp = await fetch(`${baseUrl}/issues/${issueNumber}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(body),
        })
        const data = await resp.json() as { html_url?: string; message?: string }
        if (!resp.ok) {
          return { success: false, output: '', error: `GitHub API: ${data.message}` }
        }
        return { success: true, output: `Updated: ${data.html_url}` }
      }

      if (action === 'comment') {
        const issueNumber = input.ISSUE_NUMBER
        const commentBody = input.BODY
        if (!issueNumber || !commentBody) {
          return { success: false, output: '', error: 'comment 需要 ISSUE_NUMBER 和 BODY' }
        }

        const resp = await fetch(`${baseUrl}/issues/${issueNumber}/comments`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ body: commentBody }),
        })
        const data = await resp.json() as { id?: number; html_url?: string; message?: string }
        if (!resp.ok) {
          return { success: false, output: '', error: `GitHub API: ${data.message}` }
        }
        return { success: true, output: `Comment added: ${data.html_url}` }
      }

      return { success: false, output: '', error: `未知 ACTION: ${action}` }
    },
  }
}
